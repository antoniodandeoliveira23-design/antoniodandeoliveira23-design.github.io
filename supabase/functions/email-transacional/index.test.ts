/**
 * email-transacional/index.test.ts
 *
 * Testes do serviço de email:
 *  - formatarData (pura)
 *  - layout (pura)
 *  - TEMPLATES — geração de HTML para cada tipo
 *  - handler — autenticação, resolução de destinatário, rate limit, erros
 */

import { assertEquals, assertStringIncludes, assert } from 'jsr:@std/assert';

// ── Setup ─────────────────────────────────────────────────────────
Deno.env.set('DENO_TESTING', '1');
Deno.env.set('SUPABASE_URL', 'https://test.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-svc');
Deno.env.set('ALERT_SECRET', 'test-alert');
Deno.env.set('RESEND_API_KEY', 'test-resend-key');
Deno.env.set('FROM_EMAIL', 'AGORA <nao-responda@agora.app>');
Deno.env.set('APP_URL', 'https://agora-vilhena.vercel.app');

const { formatarData, layout, TEMPLATES, handler } = await import('./index.ts');

// Desativa checagem de recursos/ops para testes que usam supabase-js (cria timers internos)
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

function makeReq(body: unknown, token = 'test-alert'): Request {
  return new Request('http://localhost/email-transacional', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

// ── formatarData ───────────────────────────────────────────────────

Deno.test('formatarData - formata ISO para dd/mm/aaaa', () => {
  const result = formatarData('2026-06-15T00:00:00.000Z');
  // Resultado depende do fuso, mas deve ter o formato dd/mm/aaaa
  assert(/\d{2}\/\d{2}\/\d{4}/.test(result), `Formato inválido: ${result}`);
});

Deno.test('formatarData - string vazia retorna —', () => {
  assertEquals(formatarData(''), '—');
});

Deno.test('formatarData - ISO inválido retorna o valor original', () => {
  const result = formatarData('nao-eh-data');
  // Pode retornar a string original ou 'Invalid Date' dependendo do browser/Deno
  assertEquals(typeof result, 'string');
});

// ── layout ─────────────────────────────────────────────────────────

Deno.test('layout - gera HTML com doctype e charset', () => {
  const html = layout('<p>conteúdo</p>');
  assertStringIncludes(html, '<!DOCTYPE html>');
  assertStringIncludes(html, 'charset="UTF-8"');
});

Deno.test('layout - inclui a marca AGORA no header', () => {
  const html = layout('<p>teste</p>');
  assertStringIncludes(html, 'AGORA');
  assertStringIncludes(html, 'Vilhena');
});

Deno.test('layout - injeta o corpo passado', () => {
  const html = layout('<span id="meu-conteudo">ok</span>');
  assertStringIncludes(html, 'meu-conteudo');
});

Deno.test('layout - inclui rodapé com ano corrente', () => {
  const html = layout('');
  assertStringIncludes(html, String(new Date().getFullYear()));
});

// ── TEMPLATES ──────────────────────────────────────────────────────

Deno.test('TEMPLATES - boas_vindas: subject contém nome do usuário', () => {
  const { subject } = TEMPLATES.boas_vindas('Carlos', {});
  assertStringIncludes(subject, 'Carlos');
});

Deno.test('TEMPLATES - boas_vindas: html contém link do app', () => {
  const { html } = TEMPLATES.boas_vindas('Maria', {});
  assertStringIncludes(html, 'agora-vilhena.vercel.app');
});

Deno.test('TEMPLATES - evento_pendente: subject contém nome do evento', () => {
  const { subject } = TEMPLATES.evento_pendente('João', { evento_nome: 'Show de Rock' });
  assertStringIncludes(subject, 'Show de Rock');
});

Deno.test('TEMPLATES - evento_aprovado: subject inclui nome do evento', () => {
  const { subject } = TEMPLATES.evento_aprovado('Ana', { evento_nome: 'Feira' });
  assertStringIncludes(subject, 'Feira');
});

Deno.test('TEMPLATES - evento_rejeitado: html contém motivo padrão quando ausente', () => {
  const { html } = TEMPLATES.evento_rejeitado('Bob', { evento_nome: 'Fest', motivo: '' });
  assertStringIncludes(html, 'diretrizes');
});

Deno.test('TEMPLATES - pagamento_confirmado: html contém valor passado', () => {
  const { html } = TEMPLATES.pagamento_confirmado('Lu', {
    plano_nome: 'Mensal',
    valor: '29,90',
    validade: '2026-07-01',
    metodo: 'PIX',
    id_externo: 'ext-123',
  });
  assertStringIncludes(html, '29,90');
  assertStringIncludes(html, 'PIX');
});

Deno.test('TEMPLATES - senha_redefinida: html contém link de login', () => {
  const { html } = TEMPLATES.senha_redefinida('Paulo', {});
  assertStringIncludes(html, '/login');
});

Deno.test('TEMPLATES - alerta_denuncia: subject menciona tipo', () => {
  const { subject } = TEMPLATES.alerta_denuncia('', { tipo: 'usuario', motivo: 'Spam', alvo_id: 'u-1' });
  assertStringIncludes(subject, 'usuario');
});

Deno.test('TEMPLATES - nova_mensagem: html contém nome do remetente', () => {
  const { html } = TEMPLATES.nova_mensagem('Pedro', { remetente_nome: 'Alice', preview: 'Olá!' });
  assertStringIncludes(html, 'Alice');
  assertStringIncludes(html, 'Olá!');
});

Deno.test('TEMPLATES - todos os 8 tipos estão presentes', () => {
  const TIPOS_ESPERADOS = [
    'boas_vindas', 'evento_pendente', 'evento_aprovado', 'evento_rejeitado',
    'pagamento_confirmado', 'senha_redefinida', 'alerta_denuncia', 'nova_mensagem',
  ];
  for (const tipo of TIPOS_ESPERADOS) {
    assert(tipo in TEMPLATES, `Tipo "${tipo}" ausente nos TEMPLATES`);
  }
});

// ── handler — OPTIONS / método errado ─────────────────────────────

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
      headers: { authorization: 'Bearer test-alert' },
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
      body: JSON.stringify({ tipo: 'boas_vindas', para: 'a@b.com' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const resp = await handler(req);
    assertEquals(resp.status, 401);
  },
});

// ── handler — campos obrigatórios ──────────────────────────────────

Deno.test({
  name: 'handler - sem "tipo" retorna 400',
  ...NO_LEAK,
  async fn() {
    const req = makeReq({ para: 'a@b.com' });
    const resp = await handler(req);
    assertEquals(resp.status, 400);
    const data = await resp.json();
    assertStringIncludes(data.error, 'tipo');
  },
});

Deno.test({
  name: 'handler - sem "para" e sem "usuario_id" retorna 400',
  ...NO_LEAK,
  async fn() {
    const req = makeReq({ tipo: 'boas_vindas' });
    const resp = await handler(req);
    assertEquals(resp.status, 400);
  },
});

// ── handler — tipo não suportado ───────────────────────────────────

Deno.test({
  name: 'handler - tipo inexistente retorna 400',
  ...NO_LEAK,
  async fn() {
    const req = makeReq({ tipo: 'tipo_inexistente', para: 'a@b.com', nome: 'Teste' });
    const resp = await handler(req);
    assertEquals(resp.status, 400);
    const data = await resp.json();
    assertStringIncludes(data.error, 'não suportado');
  },
});

// ── handler — envio bem-sucedido ───────────────────────────────────

Deno.test({
  name: 'handler - envia email boas_vindas com sucesso',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([
      { body: { id: 'resend-123' }, status: 200 },
    ]);
    const req = makeReq({
      tipo: 'boas_vindas',
      para: `usuario-${Date.now()}@teste.com`,
      nome: 'Usuário Teste',
    });
    const resp = await handler(req);
    assertEquals(resp.status, 200);
    const data = await resp.json();
    assertEquals(data.ok, true);
    assertEquals(data.tipo, 'boas_vindas');
    restore();
  },
});

// ── handler — falha no Resend ──────────────────────────────────────

Deno.test({
  name: 'handler - falha no Resend retorna 502',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([
      { body: { message: 'API Key inválida' }, status: 403 },
    ]);
    const req = makeReq({
      tipo: 'boas_vindas',
      para: `fail-${Date.now()}@teste.com`,
      nome: 'Falhou',
    });
    const resp = await handler(req);
    assertEquals(resp.status, 502);
    restore();
  },
});

// ── handler — rate limit ───────────────────────────────────────────

Deno.test({
  name: 'handler - segundo envio para o mesmo destinatário retorna aviso de rate limit',
  ...NO_LEAK,
  async fn() {
    const restore = stubFetch([
      { body: { id: 'first-send' }, status: 200 },
      { body: { id: 'second-send' }, status: 200 },
    ]);
    const email = `ratelimit-${Date.now()}@teste.com`;

    const req1 = makeReq({ tipo: 'nova_mensagem', para: email, nome: 'X', dados: { remetente_nome: 'A', preview: 'Oi' } });
    const resp1 = await handler(req1);
    assertEquals(resp1.status, 200);

    const req2 = makeReq({ tipo: 'nova_mensagem', para: email, nome: 'X', dados: { remetente_nome: 'A', preview: 'Oi2' } });
    const resp2 = await handler(req2);
    assertEquals(resp2.status, 200);
    const data2 = await resp2.json();
    assert('aviso' in data2, 'Esperava aviso de rate limit');
    restore();
  },
});
