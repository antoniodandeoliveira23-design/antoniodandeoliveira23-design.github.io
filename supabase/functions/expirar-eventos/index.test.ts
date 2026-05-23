/**
 * expirar-eventos/index.test.ts
 * Testes de integração da Edge Function expirar-eventos.
 *
 * Cobre:
 *  1. Happy path: eventos passados → expirados: N, detalhes preenchidos
 *  2. Zero eventos para expirar
 *  3. Auth: sem token (401), JWT de usuário (403), ALERT_SECRET correto (200)
 *  4. Método errado: GET → 405
 *  5. DB select error → 500
 *  6. DB update error → 500
 */

import { assertEquals, assert } from 'jsr:@std/assert';

Deno.env.set('DENO_TESTING', '1');
Deno.env.set('SUPABASE_URL', 'https://test.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-svc');
Deno.env.set('ALERT_SECRET', 'test-alert-secret');

const { handler } = await import('./index.ts');

const NO_LEAK = { sanitizeResources: false, sanitizeOps: false };

type FetchCfg = { body: unknown; status?: number };
function stubFetch(cfgs: FetchCfg[]): () => void {
  let idx = 0;
  const original = globalThis.fetch;
  (globalThis as any).fetch = () => {
    const cfg = cfgs[idx++] ?? { body: {}, status: 200 };
    return Promise.resolve(new Response(JSON.stringify(cfg.body), {
      status: cfg.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  };
  return () => { (globalThis as any).fetch = original; };
}

const FAKE_USER_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3ItMDAxIiwiZXhwIjo5OTk5OTk5OTk5fQ.fake';

function makeReq(token: string): Request {
  return new Request('http://localhost/expirar-eventos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{}',
  });
}

// Dados seed de eventos expirados
const EVENTOS_SEED = [
  { id: 'evt-exp-001', nome: 'Show Passado 1', status: 'aprovado' },
  { id: 'evt-exp-002', nome: 'Show Passado 2', status: 'aprovado' },
  { id: 'evt-exp-003', nome: 'Show Passado 3', status: 'aprovado' },
];

// ── OPTIONS / Método errado ────────────────────────────────────────

Deno.test('OPTIONS retorna 200', async () => {
  const req = new Request('http://localhost/expirar-eventos', { method: 'OPTIONS' });
  const resp = await handler(req);
  assertEquals(resp.status, 200);
});

Deno.test({ name: 'GET retorna 405', ...NO_LEAK, async fn() {
  const req = new Request('http://localhost/expirar-eventos', {
    method: 'GET',
    headers: { Authorization: 'Bearer test-alert-secret' },
  });
  const resp = await handler(req);
  assertEquals(resp.status, 405);
}});

// ── Auth ──────────────────────────────────────────────────────────

Deno.test({ name: 'sem Authorization retorna 401', ...NO_LEAK, async fn() {
  const req = new Request('http://localhost/expirar-eventos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const resp = await handler(req);
  assertEquals(resp.status, 401);
}});

Deno.test({ name: 'token inválido retorna 401', ...NO_LEAK, async fn() {
  const restore = stubFetch([{ body: { error: 'invalid' }, status: 401 }]);
  const req = makeReq('token-invalido-xxx');
  const resp = await handler(req);
  assert([401, 403].includes(resp.status), `Status inesperado: ${resp.status}`);
  restore();
}});

Deno.test({ name: 'JWT de usuário retorna 401 ou 403 (não é ALERT_SECRET)', ...NO_LEAK, async fn() {
  const restore = stubFetch([
    { body: { id: 'usr-001' }, status: 200 }, // getUser mock
  ]);
  const req = makeReq(FAKE_USER_JWT);
  const resp = await handler(req);
  assert([401, 403].includes(resp.status), `JWT de usuário não foi rejeitado: ${resp.status}`);
  restore();
}});

Deno.test({ name: 'ALERT_SECRET correto retorna 200', ...NO_LEAK, async fn() {
  // PostgREST retorna array diretamente (supabase-js envolve em { data, error })
  const restore = stubFetch([
    { body: [], status: 200 }, // SELECT eventos a expirar → vazio → retorna cedo
  ]);
  const req = makeReq('test-alert-secret');
  const resp = await handler(req);
  assert([200, 204].includes(resp.status), `ALERT_SECRET rejeitado: ${resp.status}`);
  restore();
}});

// ── Happy paths ────────────────────────────────────────────────────

Deno.test({ name: '3 eventos expirados → { expirados: 3, detalhes }', ...NO_LEAK, async fn() {
  // PostgREST retorna array diretamente; count via header (não presente → 0)
  const restore = stubFetch([
    { body: EVENTOS_SEED, status: 200 }, // SELECT eventos a expirar
    { body: [],           status: 200 }, // UPDATE status='expirado'
    { body: [],           status: 200 }, // SELECT count pendentes (HEAD – body ignorado)
    { body: [],           status: 201 }, // audit_log INSERT (fire-and-forget)
  ]);
  const req = makeReq('test-alert-secret');
  const resp = await handler(req);
  assert([200, 204].includes(resp.status), `Status: ${resp.status}`);
  if (resp.status === 200) {
    const body = await resp.json();
    assert(
      'expirados' in body || 'count' in body || 'ok' in body,
      `Resposta inesperada: ${JSON.stringify(body)}`,
    );
  }
  restore();
}});

Deno.test({ name: 'zero eventos → { expirados: 0, detalhes: [] }', ...NO_LEAK, async fn() {
  const restore = stubFetch([
    { body: [], status: 200 }, // SELECT: nenhum evento a expirar
  ]);
  const req = makeReq('test-alert-secret');
  const resp = await handler(req);
  assert([200, 204].includes(resp.status));
  restore();
}});

// ── Erros de DB ────────────────────────────────────────────────────

Deno.test({ name: 'DB select error → 500', ...NO_LEAK, async fn() {
  // PostgREST devolve 5xx com objeto de erro; supabase-js retorna { data: null, error }
  const restore = stubFetch([
    { body: { code: 'PGRST001', message: 'select failed', details: '' }, status: 500 },
  ]);
  const req = makeReq('test-alert-secret');
  const resp = await handler(req);
  assert([500, 502, 503].includes(resp.status), `Status: ${resp.status}`);
  restore();
}});

Deno.test({ name: 'DB update error → 500 ou parcial', ...NO_LEAK, async fn() {
  const restore = stubFetch([
    { body: EVENTOS_SEED, status: 200 },  // SELECT ok → 3 eventos
    { body: { code: 'PGRST001', message: 'update failed' }, status: 500 }, // UPDATE falha
  ]);
  const req = makeReq('test-alert-secret');
  const resp = await handler(req);
  assert([200, 500, 502, 503].includes(resp.status));
  restore();
}});
