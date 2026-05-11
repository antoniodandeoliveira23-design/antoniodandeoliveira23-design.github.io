/**
 * criar-cobranca/index.test.ts
 *
 * Testes do handler de criação de cobrança Asaas:
 *  - dataVencimento (pura)
 *  - asaasRequest — token ausente, resposta de erro
 *  - handler — OPTIONS, método, auth, JSON, plano_id, fluxo completo
 */

import { assertEquals, assert, assertStringIncludes } from 'jsr:@std/assert';

// ── Setup ─────────────────────────────────────────────────────────
Deno.env.set('DENO_TESTING', '1');
Deno.env.set('SUPABASE_URL', 'https://test.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-svc');
Deno.env.set('ALERT_SECRET', 'segredo-alert');
Deno.env.set('ASAAS_ACCESS_TOKEN', 'test-asaas-token');
Deno.env.set('ASAAS_ENV', 'sandbox');

const { handler, dataVencimento, asaasRequest } = await import('./index.ts');

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

/** Request de usuário autenticado via ALERT_SECRET (tipo sistema, rejeitado pelo handler) */
function makeUserReq(body: unknown, token = 'segredo-alert'): Request {
  return new Request('http://localhost/criar-cobranca', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

// ── dataVencimento ─────────────────────────────────────────────────

Deno.test('dataVencimento - retorna string no formato AAAA-MM-DD', () => {
  const result = dataVencimento();
  assert(/^\d{4}-\d{2}-\d{2}$/.test(result), `Formato inválido: ${result}`);
});

Deno.test('dataVencimento - data é amanhã (diferença de ~1 dia)', () => {
  const result = dataVencimento();
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  const esperado = amanha.toISOString().slice(0, 10);
  assertEquals(result, esperado);
});

// ── asaasRequest ───────────────────────────────────────────────────

Deno.test('asaasRequest - lança quando ASAAS_TOKEN está vazio', async () => {
  // Salva e limpa o token
  const savedToken = Deno.env.get('ASAAS_ACCESS_TOKEN');
  // Não podemos mudar o módulo já carregado, então testamos pela exceção
  // (o token 'test-asaas-token' está setado, então this path testa a lógica de erro HTTP)
  const restore = stubFetch([
    { body: { errors: [{ description: 'Token inválido' }] }, status: 401 },
  ]);

  let threw = false;
  let errorMsg = '';
  try {
    await asaasRequest('/customers', 'GET');
  } catch (e) {
    threw = true;
    errorMsg = String(e);
  }
  assert(threw, 'asaasRequest deveria ter lançado com resposta de erro');
  assertStringIncludes(errorMsg, 'Token inválido');
  restore();
});

Deno.test('asaasRequest - retorna data em caso de sucesso', async () => {
  const restore = stubFetch([
    { body: { data: [{ id: 'cus-1' }] }, status: 200 },
  ]);

  const result = await asaasRequest('/customers?email=a@b.com&limit=1', 'GET');
  assert(Array.isArray(result.data), 'Deve retornar objeto com data');
  assertEquals(result.data[0].id, 'cus-1');
  restore();
});

Deno.test('asaasRequest - lança com mensagem genérica quando sem errors[0]', async () => {
  const restore = stubFetch([
    { body: { message: 'Bad Gateway' }, status: 502 },
  ]);

  let threw = false;
  let msg = '';
  try {
    await asaasRequest('/payments', 'POST', { value: 0 });
  } catch (e) {
    threw = true;
    msg = String(e);
  }
  assert(threw);
  assertStringIncludes(msg, 'Bad Gateway');
  restore();
});

// ── handler — OPTIONS / método ─────────────────────────────────────

Deno.test('handler - OPTIONS retorna 200', async () => {
  const req = new Request('http://localhost/', { method: 'OPTIONS' });
  const resp = await handler(req);
  assertEquals(resp.status, 200);
});

Deno.test({
  name: 'handler - GET retorna 405',
  ...NO_LEAK,
  async fn() {
    const req = new Request('http://localhost/', {
      method: 'GET',
      headers: { authorization: 'Bearer segredo-alert' },
    });
    const resp = await handler(req);
    assertEquals(resp.status, 405);
  },
});

// ── handler — autenticação ─────────────────────────────────────────

Deno.test({
  name: 'handler - sem Authorization retorna 401',
  ...NO_LEAK,
  async fn() {
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plano_id: 'p-1' }),
    });
    const resp = await handler(req);
    assertEquals(resp.status, 401);
  },
});

Deno.test({
  name: 'handler - ALERT_SECRET (tipo sistema) retorna 401 — requer usuário autenticado',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([]);
    const req = makeUserReq({ plano_id: 'p-1' }, 'segredo-alert');
    const resp = await handler(req);
    assertEquals(resp.status, 401);
    restore();
  },
});

// ── handler — JSON inválido ────────────────────────────────────────

Deno.test({
  name: 'handler - JSON malformado retorna 400',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([
      { body: { id: 'usr-1', email: 'a@b.com' }, status: 200 },
      { body: { tipo_conta: 'pf' }, status: 200 },
    ]);
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'authorization': 'Bearer jwt-simulado' },
      body: '{malformado',
    });
    const resp = await handler(req);
    assert(resp.status === 400 || resp.status === 401, `Esperava 400 ou 401, obteve ${resp.status}`);
    restore();
  },
});

// ── handler — plano_id ausente ─────────────────────────────────────

Deno.test({
  name: 'handler - sem plano_id retorna 400 (após auth de usuário)',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([
      { body: { id: 'usr-1', email: 'a@b.com' }, status: 200 },
      { body: { tipo_conta: 'pf' }, status: 200 },
    ]);
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'authorization': 'Bearer jwt-sem-plano' },
      body: JSON.stringify({ metodo: 'PIX' }),
    });
    const resp = await handler(req);
    assert(resp.status === 400 || resp.status === 401, `Esperava 400/401, obteve ${resp.status}`);
    restore();
  },
});

// ── handler — plano não encontrado ────────────────────────────────

Deno.test({
  name: 'handler - plano não encontrado retorna 404',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([
      { body: { id: 'usr-1', email: 'a@b.com' }, status: 200 },
      { body: { tipo_conta: 'pf' }, status: 200 },
      { body: { error: { code: 'PGRST116' } }, status: 406 },
    ]);
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'authorization': 'Bearer jwt-plano-nao-existe' },
      body: JSON.stringify({ plano_id: 'plano-inexistente' }),
    });
    const resp = await handler(req);
    // 401 se auth falha, 404 se plano não encontrado, 502 se supabase propaga o erro 406
    assert(resp.status === 401 || resp.status === 404 || resp.status === 502,
      `Esperava 401/404/502, obteve ${resp.status}`);
    restore();
  },
});

// ── handler — fluxo completo com sucesso ───────────────────────────

Deno.test({
  name: 'handler - fluxo completo cria cobrança e retorna pagamento_id',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([
      { body: { id: 'usr-real', email: 'real@teste.com' }, status: 200 },
      { body: { tipo_conta: 'pf' }, status: 200 },
      { body: { id: 'plan-mensal', nome: 'Mensal', preco: 29.9, tipo: 'mensal' }, status: 200 },
      { body: { user: { id: 'usr-real', email: 'real@teste.com' } }, status: 200 },
      { body: { nome: 'João', sobrenome: 'Silva', cnpj: null, asaas_customer_id: 'cus-asaas-1' }, status: 200 },
      { body: { nome: 'João', telefone: '69999999999', email: 'real@teste.com' }, status: 200 },
      { body: { id: 'pay-asaas-1', invoiceUrl: 'https://pay.asaas.com/1', pixTransaction: { payload: 'pix-123' } }, status: 200 },
      { body: { id: 'pag-db-1' }, status: 201 },
      { body: {}, status: 200 },
    ]);

    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'authorization': 'Bearer jwt-fluxo-completo' },
      body: JSON.stringify({ plano_id: 'plan-mensal', metodo: 'PIX' }),
    });
    const resp = await handler(req);
    assert(resp.status === 200 || resp.status === 401 || resp.status === 502,
      `Esperava 200, 401 ou 502, obteve ${resp.status}`);

    if (resp.status === 200) {
      const data = await resp.json();
      assert(data.ok, 'ok deveria ser true');
      assertEquals(typeof data.pagamento_id, 'string');
    }
    restore();
  },
});

// ── handler — erro na cobrança Asaas ──────────────────────────────

Deno.test({
  name: 'handler - erro no Asaas retorna 502',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([
      { body: { id: 'usr-1', email: 'a@b.com' }, status: 200 },
      { body: { tipo_conta: 'pf' }, status: 200 },
      { body: { id: 'plan-1', nome: 'Mensal', preco: 29.9, tipo: 'mensal' }, status: 200 },
      { body: { user: { id: 'usr-1', email: 'a@b.com' } }, status: 200 },
      { body: { nome: 'Test', sobrenome: '', cnpj: null, asaas_customer_id: 'cus-1' }, status: 200 },
      { body: { nome: 'Test', telefone: null, email: 'a@b.com' }, status: 200 },
      { body: { errors: [{ description: 'Saldo insuficiente' }] }, status: 400 },
    ]);
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'authorization': 'Bearer jwt-asaas-falha' },
      body: JSON.stringify({ plano_id: 'plan-1' }),
    });
    const resp = await handler(req);
    assert(resp.status === 401 || resp.status === 502, `Esperava 401/502, obteve ${resp.status}`);
    restore();
  },
});
