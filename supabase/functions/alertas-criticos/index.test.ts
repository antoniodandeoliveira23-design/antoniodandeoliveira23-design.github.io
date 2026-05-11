/**
 * alertas-criticos/index.test.ts
 *
 * Testes do serviço de alertas:
 *  - formatarAuditEmbed (pura)
 *  - formatarAnomaliaEmbed (pura)
 *  - handler — autenticação, roteamento por tabela, discord/email
 */

import { assertEquals, assertStringIncludes, assert } from 'jsr:@std/assert';

// ── Setup ─────────────────────────────────────────────────────────
Deno.env.set('DENO_TESTING', '1');
Deno.env.set('SUPABASE_URL', 'https://test.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-svc');
Deno.env.set('ALERT_SECRET', 'segredo-alerta');
Deno.env.set('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/test/hook');
Deno.env.set('ADMIN_EMAIL', 'admin@agora.app');
Deno.env.set('RESEND_API_KEY', 'test-resend');
Deno.env.set('FROM_EMAIL', 'AGORA <nao@agora.app>');

const { formatarAuditEmbed, formatarAnomaliaEmbed, handler } = await import('./index.ts');

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

function makeReq(body: unknown, auth = 'Bearer segredo-alerta'): Request {
  return new Request('http://localhost/alertas-criticos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'authorization': auth },
    body: JSON.stringify(body),
  });
}

// ── formatarAuditEmbed ─────────────────────────────────────────────

Deno.test('formatarAuditEmbed - title contém severidade em maiúsculas', () => {
  const embed = formatarAuditEmbed({
    acao: 'login_falha', categoria: 'auth',
    severidade: 'critico', resultado: 'falha', tabela: 'profiles',
  });
  assertStringIncludes(String(embed.title), 'CRITICO');
});

Deno.test('formatarAuditEmbed - description contém a acao', () => {
  const embed = formatarAuditEmbed({ acao: 'pagamento_webhook_falha', severidade: 'aviso' });
  assertStringIncludes(String(embed.description), 'pagamento_webhook_falha');
});

Deno.test('formatarAuditEmbed - color vermelho para severidade critico', () => {
  const embed = formatarAuditEmbed({ severidade: 'critico', acao: 'x' });
  assertEquals(embed.color, 0xFF0000);
});

Deno.test('formatarAuditEmbed - color laranja para severidade aviso', () => {
  const embed = formatarAuditEmbed({ severidade: 'aviso', acao: 'x' });
  assertEquals(embed.color, 0xFF8800);
});

Deno.test('formatarAuditEmbed - color azul para severidade info', () => {
  const embed = formatarAuditEmbed({ severidade: 'info', acao: 'x' });
  assertEquals(embed.color, 0x0099FF);
});

Deno.test('formatarAuditEmbed - ícone correto para categoria pagamento', () => {
  const embed = formatarAuditEmbed({ severidade: 'aviso', categoria: 'pagamento', acao: 'x' });
  assertStringIncludes(String(embed.title), '💳');
});

Deno.test('formatarAuditEmbed - fields contém Categoria e Resultado', () => {
  const embed = formatarAuditEmbed({
    severidade: 'info', categoria: 'evento', resultado: 'sucesso', acao: 'x',
  });
  const fields = embed.fields as Array<{ name: string; value: string }>;
  assert(fields.some(f => f.name === 'Categoria'), 'Campo Categoria ausente');
  assert(fields.some(f => f.name === 'Resultado'), 'Campo Resultado ausente');
});

Deno.test('formatarAuditEmbed - detalhes JSON truncados a 500 chars', () => {
  const embed = formatarAuditEmbed({
    severidade: 'info', acao: 'x',
    detalhes: { dados: 'x'.repeat(600) },
  });
  const fields = embed.fields as Array<{ name: string; value: string }>;
  const detField = fields.find(f => f.name === 'Detalhes');
  assert(detField!.value.length < 600, 'Detalhes não foram truncados');
});

// ── formatarAnomaliaEmbed ──────────────────────────────────────────

Deno.test('formatarAnomaliaEmbed - title contém tipo em maiúsculas', () => {
  const embed = formatarAnomaliaEmbed({ tipo: 'velocidade', descricao: 'Muitas requisições' });
  assertStringIncludes(String(embed.title), 'VELOCIDADE');
});

Deno.test('formatarAnomaliaEmbed - color é o de anomalia (0xFF4444)', () => {
  const embed = formatarAnomaliaEmbed({ tipo: 'conteudo_suspeito', descricao: '' });
  assertEquals(embed.color, 0xFF4444);
});

Deno.test('formatarAnomaliaEmbed - description é a descricao do record', () => {
  const embed = formatarAnomaliaEmbed({ tipo: 'x', descricao: 'Descrição de teste' });
  assertEquals(embed.description, 'Descrição de teste');
});

Deno.test('formatarAnomaliaEmbed - ícone correto para tipo multiplas_denuncias', () => {
  const embed = formatarAnomaliaEmbed({ tipo: 'multiplas_denuncias', descricao: '' });
  assertStringIncludes(String(embed.title), '📢');
});

Deno.test('formatarAnomaliaEmbed - usuario anônimo quando user_id ausente', () => {
  const embed = formatarAnomaliaEmbed({ tipo: 'velocidade', descricao: '' });
  const fields = embed.fields as Array<{ name: string; value: string }>;
  const userField = fields.find(f => f.name === 'Usuário');
  assertEquals(userField!.value, 'anônimo');
});

Deno.test('formatarAnomaliaEmbed - inclui campo "Ação necessária"', () => {
  const embed = formatarAnomaliaEmbed({ tipo: 'velocidade', descricao: '' });
  const fields = embed.fields as Array<{ name: string; value: string }>;
  assert(fields.some(f => f.name.includes('Ação necessária')), 'Campo de ação ausente');
});

// ── handler — autenticação ─────────────────────────────────────────

Deno.test('handler - OPTIONS retorna 200', async () => {
  const req = new Request('http://localhost/', { method: 'OPTIONS' });
  const resp = await handler(req);
  assertEquals(resp.status, 200);
});

Deno.test('handler - sem header de autenticação retorna 401', async () => {
  const req = new Request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ record: {}, table: 'audit_log' }),
  });
  const resp = await handler(req);
  assertEquals(resp.status, 401);
});

Deno.test({
  name: 'handler - autenticação via x-webhook-source: supabase é aceita',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([{ body: {}, status: 200 }]);
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-source': 'supabase' },
      body: JSON.stringify({
        table: 'audit_log',
        record: { severidade: 'aviso', acao: 'test', categoria: 'auth', resultado: 'sucesso' },
      }),
    });
    const resp = await handler(req);
    assertEquals(resp.status, 200);
    restore();
  },
});

// ── handler — sem record ───────────────────────────────────────────

Deno.test('handler - payload sem record retorna 200 com msg', async () => {
  const req = makeReq({ table: 'audit_log' });
  const resp = await handler(req);
  assertEquals(resp.status, 200);
  const data = await resp.json();
  assertStringIncludes(data.msg ?? '', 'record');
});

// ── handler — audit_log aviso → discord ───────────────────────────

Deno.test({
  name: 'handler - audit_log com severidade aviso chama discord',
  ...NO_LEAK,
  async fn() {
    let discordCalled = false;
    const original = globalThis.fetch;
    (globalThis as any).fetch = (url: string) => {
      if (String(url).includes('discord')) discordCalled = true;
      return Promise.resolve(new Response('{}', { status: 200 }));
    };
    const req = makeReq({
      table: 'audit_log',
      record: { severidade: 'aviso', acao: 'denuncia_criada', categoria: 'denuncia', resultado: 'sucesso' },
    });
    const resp = await handler(req);
    assertEquals(resp.status, 200);
    assert(discordCalled, 'Discord deveria ter sido chamado');
    (globalThis as any).fetch = original;
  },
});

// ── handler — audit_log info → sem discord ────────────────────────

Deno.test({
  name: 'handler - audit_log com severidade info NÃO chama discord',
  ...NO_LEAK,
  async fn() {
    let discordCalled = false;
    const original = globalThis.fetch;
    (globalThis as any).fetch = (url: string) => {
      if (String(url).includes('discord')) discordCalled = true;
      return Promise.resolve(new Response('{}', { status: 200 }));
    };
    const req = makeReq({
      table: 'audit_log',
      record: { severidade: 'info', acao: 'login_ok', categoria: 'auth', resultado: 'sucesso' },
    });
    await handler(req);
    assert(!discordCalled, 'Discord NÃO deveria ser chamado para info');
    (globalThis as any).fetch = original;
  },
});

// ── handler — anomalia_log → discord ──────────────────────────────

Deno.test({
  name: 'handler - anomalia_log não resolvida chama discord',
  ...NO_LEAK,
  async fn() {
    let discordCalled = false;
    const original = globalThis.fetch;
    (globalThis as any).fetch = (url: string) => {
      if (String(url).includes('discord')) discordCalled = true;
      return Promise.resolve(new Response('{}', { status: 200 }));
    };
    const req = makeReq({
      table: 'anomalia_log',
      record: { tipo: 'conteudo_suspeito', descricao: 'Spam detectado', resolvido: false },
    });
    const resp = await handler(req);
    assertEquals(resp.status, 200);
    assert(discordCalled, 'Discord deveria ser chamado para anomalia');
    (globalThis as any).fetch = original;
  },
});

Deno.test({
  name: 'handler - anomalia_log já resolvida não chama discord',
  ...NO_LEAK,
  async fn() {
    let discordCalled = false;
    const original = globalThis.fetch;
    (globalThis as any).fetch = (url: string) => {
      if (String(url).includes('discord')) discordCalled = true;
      return Promise.resolve(new Response('{}', { status: 200 }));
    };
    const req = makeReq({
      table: 'anomalia_log',
      record: { tipo: 'velocidade', descricao: 'Ok', resolvido: true },
    });
    await handler(req);
    assert(!discordCalled, 'Discord NÃO deveria ser chamado para anomalia resolvida');
    (globalThis as any).fetch = original;
  },
});

// ── handler — JSON inválido ────────────────────────────────────────

Deno.test('handler - JSON malformado retorna 400', async () => {
  const req = new Request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'authorization': 'Bearer segredo-alerta' },
    body: '{{{invalido',
  });
  const resp = await handler(req);
  assertEquals(resp.status, 400);
});
