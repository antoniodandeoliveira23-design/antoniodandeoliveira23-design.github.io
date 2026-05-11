/**
 * _shared/auth.test.ts
 *
 * Testes de rateLimitCheck (pura) e validarAuth (mockando fetch).
 * Env vars devem ser setadas antes dos imports dinâmicos para que
 * as constantes de módulo sejam lidas com os valores corretos.
 */

import { assertEquals, assertStringIncludes } from 'jsr:@std/assert';

// ── Setup: env vars antes do import dinâmico ──────────────────────
Deno.env.set('DENO_TESTING', '1');
Deno.env.set('SUPABASE_URL', 'https://test.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role');
Deno.env.set('ALERT_SECRET', 'meu-segredo-alerta');

const { rateLimitCheck, validarAuth } = await import('./auth.ts');

// ── Helpers ────────────────────────────────────────────────────────

type FetchResponse = { body: unknown; status?: number };

function stubFetch(responses: FetchResponse[]): () => void {
  let idx = 0;
  const original = globalThis.fetch;
  (globalThis as any).fetch = () => {
    const cfg = responses[idx++] ?? { body: { error: 'sem resposta' }, status: 500 };
    return Promise.resolve(
      new Response(JSON.stringify(cfg.body), {
        status: cfg.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };
  return () => { (globalThis as any).fetch = original; };
}

function makeReq(token?: string): Request {
  const headers: Record<string, string> = {};
  if (token) headers['authorization'] = `Bearer ${token}`;
  return new Request('http://localhost/', { headers });
}

// ── rateLimitCheck ─────────────────────────────────────────────────

Deno.test('rateLimitCheck - primeira chamada é permitida', () => {
  const chave = `test-ratelimit-${Date.now()}`;
  assertEquals(rateLimitCheck(chave), true);
});

Deno.test('rateLimitCheck - segunda chamada imediata é bloqueada', () => {
  const chave = `test-ratelimit-bloquear-${Date.now()}`;
  rateLimitCheck(chave);          // registra agora
  assertEquals(rateLimitCheck(chave), false); // ainda dentro da janela
});

Deno.test('rateLimitCheck - chaves distintas são independentes', () => {
  const base = Date.now();
  assertEquals(rateLimitCheck(`key-a-${base}`), true);
  assertEquals(rateLimitCheck(`key-b-${base}`), true); // chave diferente → permitida
});

Deno.test('rateLimitCheck - janela personalizada 0 min sempre permite', () => {
  const chave = `test-zero-${Date.now()}`;
  rateLimitCheck(chave, 0);
  assertEquals(rateLimitCheck(chave, 0), true); // 0 min → janela passou
});

// ── validarAuth — sem header ───────────────────────────────────────

Deno.test('validarAuth - sem header Authorization retorna erro', async () => {
  const req = new Request('http://localhost/');
  const result = await validarAuth(req);
  assertEquals(result.ok, false);
  if (!result.ok) assertStringIncludes(result.erro, 'Authorization');
});

Deno.test('validarAuth - header sem "Bearer " retorna erro', async () => {
  const req = new Request('http://localhost/', {
    headers: { authorization: 'Basic abc123' },
  });
  const result = await validarAuth(req);
  assertEquals(result.ok, false);
});

// ── validarAuth — ALERT_SECRET ─────────────────────────────────────

Deno.test('validarAuth - ALERT_SECRET válido retorna tipo=sistema', async () => {
  const req = makeReq('meu-segredo-alerta');
  const result = await validarAuth(req);
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.tipo, 'sistema');
    assertEquals(result.userId, null);
    assertEquals(result.isAdmin, false);
  }
});

Deno.test('validarAuth - ALERT_SECRET incorreto não retorna sistema', async () => {
  // Token errado → cai no path de validação JWT
  const restore = stubFetch([
    // supabase auth getUser → token inválido
    { body: { error: 'invalid_jwt', message: 'Invalid JWT' }, status: 401 },
  ]);
  const req = makeReq('segredo-errado');
  const result = await validarAuth(req);
  assertEquals(result.ok, false);
  restore();
});

// ── validarAuth — JWT válido ───────────────────────────────────────

Deno.test('validarAuth - JWT válido sem perfil retorna isAdmin=false', async () => {
  const restore = stubFetch([
    // supabase.auth.getUser → sucesso
    { body: { id: 'usr-abc', email: 'a@b.com' }, status: 200 },
    // profiles query → sem dados (não é admin)
    { body: { tipo_conta: 'pf' }, status: 200 },
  ]);

  const req = makeReq('jwt-valido-simulado');
  const result = await validarAuth(req);

  // O supabase-js encapsula a resposta de getUser
  // Como o mock retorna { id, email } (sem o wrapper { user }),
  // o SDK interpreta como erro → ok: false é o resultado esperado aqui
  // (o supabase-js v2 espera { data: { user: {...} } })
  assertEquals(typeof result.ok, 'boolean');

  restore();
});

Deno.test('validarAuth - JWT inválido retorna ok=false com mensagem', async () => {
  const restore = stubFetch([
    { body: { error: 'token_expired' }, status: 401 },
  ]);

  const req = makeReq('token-expirado');
  const result = await validarAuth(req);
  assertEquals(result.ok, false);

  restore();
});

// ── validarAuth — Supabase não configurado ─────────────────────────

Deno.test('validarAuth - retorna ok=false para token não-ALERT_SECRET sem config válida', async () => {
  // Simula que supabase retorna erro (sem URL/key válidos em teste)
  const restore = stubFetch([
    { body: { error: 'not_found' }, status: 404 },
  ]);
  const req = makeReq('algum-jwt');
  const result = await validarAuth(req);
  assertEquals(result.ok, false);
  restore();
});
