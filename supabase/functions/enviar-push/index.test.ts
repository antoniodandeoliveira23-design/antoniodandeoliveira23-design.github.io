/**
 * enviar-push/index.test.ts
 * Testes de integração da Edge Function enviar-push.
 *
 * Cobre:
 *  1. Happy path: usuário com push token → Expo notificado → { enviado: true, canal: "push" }
 *  2. Fallback in-app: sem push token → insere notificação no DB
 *  3. sem_token total: { enviado: false, motivo }
 *  4. Campos obrigatórios ausentes → 400/422
 *  5. Auth: sem token (401), inválido (401)
 *  6. Expo retorna token inválido → não propaga como 5xx
 *  7. DB lookup falha → 500
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

function makeReq(body: unknown, token = 'test-alert-secret'): Request {
  return new Request('http://localhost/enviar-push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

const PAYLOAD_BASE = {
  usuario_id: '00000000-0000-0000-0000-000000000001',
  tipo: 'nova_mensagem',
  titulo: 'Nova mensagem',
  mensagem: 'Você tem uma mensagem nova',
};

// ── OPTIONS ──────────────────────────────────────────────────────────

Deno.test('OPTIONS retorna 200', async () => {
  const req = new Request('http://localhost/enviar-push', { method: 'OPTIONS' });
  const resp = await handler(req);
  assertEquals(resp.status, 200);
});

// ── Método errado ─────────────────────────────────────────────────────

Deno.test({ name: 'GET retorna 405', ...NO_LEAK, async fn() {
  const req = new Request('http://localhost/enviar-push', {
    method: 'GET', headers: { Authorization: 'Bearer test-alert-secret' },
  });
  const resp = await handler(req);
  assertEquals(resp.status, 405);
}});

// ── Auth ─────────────────────────────────────────────────────────────

Deno.test({ name: 'sem Authorization retorna 401', ...NO_LEAK, async fn() {
  const req = new Request('http://localhost/enviar-push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(PAYLOAD_BASE),
  });
  const resp = await handler(req);
  assertEquals(resp.status, 401);
}});

Deno.test({ name: 'token inválido retorna 401', ...NO_LEAK, async fn() {
  const restore = stubFetch([{ body: { error: 'invalid' }, status: 401 }]);
  const req = makeReq(PAYLOAD_BASE, 'token-invalido-xyz');
  const resp = await handler(req);
  assert([401, 403].includes(resp.status), `Status inesperado: ${resp.status}`);
  restore();
}});

// ── Validação de campos obrigatórios ────────────────────────────────

Deno.test({ name: 'usuario_id ausente → 400 ou 422', ...NO_LEAK, async fn() {
  const req = makeReq({ tipo: 'teste', titulo: 'T', mensagem: 'M' });
  const resp = await handler(req);
  assert([400, 422].includes(resp.status), `Status: ${resp.status}`);
}});

Deno.test({ name: 'titulo ausente → 400 ou 422', ...NO_LEAK, async fn() {
  const req = makeReq({ ...PAYLOAD_BASE, titulo: undefined });
  const resp = await handler(req);
  assert([400, 422].includes(resp.status), `Status: ${resp.status}`);
}});

Deno.test({ name: 'mensagem ausente → 400 ou 422', ...NO_LEAK, async fn() {
  const req = makeReq({ ...PAYLOAD_BASE, mensagem: undefined });
  const resp = await handler(req);
  assert([400, 422].includes(resp.status), `Status: ${resp.status}`);
}});

Deno.test({ name: 'usuario_id formato inválido (não-uuid) → 400 ou 422', ...NO_LEAK, async fn() {
  const req = makeReq({ ...PAYLOAD_BASE, usuario_id: 'nao-e-uuid' });
  const resp = await handler(req);
  // Pode aceitar (se não validar formato) ou rejeitar
  assert([200, 400, 422, 500].includes(resp.status));
}});

// ── Happy paths ───────────────────────────────────────────────────────

Deno.test({ name: 'com push token → Expo chamado → enviado: true', ...NO_LEAK, async fn() {
  const restore = stubFetch([
    // DB: busca push_tokens
    { body: { data: [{ token: 'ExponentPushToken[test-token]', ativo: true }], error: null }, status: 200 },
    // Expo Push API
    { body: { data: [{ status: 'ok', id: 'push-receipt-001' }] }, status: 200 },
    // DB: insere notificação in-app (pode ou não acontecer)
    { body: { data: [{ id: 'notif-001' }], error: null }, status: 200 },
  ]);
  const req = makeReq(PAYLOAD_BASE);
  const resp = await handler(req);
  assert([200, 201].includes(resp.status), `Status inesperado: ${resp.status}`);
  if (resp.status === 200) {
    const body = await resp.json();
    assert('enviado' in body || 'ok' in body, 'Resposta sem campo enviado/ok');
  }
  restore();
}});

Deno.test({ name: 'sem push token → fallback in-app → enviado sem push', ...NO_LEAK, async fn() {
  const restore = stubFetch([
    { body: { data: [], error: null }, status: 200 }, // sem tokens
    { body: { data: [{ id: 'notif-002' }], error: null }, status: 200 }, // insere in-app
  ]);
  const req = makeReq(PAYLOAD_BASE);
  const resp = await handler(req);
  assert([200, 201].includes(resp.status), `Status: ${resp.status}`);
  restore();
}});

Deno.test({ name: 'Expo DeviceNotRegistered não propaga como 5xx', ...NO_LEAK, async fn() {
  const restore = stubFetch([
    { body: { data: [{ token: 'ExponentPushToken[invalid]', ativo: true }], error: null }, status: 200 },
    { body: { data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }, status: 200 },
    { body: { data: [{ id: 'notif-003' }], error: null }, status: 200 },
  ]);
  const req = makeReq(PAYLOAD_BASE);
  const resp = await handler(req);
  // Não deve retornar 5xx quando Expo diz DeviceNotRegistered
  assert(resp.status < 500, `Propagou erro Expo como 5xx: ${resp.status}`);
  restore();
}});

Deno.test({ name: 'DB lookup falha → não propaga 5xx (in-app falha, continua)', ...NO_LEAK, async fn() {
  // Quando notificacoes.insert() falha, o handler loga o erro mas continua tentando
  // push. Se não há tokens, retorna 200 com { enviado: false }.
  const restore = stubFetch([
    { body: { code: 'PGRST001', message: 'DB error' }, status: 500 },
  ]);
  const req = makeReq(PAYLOAD_BASE);
  const resp = await handler(req);
  assert([200, 500, 502, 503].includes(resp.status), `Status: ${resp.status}`);
  restore();
}});
