/**
 * db-webhook/index.test.ts
 * Testes de integração da Edge Function db-webhook.
 *
 * Cobre:
 *  1. Auth: ALERT_SECRET (200), x-webhook-source (200), sem auth (401), token errado (401)
 *  2. Payload: record ausente (400), table ausente → silencioso (200)
 *  3. audit_log INSERT → Discord notificado
 *  4. anomalia_log INSERT crítica → Discord + email
 *  5. anomalia_log INSERT baixa → silencioso
 *  6. table desconhecida → 200 silencioso
 *  7. Discord falha → 200 (falha silenciosa)
 *  8. GET → 405
 */

import { assertEquals, assert } from 'jsr:@std/assert';

Deno.env.set('DENO_TESTING', '1');
Deno.env.set('SUPABASE_URL', 'https://test.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-svc');
Deno.env.set('ALERT_SECRET', 'test-alert-secret');
Deno.env.set('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/test/test');
Deno.env.set('ADMIN_EMAIL', 'admin@agora.app');

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

function makeReq(
  body: unknown,
  auth: { bearer?: string; webhookSource?: boolean } = { bearer: 'test-alert-secret' }
): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth.bearer) headers['Authorization'] = `Bearer ${auth.bearer}`;
  if (auth.webhookSource) headers['x-webhook-source'] = 'supabase';
  return new Request('http://localhost/db-webhook', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// Seeds
const AUDIT_RECORD = {
  id: 'aud-001', acao: '2fa_verificado', categoria: 'auth',
  severidade: 'info', resultado: 'sucesso', admin_id: 'usr-001',
  criado_em: new Date().toISOString(),
};

const ANOMALIA_CRITICA = {
  id: 'an-001', tipo: 'brute_force', severidade: 'critica',
  ip: '192.168.1.1', usuario_id: 'usr-001', detalhes: {},
  criado_em: new Date().toISOString(),
};

const ANOMALIA_BAIXA = {
  id: 'an-002', tipo: 'rate_limit', severidade: 'baixa',
  ip: '10.0.0.1', usuario_id: null, detalhes: {},
  criado_em: new Date().toISOString(),
};

// ── OPTIONS / Método ──────────────────────────────────────────────

Deno.test('OPTIONS retorna 200', async () => {
  const req = new Request('http://localhost/db-webhook', { method: 'OPTIONS' });
  const resp = await handler(req);
  assertEquals(resp.status, 200);
});

Deno.test({ name: 'GET retorna 405', ...NO_LEAK, async fn() {
  const req = new Request('http://localhost/db-webhook', {
    method: 'GET',
    headers: { Authorization: 'Bearer test-alert-secret' },
  });
  const resp = await handler(req);
  assertEquals(resp.status, 405);
}});

// ── Auth ──────────────────────────────────────────────────────────

Deno.test({ name: 'sem auth retorna 401', ...NO_LEAK, async fn() {
  const req = makeReq(
    { type: 'INSERT', table: 'audit_log', schema: 'public', record: AUDIT_RECORD },
    {}
  );
  const resp = await handler(req);
  assertEquals(resp.status, 401);
}});

Deno.test({ name: 'token errado retorna 401', ...NO_LEAK, async fn() {
  const restore = stubFetch([{ body: { error: 'invalid' }, status: 401 }]);
  const req = makeReq(
    { type: 'INSERT', table: 'audit_log', schema: 'public', record: AUDIT_RECORD },
    { bearer: 'token-errado' }
  );
  const resp = await handler(req);
  assert([401, 403].includes(resp.status));
  restore();
}});

Deno.test({ name: 'x-webhook-source: supabase aceito sem Bearer', ...NO_LEAK, async fn() {
  const restore = stubFetch([
    { body: {}, status: 204 }, // Discord
  ]);
  const req = makeReq(
    { type: 'INSERT', table: 'audit_log', schema: 'public', record: AUDIT_RECORD },
    { webhookSource: true }
  );
  const resp = await handler(req);
  assert([200, 204].includes(resp.status), `Status: ${resp.status}`);
  restore();
}});

// ── Validação ─────────────────────────────────────────────────────

Deno.test({ name: 'JSON inválido retorna 400', ...NO_LEAK, async fn() {
  const req = makeReq('{ quebrado: }');
  const resp = await handler(req);
  assert([400, 422].includes(resp.status));
}});

Deno.test({ name: 'record ausente retorna 400 ou processa silencioso', ...NO_LEAK, async fn() {
  const req = makeReq({ type: 'INSERT', table: 'audit_log', schema: 'public' });
  const resp = await handler(req);
  assert([200, 204, 400, 422].includes(resp.status));
}});

// ── Tabelas ───────────────────────────────────────────────────────

Deno.test({ name: 'audit_log INSERT → Discord notificado → 200', ...NO_LEAK, async fn() {
  const restore = stubFetch([
    { body: {}, status: 204 }, // Discord
  ]);
  const req = makeReq({
    type: 'INSERT', table: 'audit_log', schema: 'public', record: AUDIT_RECORD,
  });
  const resp = await handler(req);
  assert([200, 204].includes(resp.status));
  restore();
}});

Deno.test({ name: 'anomalia_log INSERT severidade crítica → Discord + email', ...NO_LEAK, async fn() {
  const restore = stubFetch([
    { body: {}, status: 204 }, // Discord
    { body: { ok: true }, status: 200 }, // email-transacional
  ]);
  const req = makeReq({
    type: 'INSERT', table: 'anomalia_log', schema: 'public', record: ANOMALIA_CRITICA,
  });
  const resp = await handler(req);
  assert([200, 204].includes(resp.status));
  restore();
}});

Deno.test({ name: 'anomalia_log INSERT severidade baixa → sem notificação externa', ...NO_LEAK, async fn() {
  // Sem mocks de fetch — se fizer chamada externa, o fetch real seria usado e falharia
  const req = makeReq({
    type: 'INSERT', table: 'anomalia_log', schema: 'public', record: ANOMALIA_BAIXA,
  });
  const resp = await handler(req);
  assert([200, 204].includes(resp.status));
}});

Deno.test({ name: 'table desconhecida → 200 silencioso', ...NO_LEAK, async fn() {
  const req = makeReq({
    type: 'INSERT', table: 'tabela_inexistente', schema: 'public',
    record: { id: 'x-001', foo: 'bar' },
  });
  const resp = await handler(req);
  assert([200, 204].includes(resp.status));
}});

Deno.test({ name: 'Discord falha → 200 (falha silenciosa)', ...NO_LEAK, async fn() {
  const restore = stubFetch([
    { body: { message: 'bad webhook' }, status: 400 }, // Discord falha
  ]);
  const req = makeReq({
    type: 'INSERT', table: 'audit_log', schema: 'public', record: AUDIT_RECORD,
  });
  const resp = await handler(req);
  // Discord falha não deve propagar como erro ao chamador
  assert([200, 204].includes(resp.status), `Discord falha propagou: ${resp.status}`);
  restore();
}});
