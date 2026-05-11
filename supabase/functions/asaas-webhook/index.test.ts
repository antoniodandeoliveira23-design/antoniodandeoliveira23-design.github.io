/**
 * asaas-webhook/index.test.ts
 *
 * Testes do webhook Asaas:
 *  - Funções puras exportadas: STATUS_MAP, PLANOS_VALIDADE, TIPO_VALIDADE, calcularValidade
 *  - Handler: validação de assinatura, eventos mapeados/não-mapeados, fluxos de atualização
 */

import { assertEquals, assertStringIncludes, assert } from 'jsr:@std/assert';

// ── Setup ─────────────────────────────────────────────────────────
Deno.env.set('DENO_TESTING', '1');
Deno.env.set('ASAAS_ACCESS_TOKEN', 'test-asaas-token');
Deno.env.set('SUPABASE_URL', 'https://test.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-svc');
Deno.env.set('ALERT_SECRET', 'test-alert-secret');

const {
  handler,
  STATUS_MAP,
  PLANOS_VALIDADE,
  TIPO_VALIDADE,
  calcularValidade,
} = await import('./index.ts');

// ── Helpers ────────────────────────────────────────────────────────

function makeReq(body: unknown, token = 'test-asaas-token'): Request {
  return new Request('http://localhost/asaas-webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'asaas-access-token': token,
    },
    body: JSON.stringify(body),
  });
}

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

// ── STATUS_MAP ─────────────────────────────────────────────────────

Deno.test('STATUS_MAP - PAYMENT_RECEIVED → pago', () => {
  assertEquals(STATUS_MAP['PAYMENT_RECEIVED'], 'pago');
});

Deno.test('STATUS_MAP - PAYMENT_CONFIRMED → pago', () => {
  assertEquals(STATUS_MAP['PAYMENT_CONFIRMED'], 'pago');
});

Deno.test('STATUS_MAP - PAYMENT_OVERDUE → vencido', () => {
  assertEquals(STATUS_MAP['PAYMENT_OVERDUE'], 'vencido');
});

Deno.test('STATUS_MAP - PAYMENT_DELETED → cancelado', () => {
  assertEquals(STATUS_MAP['PAYMENT_DELETED'], 'cancelado');
});

Deno.test('STATUS_MAP - PAYMENT_REFUNDED → reembolsado', () => {
  assertEquals(STATUS_MAP['PAYMENT_REFUNDED'], 'reembolsado');
});

Deno.test('STATUS_MAP - PAYMENT_CHARGEBACK_DISPUTE → em_disputa', () => {
  assertEquals(STATUS_MAP['PAYMENT_CHARGEBACK_DISPUTE'], 'em_disputa');
});

Deno.test('STATUS_MAP - evento desconhecido → undefined', () => {
  assertEquals(STATUS_MAP['EVENTO_INEXISTENTE'], undefined);
});

// ── PLANOS_VALIDADE ────────────────────────────────────────────────

Deno.test('PLANOS_VALIDADE - contém os 4 planos reais', () => {
  assertEquals(typeof PLANOS_VALIDADE, 'object');
  const ids = Object.keys(PLANOS_VALIDADE);
  assertEquals(ids.length, 4);
  // Anual = 365 dias
  assert(Object.values(PLANOS_VALIDADE).includes(365));
  // Mensal = 30 dias
  assert(Object.values(PLANOS_VALIDADE).includes(30));
  // Trimestral = 90 dias
  assert(Object.values(PLANOS_VALIDADE).includes(90));
});

// ── TIPO_VALIDADE ──────────────────────────────────────────────────

Deno.test('TIPO_VALIDADE - mensal=30, trimestral=90, anual=365, semanal=7', () => {
  assertEquals(TIPO_VALIDADE['mensal'], 30);
  assertEquals(TIPO_VALIDADE['trimestral'], 90);
  assertEquals(TIPO_VALIDADE['anual'], 365);
  assertEquals(TIPO_VALIDADE['semanal'], 7);
  assertEquals(TIPO_VALIDADE['avulso'], 30);
});

// ── calcularValidade ───────────────────────────────────────────────

Deno.test('calcularValidade - por UUID conhecido (anual=365 dias)', () => {
  const uuidAnual = '6b429c49-589c-4643-97c8-333828b00fcb';
  const result = calcularValidade(uuidAnual);
  const diff = (new Date(result).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  assert(diff > 364 && diff < 366, `Esperava ~365 dias, obteve ${diff}`);
});

Deno.test('calcularValidade - por tipo mensal (30 dias)', () => {
  const result = calcularValidade('uuid-inexistente', 'mensal');
  const diff = (new Date(result).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  assert(diff > 29 && diff < 31, `Esperava ~30 dias, obteve ${diff}`);
});

Deno.test('calcularValidade - fallback 30 dias quando sem id e sem tipo', () => {
  const result = calcularValidade('uuid-sem-match');
  const diff = (new Date(result).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  assert(diff > 29 && diff < 31, `Fallback deveria ser 30 dias, obteve ${diff}`);
});

Deno.test('calcularValidade - retorna string ISO válida', () => {
  const result = calcularValidade('any-id', 'anual');
  assertEquals(typeof result, 'string');
  assert(!isNaN(Date.parse(result)), 'Deve ser uma data ISO válida');
});

// Desativa checagem de recursos/ops para testes que usam supabase-js (cria timers internos)
const NO_LEAK = { sanitizeResources: false, sanitizeOps: false };

// ── handler — OPTIONS ──────────────────────────────────────────────

Deno.test('handler - OPTIONS retorna 200', async () => {
  const req = new Request('http://localhost/', { method: 'OPTIONS' });
  const resp = await handler(req);
  assertEquals(resp.status, 200);
});

// ── handler — método inválido ──────────────────────────────────────

Deno.test('handler - GET retorna 405', async () => {
  const req = new Request('http://localhost/', {
    method: 'GET',
    headers: { 'asaas-access-token': 'test-asaas-token' },
  });
  const resp = await handler(req);
  assertEquals(resp.status, 405);
});

// ── handler — assinatura inválida ──────────────────────────────────

Deno.test('handler - assinatura incorreta retorna 401', async () => {
  const req = new Request('http://localhost/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'asaas-access-token': 'token-errado',
    },
    body: JSON.stringify({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay-1' } }),
  });
  const resp = await handler(req);
  assertEquals(resp.status, 401);
});

// ── handler — JSON inválido ────────────────────────────────────────

Deno.test('handler - JSON malformado retorna 400', async () => {
  const req = new Request('http://localhost/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'asaas-access-token': 'test-asaas-token',
    },
    body: 'nao-eh-json{',
  });
  const resp = await handler(req);
  assertEquals(resp.status, 400);
});

// ── handler — campos obrigatórios ausentes ─────────────────────────

Deno.test('handler - sem event ou payment retorna 400', async () => {
  const req = makeReq({ event: 'PAYMENT_CONFIRMED' }); // falta payment
  const resp = await handler(req);
  assertEquals(resp.status, 400);
});

// ── handler — evento não mapeado ───────────────────────────────────

Deno.test({
  name: 'handler - evento desconhecido retorna 200 com ignorado=true',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([]);
    const req = makeReq({ event: 'EVENTO_INEXISTENTE', payment: { id: 'pay-x' } });
    const resp = await handler(req);
    assertEquals(resp.status, 200);
    const data = await resp.json();
    assertEquals(data.ignorado, true);
    restore();
  },
});

// ── handler — pagamento não encontrado (upsert) ────────────────────

Deno.test({
  name: 'handler - pagamento não encontrado → faz upsert e retorna 200',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([
      // from('pagamentos').select().eq().single() → não encontrado
      { body: { error: { code: 'PGRST116', message: 'not found' } }, status: 406 },
      // upsert → sucesso
      { body: { data: null, error: null }, status: 200 },
      // audit_log insert
      { body: { data: null }, status: 201 },
    ]);

    const req = makeReq({
      event: 'PAYMENT_CONFIRMED',
      payment: { id: 'ext-pay-1', value: 29.9, billingType: 'PIX', dueDate: '2026-06-01' },
    });
    const resp = await handler(req);
    assertEquals(resp.status, 200);
    const data = await resp.json();
    assertEquals(data.ok, true);
    restore();
  },
});

// ── handler — pagamento encontrado, status atualizado ──────────────

Deno.test({
  name: 'handler - pagamento existente tem status atualizado para vencido',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([
      // from('pagamentos').select() → encontrado
      { body: { id: 'pay-db-1', usuario_id: 'usr-1', plano_id: null }, status: 200 },
      // update status
      { body: {}, status: 200 },
      // profiles update (vencido → revoga plano)
      { body: {}, status: 200 },
      // audit_log
      { body: {}, status: 201 },
    ]);

    const req = makeReq({
      event: 'PAYMENT_OVERDUE',
      payment: { id: 'ext-pay-1', value: 29.9, billingType: 'PIX', dueDate: '2026-05-01' },
    });
    const resp = await handler(req);
    assertEquals(resp.status, 200);
    const data = await resp.json();
    assertEquals(data.status, 'vencido');
    restore();
  },
});
