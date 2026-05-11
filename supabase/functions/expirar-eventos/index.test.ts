/**
 * expirar-eventos/index.test.ts
 *
 * Testes do job de expiração de eventos:
 *  - handler — autenticação, não-admin bloqueado, expiração com sucesso, erro interno
 *  - expirarEventos — sem eventos a expirar, com eventos, erro no banco
 */

import { assertEquals, assert, assertStringIncludes } from 'jsr:@std/assert';

// ── Setup ─────────────────────────────────────────────────────────
Deno.env.set('DENO_TESTING', '1');
Deno.env.set('SUPABASE_URL', 'https://test.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-svc');
Deno.env.set('ALERT_SECRET', 'segredo-cron');
Deno.env.set('ADMIN_EMAIL', 'admin@agora.app');
Deno.env.set('APP_URL', 'https://agora-vilhena.vercel.app');

const { handler, expirarEventos } = await import('./index.ts');

const NO_LEAK = { sanitizeResources: false, sanitizeOps: false };

// ── Helpers ────────────────────────────────────────────────────────

type FetchCfg = { body: unknown; status?: number };
function stubFetch(cfgs: FetchCfg[]): () => void {
  let idx = 0;
  const original = globalThis.fetch;
  (globalThis as any).fetch = () => {
    const cfg = cfgs[idx++] ?? { body: {}, status: 200 };
    return Promise.resolve(
      new Response(JSON.stringify(cfg.body), {
        status: cfg.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };
  return () => { (globalThis as any).fetch = original; };
}

/** Request autenticado como sistema via ALERT_SECRET */
function makeSistemaReq(): Request {
  return new Request('http://localhost/expirar-eventos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'authorization': 'Bearer segredo-cron',
    },
    body: '{}',
  });
}

/** Request autenticado como usuário normal (JWT mockado) */
function makeUsuarioReq(token: string): Request {
  return new Request('http://localhost/expirar-eventos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'authorization': `Bearer ${token}`,
    },
    body: '{}',
  });
}

// ── handler — OPTIONS ──────────────────────────────────────────────

Deno.test('handler - OPTIONS retorna 200', async () => {
  const req = new Request('http://localhost/', { method: 'OPTIONS' });
  const resp = await handler(req);
  assertEquals(resp.status, 200);
});

// ── handler — sem autenticação ─────────────────────────────────────

Deno.test({
  name: 'handler - sem Authorization retorna 401',
  ...NO_LEAK,
  async fn() {
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const resp = await handler(req);
    assertEquals(resp.status, 401);
  },
});

// ── handler — usuário não-admin bloqueado ──────────────────────────

Deno.test({
  name: 'handler - usuário não-admin retorna 403',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([
      { body: { id: 'usr-comum', email: 'comum@teste.com' }, status: 200 },
      { body: { tipo_conta: 'pf' }, status: 200 },
    ]);
    const req = makeUsuarioReq('jwt-nao-admin');
    const resp = await handler(req);
    assert(resp.status === 401 || resp.status === 403, `Esperava 401 ou 403, obteve ${resp.status}`);
    restore();
  },
});

// ── handler — sistema autenticado com ALERT_SECRET ─────────────────

Deno.test({
  name: 'handler - sistema via ALERT_SECRET executa expiração com sucesso',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([
      { body: [], status: 200 },
      { body: null, status: 200 },
      { body: {}, status: 201 },
      { body: { ok: true }, status: 200 },
    ]);
    const resp = await handler(makeSistemaReq());
    assertEquals(resp.status, 200);
    const data = await resp.json();
    assertEquals(data.ok, true);
    assertEquals(data.expirados, 0);
    restore();
  },
});

Deno.test({
  name: 'handler - expira eventos encontrados e retorna contagem',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([
      {
        body: [
          { id: 'evt-1', nome: 'Evento Passado 1', data_inicio: '2026-01-01T00:00:00Z' },
          { id: 'evt-2', nome: 'Evento Passado 2', data_inicio: '2026-01-02T00:00:00Z' },
        ],
        status: 200,
      },
      { body: {}, status: 200 },
      { body: null, status: 200 },
      { body: {}, status: 201 },
      { body: { ok: true }, status: 200 },
    ]);
    const resp = await handler(makeSistemaReq());
    assertEquals(resp.status, 200);
    const data = await resp.json();
    assertEquals(data.ok, true);
    assertEquals(data.expirados, 2);
    restore();
  },
});

// ── handler — erro interno ─────────────────────────────────────────

Deno.test({
  name: 'handler - erro no banco retorna 500',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([
      { body: { message: 'connection refused' }, status: 500 },
      { body: {}, status: 201 },
    ]);
    const resp = await handler(makeSistemaReq());
    assertEquals(resp.status, 500);
    const data = await resp.json();
    assertStringIncludes(data.error ?? '', 'Erro');
    restore();
  },
});

// ── expirarEventos — sem eventos ───────────────────────────────────

Deno.test({
  name: 'expirarEventos - retorna expirados=0 quando não há eventos passados',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([
      { body: [], status: 200 },
      { body: null, status: 200 },
      { body: {}, status: 201 },
    ]);
    const resultado = await expirarEventos();
    assertEquals(resultado.expirados, 0);
    assertEquals(resultado.detalhes.length, 0);
    restore();
  },
});

Deno.test({
  name: 'expirarEventos - retorna detalhes dos eventos expirados',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([
      {
        body: [
          { id: 'e-1', nome: 'Show', data_inicio: '2026-01-10T00:00:00Z' },
          { id: 'e-2', nome: 'Feira', data_inicio: '2026-01-11T00:00:00Z' },
          { id: 'e-3', nome: 'Palestra', data_inicio: '2026-01-12T00:00:00Z' },
        ],
        status: 200,
      },
      { body: {}, status: 200 },
      { body: null, status: 200 },
      { body: {}, status: 201 },
    ]);
    const resultado = await expirarEventos();
    assertEquals(resultado.expirados, 3);
    assertEquals(resultado.detalhes.length, 3);
    assert(resultado.detalhes.some(d => d.nome === 'Show'));
    restore();
  },
});

Deno.test({
  name: 'expirarEventos - lança quando supabase retorna error na busca',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([
      { body: { message: 'db fail' }, status: 500 },
    ]);
    let threw = false;
    try {
      await expirarEventos();
    } catch {
      threw = true;
    }
    assert(threw, 'expirarEventos deveria ter lançado');
    restore();
  },
});

Deno.test({
  name: 'expirarEventos - ts é uma string ISO válida',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([
      { body: [], status: 200 },
      { body: null, status: 200 },
      { body: {}, status: 201 },
    ]);
    const resultado = await expirarEventos();
    assert(!isNaN(Date.parse(resultado.ts)), 'ts deve ser uma data ISO válida');
    restore();
  },
});
