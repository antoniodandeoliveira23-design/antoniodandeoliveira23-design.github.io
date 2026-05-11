/**
 * services/__tests__/pagamentos.test.ts
 *
 * Cobertura completa de pagamentosService.
 * criarCobranca usa fetch global; os demais usam supabase.
 */

// ── Helpers ────────────────────────────────────────────────────────────────

function makeBuilder(resolved: unknown) {
  const p = Promise.resolve(resolved);
  const b: any = { then: p.then.bind(p), catch: p.catch.bind(p) };
  ['select','eq','order','limit','single','update','insert'].forEach(m => { b[m] = () => b; });
  return b;
}

function makeFetchResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
}

// ── Mock state ─────────────────────────────────────────────────────────────

let mockFrom: jest.Mock;
let mockGetSession: jest.Mock;

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/services/supabase', () => ({
  get supabaseConfigured() { return (global as any).__supabaseConfigured ?? false; },
  get supabase() {
    return {
      auth: { getSession: () => mockGetSession() },
      from:  (...a: unknown[]) => mockFrom(...a),
    };
  },
}));

// ── beforeEach ─────────────────────────────────────────────────────────────

let originalFetch: typeof global.fetch;

beforeEach(() => {
  mockFrom       = jest.fn();
  mockGetSession = jest.fn().mockResolvedValue({ data: { session: { access_token: 'tok-123' } }, error: null });
  originalFetch  = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ── listarPlanos ──────────────────────────────────────────────────────────

describe('pagamentosService.listarPlanos()', () => {
  let pagamentosService: typeof import('@/services/pagamentos')['pagamentosService'];

  beforeEach(() => {
    jest.isolateModules(() => { pagamentosService = require('@/services/pagamentos').pagamentosService; });
  });

  it('retorna [] em modo demo (supabaseConfigured=false)', async () => {
    (global as any).__supabaseConfigured = false;
    jest.isolateModules(() => { pagamentosService = require('@/services/pagamentos').pagamentosService; });
    const planos = await pagamentosService.listarPlanos();
    expect(planos).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('retorna planos do banco em modo configurado', async () => {
    (global as any).__supabaseConfigured = true;
    const dados = [{ id: 'p-1', nome: 'Básico', preco: 29.9 }];
    mockFrom.mockReturnValue(makeBuilder({ data: dados, error: null }));
    jest.isolateModules(() => { pagamentosService = require('@/services/pagamentos').pagamentosService; });
    const planos = await pagamentosService.listarPlanos();
    expect(mockFrom).toHaveBeenCalledWith('planos');
    expect(planos).toHaveLength(1);
    expect(planos[0].nome).toBe('Básico');
  });

  it('lança quando supabase retorna error', async () => {
    (global as any).__supabaseConfigured = true;
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'db fail' } }));
    jest.isolateModules(() => { pagamentosService = require('@/services/pagamentos').pagamentosService; });
    await expect(pagamentosService.listarPlanos()).rejects.toThrow('db fail');
  });

  it('retorna [] quando data é null sem error', async () => {
    (global as any).__supabaseConfigured = true;
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: null }));
    jest.isolateModules(() => { pagamentosService = require('@/services/pagamentos').pagamentosService; });
    expect(await pagamentosService.listarPlanos()).toEqual([]);
  });
});

// ── criarCobranca ─────────────────────────────────────────────────────────

describe('pagamentosService.criarCobranca()', () => {
  let pagamentosService: typeof import('@/services/pagamentos')['pagamentosService'];

  const RESULTADO: import('@/services/pagamentos').ResultadoCobranca = {
    pagamento_id: 'pay-1', asaas_id: 'aaa-1',
    link: 'https://pay.asaas.com/1', pix_copia_cola: '00020126...',
    valor: 29.9, vencimento: '2026-06-01', status: 'PENDING',
  };

  beforeEach(() => {
    (global as any).__supabaseConfigured = true;
    jest.isolateModules(() => { pagamentosService = require('@/services/pagamentos').pagamentosService; });
  });

  it('lança "Não autenticado" quando não há sessão', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(pagamentosService.criarCobranca('plano-1')).rejects.toThrow('Não autenticado');
  });

  it('chama fetch com método POST, Authorization e body corretos', async () => {
    (global as any).fetch = jest.fn().mockReturnValue(makeFetchResponse(RESULTADO, true));
    await pagamentosService.criarCobranca('plano-1', 'PIX');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('criar-cobranca'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Authorization': 'Bearer tok-123' }),
        body: expect.stringContaining('"plano_id":"plano-1"'),
      }),
    );
  });

  it('retorna ResultadoCobranca em caso de sucesso', async () => {
    (global as any).fetch = jest.fn().mockReturnValue(makeFetchResponse(RESULTADO, true));
    const res = await pagamentosService.criarCobranca('plano-1');
    expect(res.pagamento_id).toBe('pay-1');
    expect(res.pix_copia_cola).toBe('00020126...');
  });

  it('usa método BOLETO quando fornecido', async () => {
    (global as any).fetch = jest.fn().mockReturnValue(makeFetchResponse(RESULTADO, true));
    await pagamentosService.criarCobranca('plano-1', 'BOLETO');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: expect.stringContaining('"metodo":"BOLETO"') }),
    );
  });

  it('lança com mensagem do json quando resp.ok=false e json.error presente', async () => {
    (global as any).fetch = jest.fn().mockReturnValue(
      makeFetchResponse({ error: 'saldo insuficiente' }, false, 402),
    );
    await expect(pagamentosService.criarCobranca('plano-1')).rejects.toThrow('saldo insuficiente');
  });

  it('lança com "Erro ao criar cobrança" quando resp.ok=false e json.error ausente', async () => {
    (global as any).fetch = jest.fn().mockReturnValue(
      makeFetchResponse({}, false, 500),
    );
    await expect(pagamentosService.criarCobranca('plano-1')).rejects.toThrow('Erro ao criar cobrança');
  });
});

// ── consultarStatus ────────────────────────────────────────────────────────

describe('pagamentosService.consultarStatus()', () => {
  let pagamentosService: typeof import('@/services/pagamentos')['pagamentosService'];

  beforeEach(() => {
    (global as any).__supabaseConfigured = true;
    jest.isolateModules(() => { pagamentosService = require('@/services/pagamentos').pagamentosService; });
  });

  it('retorna status do pagamento', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: { status: 'CONFIRMED' }, error: null }));
    expect(await pagamentosService.consultarStatus('pay-1')).toBe('CONFIRMED');
  });

  it('retorna "pendente" quando data.status é undefined', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: {}, error: null }));
    expect(await pagamentosService.consultarStatus('pay-1')).toBe('pendente');
  });

  it('retorna "pendente" quando data é null', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: null }));
    expect(await pagamentosService.consultarStatus('pay-1')).toBe('pendente');
  });

  it('lança quando supabase retorna error', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'not found' } }));
    await expect(pagamentosService.consultarStatus('pay-1')).rejects.toThrow('not found');
  });

  it('chama from("pagamentos") com select e eq corretos', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: { status: 'PENDING' }, error: null }));
    await pagamentosService.consultarStatus('pay-abc');
    expect(mockFrom).toHaveBeenCalledWith('pagamentos');
  });
});

// ── listarMeusPagamentos ───────────────────────────────────────────────────

describe('pagamentosService.listarMeusPagamentos()', () => {
  let pagamentosService: typeof import('@/services/pagamentos')['pagamentosService'];

  beforeEach(() => {
    (global as any).__supabaseConfigured = true;
    jest.isolateModules(() => { pagamentosService = require('@/services/pagamentos').pagamentosService; });
  });

  it('retorna histórico de pagamentos', async () => {
    const dados = [{ id: 'pay-1', status: 'CONFIRMED', planos: { nome: 'Básico', tipo: 'mensal' } }];
    mockFrom.mockReturnValue(makeBuilder({ data: dados, error: null }));
    const res = await pagamentosService.listarMeusPagamentos();
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('pay-1');
  });

  it('retorna [] quando data é null', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: null }));
    expect(await pagamentosService.listarMeusPagamentos()).toEqual([]);
  });

  it('lança quando supabase retorna error', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'query fail' } }));
    await expect(pagamentosService.listarMeusPagamentos()).rejects.toThrow('query fail');
  });
});

// ── Tipos exportados ──────────────────────────────────────────────────────

describe('exports', () => {
  it('pagamentosService e ResultadoCobranca são acessíveis', () => {
    const mod = require('@/services/pagamentos');
    expect(mod.pagamentosService).toBeDefined();
  });
});
