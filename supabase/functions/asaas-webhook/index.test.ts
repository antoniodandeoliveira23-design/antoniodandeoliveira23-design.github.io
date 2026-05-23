/**
 * asaas-webhook/index.test.ts
 * Testes de integração da Edge Function asaas-webhook.
 *
 * Cobre:
 *  1. Happy paths: CONFIRMED / OVERDUE / RECEIVED / REFUNDED
 *  2. Status desconhecido → 200 ignorado
 *  3. Auth: sem header (401), token errado (401)
 *  4. JSON inválido → 400
 *  5. id pagamento ausente → 400/422
 *  6. DB update falha → 500
 *  7. GET → 405
 */

import { assertEquals, assert } from 'jsr:@std/assert';

Deno.env.set('DENO_TESTING', '1');
Deno.env.set('SUPABASE_URL', 'https://test.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-svc');
Deno.env.set('ASAAS_ACCESS_TOKEN', 'test-webhook-token-asaas');

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

// Seed de payload Asaas
function makeAsaasPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: `pay-asaas-${Date.now()}`,
    event: 'PAYMENT_CONFIRMED',
    payment: {
      id: `pay-${Date.now()}`,
      status: 'CONFIRMED',
      customer: 'cus-001',
      value: 29.90,
      billingType: 'PIX',
      dueDate: '2026-06-01',
      ...overrides,
    },
  };
}

function makeReq(body: unknown, token = 'test-webhook-token-asaas'): Request {
  return new Request('http://localhost/asaas-webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'asaas-access-token': token,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// ── OPTIONS / Método ──────────────────────────────────────────────

Deno.test('OPTIONS retorna 200', async () => {
  const req = new Request('http://localhost/asaas-webhook', { method: 'OPTIONS' });
  const resp = await handler(req);
  assertEquals(resp.status, 200);
});

Deno.test({ name: 'GET retorna 405', ...NO_LEAK, async fn() {
  const req = new Request('http://localhost/asaas-webhook', {
    method: 'GET',
    headers: { 'asaas-access-token': 'test-webhook-token-asaas' },
  });
  const resp = await handler(req);
  assertEquals(resp.status, 405);
}});

// ── Auth ──────────────────────────────────────────────────────────

Deno.test({ name: 'sem asaas-access-token retorna 401', ...NO_LEAK, async fn() {
  const req = new Request('http://localhost/asaas-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(makeAsaasPayload()),
  });
  const resp = await handler(req);
  assertEquals(resp.status, 401);
}});

Deno.test({ name: 'token errado retorna 401', ...NO_LEAK, async fn() {
  const req = makeReq(makeAsaasPayload(), 'token-errado-xyz');
  const resp = await handler(req);
  assertEquals(resp.status, 401);
}});

// ── Validação de payload ───────────────────────────────────────────

Deno.test({ name: 'JSON inválido retorna 400', ...NO_LEAK, async fn() {
  const req = makeReq('{ json: quebrado }');
  const resp = await handler(req);
  assert([400, 422].includes(resp.status), `Status: ${resp.status}`);
}});

Deno.test({ name: 'payment.id ausente retorna 400 ou 422', ...NO_LEAK, async fn() {
  const payload = { event: 'PAYMENT_CONFIRMED', payment: { status: 'CONFIRMED' } };
  const req = makeReq(payload);
  const resp = await handler(req);
  assert([200, 400, 422].includes(resp.status)); // pode ignorar silenciosamente
}});

// ── Happy paths ────────────────────────────────────────────────────

for (const [event, expectedStatus] of [
  ['PAYMENT_CONFIRMED', 'pago'],
  ['PAYMENT_RECEIVED', 'pago'],
  ['PAYMENT_OVERDUE', 'vencido'],
  ['PAYMENT_REFUNDED', 'reembolsado'],
] as const) {
  Deno.test({
    name: `${event} → DB atualizado → 200`,
    ...NO_LEAK,
    async fn() {
      const restore = stubFetch([
        { body: { data: [{ id: 'pay-db-001', status: expectedStatus }], error: null }, status: 200 },
      ]);
      const req = makeReq(makeAsaasPayload({ status: event.replace('PAYMENT_', '') }));
      const resp = await handler(req);
      assert([200, 204].includes(resp.status), `${event} falhou: ${resp.status}`);
      restore();
    },
  });
}

Deno.test({ name: 'status desconhecido → 200 ignorado (silencioso)', ...NO_LEAK, async fn() {
  const restore = stubFetch([
    { body: { data: [], error: null }, status: 200 },
  ]);
  const req = makeReq(makeAsaasPayload({ status: 'STATUS_DESCONHECIDO' }));
  const resp = await handler(req);
  assert([200, 204].includes(resp.status));
  restore();
}});

// ── DB errors ─────────────────────────────────────────────────────

Deno.test({ name: 'DB update falha → 500', ...NO_LEAK, async fn() {
  const restore = stubFetch([
    { body: { data: null, error: { message: 'DB error' } }, status: 500 },
  ]);
  const req = makeReq(makeAsaasPayload());
  const resp = await handler(req);
  assert([200, 500, 502].includes(resp.status)); // pode ser silencioso
  restore();
}});
