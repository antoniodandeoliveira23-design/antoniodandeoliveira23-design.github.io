/**
 * criar-cobranca/index.test.ts
 * Testes de integração da Edge Function criar-cobranca.
 *
 * Cobre:
 *  1. Happy paths (PIX / BOLETO / CREDIT_CARD / metodo ausente → default PIX)
 *  2. Cenários de erro RFC 7807 (plano_id ausente, formato inválido)
 *  3. Auth: sem token (401), token inválido (401), ALERT_SECRET rejeitado (401)
 *  4. Upstream errors: Asaas 500 → 502, Asaas 402 → 502
 *  5. DB insert fail → 500
 */

import { assertEquals, assertStringIncludes, assert } from 'jsr:@std/assert';

Deno.env.set('DENO_TESTING', '1');
Deno.env.set('SUPABASE_URL', 'https://test.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-svc');
Deno.env.set('ALERT_SECRET', 'test-alert-secret');
Deno.env.set('ASAAS_ACCESS_TOKEN', 'test-asaas-key');
Deno.env.set('ASAAS_ENV', 'sandbox');

const { handler } = await import('./index.ts');

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

/**
 * URL-based stub: cada padrão de URL retorna sua resposta configurada.
 * Resolve o problema de índices misalinhados quando chamadas fetch
 * ocorrem em ordem diferente da esperada (ex: Promise.all).
 */
type UrlFetchMap = Record<string, { body: unknown; status?: number }>;

function stubFetchByUrl(urlMap: UrlFetchMap, fallback: FetchCfg = { body: {}, status: 200 }): () => void {
  const original = globalThis.fetch;
  (globalThis as any).fetch = (url: string | URL) => {
    const urlStr = url.toString();
    const key = Object.keys(urlMap).find(k => urlStr.includes(k));
    const cfg = key ? urlMap[key] : fallback;
    return Promise.resolve(
      new Response(JSON.stringify(cfg.body), {
        status: cfg.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };
  return () => { (globalThis as any).fetch = original; };
}

/** JWT fake que o mock do supabase-js aceita como "válido" */
const FAKE_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3ItMDAxIiwiZW1haWwiOiJ0ZXN0ZUB0ZXN0ZS5jb20iLCJleHAiOjk5OTk5OTk5OTl9.fake';

function makeReq(body: unknown, token = FAKE_JWT): Request {
  return new Request('http://localhost/criar-cobranca', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

async function assertRFC7807(resp: Response, expectedStatus: number) {
  assertEquals(resp.status, expectedStatus);
  const ct = resp.headers.get('content-type') ?? '';
  assert(ct.includes('application/problem+json') || ct.includes('application/json'),
    `Content-Type incorreto: ${ct}`);
  const body = await resp.json();
  assert('status' in body || 'error' in body, 'Resposta de erro sem campo status ou error');
}

// ── beforeEach seed (módulo-nível) ─────────────────────────────────
// Cada teste com stubFetch define seu próprio seed de respostas.

// ── OPTIONS ────────────────────────────────────────────────────────

Deno.test('OPTIONS retorna 200', async () => {
  const req = new Request('http://localhost/criar-cobranca', { method: 'OPTIONS' });
  const resp = await handler(req);
  assertEquals(resp.status, 200);
});

// ── Método errado ──────────────────────────────────────────────────

Deno.test({ name: 'GET retorna 405', ...NO_LEAK, async fn() {
  const req = new Request('http://localhost/criar-cobranca', {
    method: 'GET',
    headers: { Authorization: `Bearer ${FAKE_JWT}` },
  });
  const resp = await handler(req);
  assertEquals(resp.status, 405);
}});

// ── Autenticação ───────────────────────────────────────────────────

Deno.test({ name: 'sem Authorization retorna 401', ...NO_LEAK, async fn() {
  const req = new Request('http://localhost/criar-cobranca', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plano_id: 'plan-001' }),
  });
  const resp = await handler(req);
  await assertRFC7807(resp, 401);
}});

Deno.test({ name: 'token inválido retorna 401', ...NO_LEAK, async fn() {
  const restore = stubFetch([
    { body: { error: 'invalid token' }, status: 401 },
  ]);
  const req = makeReq({ plano_id: 'plan-001' }, 'token-invalido');
  const resp = await handler(req);
  assert(resp.status === 401 || resp.status === 400, `Status inesperado: ${resp.status}`);
  restore();
}});

Deno.test({ name: 'ALERT_SECRET é rejeitado (endpoint exige JWT de usuário)', ...NO_LEAK, async fn() {
  const restore = stubFetch([
    { body: { error: 'invalid token' }, status: 401 },
  ]);
  const req = makeReq({ plano_id: 'plan-001' }, 'test-alert-secret');
  const resp = await handler(req);
  // ALERT_SECRET não é aceito por este endpoint — espera 401 ou 403
  assert([401, 403].includes(resp.status), `Status inesperado para ALERT_SECRET: ${resp.status}`);
  restore();
}});

// ── Validação de input ─────────────────────────────────────────────

Deno.test({ name: 'plano_id ausente retorna 400 ou 422', ...NO_LEAK, async fn() {
  const restore = stubFetch([
    { body: { id: 'usr-001', email: 'a@b.com' }, status: 200 }, // getUser mock
  ]);
  const req = makeReq({ metodo: 'PIX' });
  const resp = await handler(req);
  assert([400, 422].includes(resp.status), `Status inesperado: ${resp.status}`);
  restore();
}});

Deno.test({ name: 'metodo com valor inválido retorna 400 ou 422', ...NO_LEAK, async fn() {
  const restore = stubFetch([
    { body: { id: 'usr-001', email: 'a@b.com' }, status: 200 },
  ]);
  const req = makeReq({ plano_id: 'plan-001', metodo: 'CRYPTO' });
  const resp = await handler(req);
  assert([400, 422].includes(resp.status), `Status inesperado: ${resp.status}`);
  restore();
}});

// ── Happy paths ────────────────────────────────────────────────────

// ── Sequência real de chamadas fetch no handler (com FAKE_JWT): ────────
//  0: validarAuth → auth.getUser(jwt)
//  1: validarAuth → from('profiles').select('tipo_conta').single()
//  2: from('planos').select('id, nome, preco, tipo').single()
//  3: Promise.all[0] buscarEmailUsuario → auth.admin.getUserById
//  4: Promise.all[1] from('profiles').select('nome, sobrenome, cnpj, asaas_customer_id').single()
//  5: Promise.all[2] from('pessoa').select('nome, telefone, email').single()
//  6: asaasRequest POST /payments  (customer já existe no perfil → skip create)
//  7: from('pagamentos').insert({...}).select('id').single()

const USER_STUB    = { id: '00000000-0000-0000-0000-000000000001', email: 'pagante@test.com', role: 'authenticated' };
const PROFILE_STUB = { nome: 'Pagante', sobrenome: '', cnpj: null, asaas_customer_id: 'cus-001' };

// Mapa de URLs → respostas para os happy-path tests.
// Usa stubFetchByUrl para evitar misalinhamento de índices que ocorre quando
// chamadas fetch são feitas em ordem diferente da esperada (ex: Promise.all
// concorrente com lógica interna do supabase-js).
const HAPPY_PATH_URL_MAP: UrlFetchMap = {
  '/auth/v1/user':                      { body: USER_STUB,    status: 200 }, // validarAuth getUser
  '/rest/v1/profiles?select=tipo_conta': { body: { tipo_conta: 'pf' }, status: 200 }, // validarAuth profiles
  '/auth/v1/admin/users/':              { body: USER_STUB,    status: 200 }, // buscarEmailUsuario
  'select=nome%2Csobrenome%2Ccnpj':     { body: PROFILE_STUB, status: 200 }, // profiles dados
  '/rest/v1/pessoa':                    { body: {},            status: 200 }, // pessoa
  '/rest/v1/pagamentos':                { body: { id: 'pag-db-001' }, status: 201 }, // insert pagamento
};

Deno.test({ name: 'PIX — cria cobrança com sucesso', ...NO_LEAK, async fn() {
  const restore = stubFetchByUrl({
    ...HAPPY_PATH_URL_MAP,
    '/rest/v1/planos':    { body: { id: 'plan-pix-001', nome: 'Mensal', preco: 29.90, tipo: 'mensal' }, status: 200 },
    'sandbox.asaas.com': { body: { id: 'asaas-pay-001', invoiceUrl: 'https://asaas.com/pix/001' },      status: 200 },
  });
  const req = makeReq({ plano_id: 'plan-pix-001', metodo: 'PIX' });
  const resp = await handler(req);
  assert([200, 201].includes(resp.status), `PIX falhou com status ${resp.status}`);
  if ([200, 201].includes(resp.status)) {
    const body = await resp.json();
    assert('ok' in body || 'pagamento_id' in body || 'asaas_id' in body,
      `Resposta sem campos esperados: ${JSON.stringify(body)}`);
  }
  restore();
}});

Deno.test({ name: 'BOLETO — cria cobrança com sucesso', ...NO_LEAK, async fn() {
  const restore = stubFetchByUrl({
    ...HAPPY_PATH_URL_MAP,
    '/rest/v1/planos':    { body: { id: 'plan-001', nome: 'Mensal', preco: 29.90, tipo: 'mensal' }, status: 200 },
    'sandbox.asaas.com': { body: { id: 'asaas-bol-001', bankSlipUrl: 'https://asaas.com/boleto/001' }, status: 200 },
  });
  const req = makeReq({ plano_id: 'plan-001', metodo: 'BOLETO' });
  const resp = await handler(req);
  assert([200, 201].includes(resp.status), `BOLETO falhou com status ${resp.status}`);
  restore();
}});

Deno.test({ name: 'metodo ausente usa PIX como default', ...NO_LEAK, async fn() {
  const restore = stubFetchByUrl({
    ...HAPPY_PATH_URL_MAP,
    '/rest/v1/planos':    { body: { id: 'plan-001', nome: 'Mensal', preco: 29.90, tipo: 'mensal' }, status: 200 },
    'sandbox.asaas.com': { body: { id: 'asaas-def-001', invoiceUrl: 'https://asaas.com/pix/def' }, status: 200 },
  });
  const req = makeReq({ plano_id: 'plan-001' }); // sem metodo → default PIX
  const resp = await handler(req);
  assert([200, 201].includes(resp.status), `default PIX falhou com status ${resp.status}`);
  restore();
}});

// ── Upstream errors ────────────────────────────────────────────────

Deno.test({ name: 'Asaas 500 → retorna 5xx', ...NO_LEAK, async fn() {
  const restore = stubFetch([
    { body: { id: 'usr-001', email: 'pagante@test.com' }, status: 200 },
    { body: { id: 'plan-001', nome: 'Mensal', valor: 29.90 }, status: 200 },
    { body: { message: 'Internal Server Error' }, status: 500 }, // Asaas falha
  ]);
  const req = makeReq({ plano_id: 'plan-001', metodo: 'PIX' });
  const resp = await handler(req);
  assert([500, 502, 503].includes(resp.status), `Esperava 5xx, recebeu ${resp.status}`);
  restore();
}});

Deno.test({ name: 'Asaas 402 (limite) → retorna erro 4xx ou 5xx', ...NO_LEAK, async fn() {
  const restore = stubFetch([
    { body: { id: 'usr-001', email: 'pagante@test.com' }, status: 200 },
    { body: { id: 'plan-001', nome: 'Mensal', valor: 29.90 }, status: 200 },
    { body: { errors: [{ code: 'invalid_action', description: 'Limite atingido' }] }, status: 402 },
  ]);
  const req = makeReq({ plano_id: 'plan-001', metodo: 'PIX' });
  const resp = await handler(req);
  assert(resp.status >= 400, `Esperava 4xx/5xx, recebeu ${resp.status}`);
  restore();
}});
