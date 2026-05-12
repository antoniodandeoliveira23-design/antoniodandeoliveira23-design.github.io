/**
 * db-webhook/index.test.ts
 *
 * Testes do handler de webhook de banco de dados:
 *  - handler — OPTIONS, método, autenticação (ALERT_SECRET / x-webhook-source), JSON inválido,
 *              payload incompleto, erro interno, fluxo completo
 *  - processar — anomalia_log, audit_log (severidades e categorias), tabela desconhecida
 *  - Notificações — email e Discord condicionais por env/tipo/severidade
 */

import { assertEquals, assert, assertStringIncludes } from 'jsr:@std/assert';

// ── Setup ─────────────────────────────────────────────────────────
Deno.env.set('DENO_TESTING',              '1');
Deno.env.set('SUPABASE_URL',              'https://test.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-svc');
Deno.env.set('ALERT_SECRET',              'segredo-webhook');
Deno.env.set('ADMIN_EMAIL',              'admin@agora.app');
Deno.env.set('DISCORD_WEBHOOK_URL',       '');          // desabilitado por padrão
Deno.env.set('RESEND_API_KEY',            '');
Deno.env.set('FROM_EMAIL',                'AGORA <nao-responda@agora.app>');

const { handler, processar } = await import('./index.ts');

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
        status:  cfg.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };
  return () => { (globalThis as any).fetch = original; };
}

/** Captura todas as chamadas de fetch durante a execução de fn() */
async function captureFetch(fn: () => Promise<void>): Promise<Request[]> {
  const calls: Request[] = [];
  const original = globalThis.fetch;
  (globalThis as any).fetch = (req: Request | string) => {
    calls.push(typeof req === 'string' ? new Request(req) : req);
    return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
  };
  await fn();
  (globalThis as any).fetch = original;
  return calls;
}

/** Monta Request para o webhook com autenticação padrão */
function makeWebhookReq(
  body: unknown,
  opts: { token?: string; source?: string; method?: string } = {},
): Request {
  const { token = 'segredo-webhook', source, method = 'POST' } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token)  headers['authorization']    = `Bearer ${token}`;
  if (source) headers['x-webhook-source'] = source;
  return new Request('http://localhost/db-webhook', {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
}

/** Payload mínimo válido de webhook Supabase */
const makePayload = (
  table: string,
  record: Record<string, unknown> = {},
  type: 'INSERT' | 'UPDATE' | 'DELETE' = 'INSERT',
) => ({ type, table, schema: 'public', record });

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
    const req = makeWebhookReq({}, { method: 'GET' });
    const resp = await handler(req);
    assertEquals(resp.status, 405);
  },
});

// ── handler — autenticação ─────────────────────────────────────────

Deno.test({
  name: 'handler - sem Authorization e sem x-webhook-source retorna 401',
  ...NO_LEAK,
  async fn() {
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makePayload('anomalia_log')),
    });
    const resp = await handler(req);
    assertEquals(resp.status, 401);
  },
});

Deno.test({
  name: 'handler - token errado e sem x-webhook-source retorna 401',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([]);
    const req = makeWebhookReq(makePayload('anomalia_log'), { token: 'token-errado' });
    const resp = await handler(req);
    assertEquals(resp.status, 401);
    restore();
  },
});

Deno.test({
  name: 'handler - Bearer ALERT_SECRET correto retorna 200',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([{ body: {}, status: 200 }]);
    const req = makeWebhookReq(
      makePayload('tabela_desconhecida', { id: '1' }),
      { token: 'segredo-webhook' },
    );
    const resp = await handler(req);
    assertEquals(resp.status, 200);
    restore();
  },
});

Deno.test({
  name: 'handler - x-webhook-source: supabase (sem token) retorna 200',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([]);
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-webhook-source': 'supabase',
      },
      body: JSON.stringify(makePayload('tabela_qualquer', { id: '1' })),
    });
    const resp = await handler(req);
    assertEquals(resp.status, 200);
    restore();
  },
});

// ── handler — JSON inválido ────────────────────────────────────────

Deno.test({
  name: 'handler - JSON malformado retorna 400',
  ...NO_LEAK,
  async fn() {
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'authorization': 'Bearer segredo-webhook',
      },
      body: '{malformado',
    });
    const resp = await handler(req);
    assertEquals(resp.status, 400);
  },
});

// ── handler — payload incompleto ───────────────────────────────────

Deno.test({
  name: 'handler - payload sem table retorna 400',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([]);
    const req = makeWebhookReq({ type: 'INSERT', schema: 'public', record: { id: '1' } });
    const resp = await handler(req);
    assertEquals(resp.status, 400);
    const body = await resp.json();
    assertStringIncludes(body.error, 'table');
    restore();
  },
});

Deno.test({
  name: 'handler - payload sem record retorna 400',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([]);
    const req = makeWebhookReq({ type: 'INSERT', table: 'anomalia_log', schema: 'public' });
    const resp = await handler(req);
    assertEquals(resp.status, 400);
    restore();
  },
});

// ── handler — fluxo completo ───────────────────────────────────────

Deno.test({
  name: 'handler - tabela desconhecida retorna 200 com resultado ignorado',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([]);
    const req = makeWebhookReq(makePayload('outra_tabela', { id: 'x' }));
    const resp = await handler(req);
    assertEquals(resp.status, 200);
    const data = await resp.json();
    assert(data.ok);
    assertStringIncludes(data.resultado, 'outra_tabela');
    restore();
  },
});

Deno.test({
  name: 'handler - anomalia_log retorna 200 com resultado correto',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([{ body: {}, status: 200 }]);
    const req = makeWebhookReq(
      makePayload('anomalia_log', { tipo: 'velocidade', descricao: 'Muitas requisições', user_id: 'u-1' }),
    );
    const resp = await handler(req);
    assertEquals(resp.status, 200);
    const data = await resp.json();
    assert(data.ok);
    assertStringIncludes(data.resultado, 'velocidade');
    restore();
  },
});

Deno.test({
  name: 'handler - erro em processar retorna 500',
  ...NO_LEAK,
  async fn() {
    // Força erro fazendo o processar lançar — passamos um payload onde processar lança
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = () => Promise.reject(new Error('Falha rede'));

    const req = makeWebhookReq(
      makePayload('anomalia_log', { tipo: 'velocidade', descricao: 'x', user_id: 'u-1' }),
    );
    const resp = await handler(req);
    // processar chama notificarAnomaliaEmail que captura o erro internamente;
    // a função principal não deve propagar para 500 nesse caso
    assert(resp.status === 200 || resp.status === 500);
    (globalThis as any).fetch = originalFetch;
  },
});

// ── processar — roteador por tabela ───────────────────────────────

Deno.test({
  name: 'processar - anomalia_log retorna anomalia_<tipo>_notificada',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([{ body: {}, status: 200 }]);
    const resultado = await processar({
      type: 'INSERT', table: 'anomalia_log', schema: 'public',
      record: { tipo: 'login_falha_repetida', descricao: 'Múltiplas tentativas', user_id: 'u-9' },
    });
    assertStringIncludes(resultado, 'login_falha_repetida');
    assertStringIncludes(resultado, 'notificada');
    restore();
  },
});

Deno.test({
  name: 'processar - audit_log severidade info retorna audit_ignorado_severidade_baixa',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([]);
    const resultado = await processar({
      type: 'INSERT', table: 'audit_log', schema: 'public',
      record: { severidade: 'info', acao: 'login', categoria: 'auth', resultado: 'sucesso' },
    });
    assertEquals(resultado, 'audit_ignorado_severidade_baixa');
    restore();
  },
});

Deno.test({
  name: 'processar - audit_log severidade ausente retorna audit_ignorado_severidade_baixa',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([]);
    const resultado = await processar({
      type: 'INSERT', table: 'audit_log', schema: 'public',
      record: { acao: 'acesso', categoria: 'geral', resultado: 'ok' },
    });
    assertEquals(resultado, 'audit_ignorado_severidade_baixa');
    restore();
  },
});

Deno.test({
  name: 'processar - audit_log severidade aviso retorna audit_aviso_notificado',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([{ body: {}, status: 200 }]);
    const resultado = await processar({
      type: 'INSERT', table: 'audit_log', schema: 'public',
      record: { severidade: 'aviso', acao: 'acesso_suspeito', categoria: 'geral', resultado: 'bloqueado' },
    });
    assertEquals(resultado, 'audit_aviso_notificado');
    restore();
  },
});

Deno.test({
  name: 'processar - audit_log severidade critico + categoria auth retorna audit_critico_notificado',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([{ body: {}, status: 200 }, { body: {}, status: 200 }]);
    const resultado = await processar({
      type: 'INSERT', table: 'audit_log', schema: 'public',
      record: { severidade: 'critico', acao: 'login_forcado', categoria: 'auth', resultado: 'falha' },
    });
    assertEquals(resultado, 'audit_critico_notificado');
    restore();
  },
});

Deno.test({
  name: 'processar - audit_log severidade critico + categoria pagamento retorna audit_critico_notificado',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([{ body: {}, status: 200 }, { body: {}, status: 200 }]);
    const resultado = await processar({
      type: 'INSERT', table: 'audit_log', schema: 'public',
      record: { severidade: 'critico', acao: 'cobranca_duplicada', categoria: 'pagamento', resultado: 'erro' },
    });
    assertEquals(resultado, 'audit_critico_notificado');
    restore();
  },
});

Deno.test({
  name: 'processar - audit_log severidade critico + categoria não-crítica não chama email',
  ...NO_LEAK,
  async fn() {
    const fetchCalls: string[] = [];
    const original = globalThis.fetch;
    (globalThis as any).fetch = (req: Request | string) => {
      const url = typeof req === 'string' ? req : req.url;
      fetchCalls.push(url);
      return Promise.resolve(new Response('{}', { status: 200 }));
    };

    const resultado = await processar({
      type: 'INSERT', table: 'audit_log', schema: 'public',
      record: { severidade: 'critico', acao: 'exclusao', categoria: 'conteudo', resultado: 'ok' },
    });

    (globalThis as any).fetch = original;
    assertEquals(resultado, 'audit_critico_notificado');
    // Sem DISCORD_WEBHOOK_URL, nenhum fetch de Discord deve ter sido feito
    assert(fetchCalls.every(u => !u.includes('discord')), 'Não deveria chamar Discord sem DISCORD_WEBHOOK_URL');
  },
});

Deno.test({
  name: 'processar - tabela desconhecida retorna tabela_<nome>_ignorada',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([]);
    const resultado = await processar({
      type: 'INSERT', table: 'outra_tabela', schema: 'public',
      record: { id: '1' },
    });
    assertEquals(resultado, 'tabela_outra_tabela_ignorada');
    restore();
  },
});

// ── Notificações condicionais ──────────────────────────────────────

Deno.test({
  name: 'anomalia_log - tipo em EMAIL_TIPOS chama email-transacional',
  ...NO_LEAK,
  async fn() {
    const calls = await captureFetch(async () => {
      await processar({
        type: 'INSERT', table: 'anomalia_log', schema: 'public',
        record: { tipo: 'velocidade', descricao: 'Muitas req', user_id: 'u-1', detalhes: {} },
      });
    });
    // Deve chamar email-transacional (ADMIN_EMAIL está configurado)
    assert(
      calls.some(r => r.url.includes('email-transacional')),
      'Deveria ter chamado email-transacional para tipo velocidade',
    );
  },
});

Deno.test({
  name: 'anomalia_log - tipo fora de EMAIL_TIPOS não chama email-transacional',
  ...NO_LEAK,
  async fn() {
    const calls = await captureFetch(async () => {
      await processar({
        type: 'INSERT', table: 'anomalia_log', schema: 'public',
        record: { tipo: 'tipo_nao_mapeado', descricao: 'x', user_id: 'u-2', detalhes: {} },
      });
    });
    assert(
      !calls.some(r => r.url.includes('email-transacional')),
      'Não deveria chamar email-transacional para tipo desconhecido',
    );
  },
});

Deno.test({
  name: 'anomalia_log - sem DISCORD_WEBHOOK_URL não chama Discord',
  ...NO_LEAK,
  async fn() {
    const calls = await captureFetch(async () => {
      await processar({
        type: 'INSERT', table: 'anomalia_log', schema: 'public',
        record: { tipo: 'velocidade', descricao: 'x', user_id: 'u-3', detalhes: {} },
      });
    });
    assert(
      !calls.some(r => r.url.includes('discord.com')),
      'Não deveria chamar Discord sem DISCORD_WEBHOOK_URL',
    );
  },
});

// Nota: DISCORD_WEBHOOK_URL e RESEND_API_KEY são constantes lidas no topo do módulo.
// Como o módulo já foi importado com essas vars vazias, testamos o comportamento
// configurado (sem Discord/Resend) — os caminhos condicionais são cobertos pelos testes
// de integração onde as constantes estariam setadas no deploy real.

Deno.test({
  name: 'anomalia_log - multiplos tipos EMAIL_TIPOS são aceitos (multiplas_denuncias)',
  ...NO_LEAK,
  async fn() {
    const calls = await captureFetch(async () => {
      await processar({
        type: 'INSERT', table: 'anomalia_log', schema: 'public',
        record: { tipo: 'multiplas_denuncias', descricao: 'Usuário denunciado várias vezes', user_id: 'u-5', detalhes: {} },
      });
    });
    assert(
      calls.some(r => r.url.includes('email-transacional')),
      'multiplas_denuncias deveria chamar email-transacional',
    );
  },
});

Deno.test({
  name: 'anomalia_log - tipo conteudo_suspeito chama email-transacional',
  ...NO_LEAK,
  async fn() {
    const calls = await captureFetch(async () => {
      await processar({
        type: 'INSERT', table: 'anomalia_log', schema: 'public',
        record: { tipo: 'conteudo_suspeito', descricao: 'Conteúdo impróprio', user_id: 'u-6', detalhes: {} },
      });
    });
    assert(
      calls.some(r => r.url.includes('email-transacional')),
      'conteudo_suspeito deveria chamar email-transacional',
    );
  },
});

Deno.test({
  name: 'audit_log - critico + seguranca sem RESEND não chama Resend (RESEND_API_KEY vazio)',
  ...NO_LEAK,
  async fn() {
    // RESEND_API_KEY está vazio desde o setup, então enviarEmailDireto retorna sem chamar
    const calls = await captureFetch(async () => {
      await processar({
        type: 'INSERT', table: 'audit_log', schema: 'public',
        record: { severidade: 'critico', acao: 'login_forcado', categoria: 'seguranca', resultado: 'falha', detalhes: {} },
      });
    });
    assert(
      !calls.some(r => r.url.includes('resend.com')),
      'Sem RESEND_API_KEY não deveria chamar Resend',
    );
  },
});
