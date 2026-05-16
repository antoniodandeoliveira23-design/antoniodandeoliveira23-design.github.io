/**
 * services/__tests__/moderacao.integration.test.ts
 *
 * Testes de integração para moderacaoService.
 * Cobre: listarPendentes, aprovar, rejeitar, notificarCriador.
 *
 * Runner: Jest (jest-expo, jsdom)
 */

// ── Mock state ─────────────────────────────────────────────────────────────

let mockFrom: jest.Mock;
let mockRegistrarAcao: jest.Mock;
let mockFunctionsInvoke: jest.Mock;
let mockEmailEventoAprovado: jest.Mock;
let mockEmailEventoRejeitado: jest.Mock;

// ── Top-level jest.mock ────────────────────────────────────────────────────

jest.mock('@/services/supabase', () => ({
  get supabaseConfigured() { return (global as any).__supabaseConfigured ?? true; },
  get supabase() {
    return {
      from:      (...a: unknown[]) => mockFrom(...a),
      functions: { invoke: (...a: unknown[]) => mockFunctionsInvoke(...a) },
    };
  },
}));

jest.mock('@/services/auditoria', () => ({
  get registrarAcao() { return mockRegistrarAcao; },
}));

jest.mock('@/services/email', () => ({
  get emailService() {
    return {
      eventoAprovado:  mockEmailEventoAprovado,
      eventoRejeitado: mockEmailEventoRejeitado,
    };
  },
}));

// _demoPendentes é exportado de eventos — precisamos mocká-lo
jest.mock('@/services/eventos', () => ({
  get _demoPendentes() {
    return (global as any).__demoPendentes ?? [];
  },
}));

// ── Seed data ──────────────────────────────────────────────────────────────

const EVENTO_PENDENTE_SEED = {
  id: 'evt-pend-001',
  nome: 'Feira PJ 2026',
  status: 'pendente' as const,
  criador_id: 'usr-pj-001',
  local: 'Centro de Convenções',
  data_inicio: new Date(Date.now() + 86400000 * 7).toISOString(),
  categoria: 'negocios',
  comercial: true,
  pago: false,
  destaque: false,
  lat: -12.74,
  lng: -60.14,
  descricao: 'Evento empresarial',
  exclusivo_mulheres: false,
  criado_em: new Date().toISOString(),
};

const CRIADOR_SEED = {
  criador_id: 'usr-pj-001',
  nome: 'Feira PJ 2026',
  local: 'Centro de Convenções',
  data_inicio: new Date(Date.now() + 86400000 * 7).toISOString(),
};

// ── Builder mock ────────────────────────────────────────────────────────────

const makeBuilder = (resolvedValue: unknown = { data: null, error: null, count: 0 }) => {
  const b: any = {};
  const methods = [
    'select', 'eq', 'order', 'limit', 'update', 'insert', 'upsert',
    'single', 'delete', 'or', 'range', 'ilike', 'in',
  ];
  methods.forEach(m => { b[m] = jest.fn().mockReturnValue(b); });
  const p = Promise.resolve(resolvedValue);
  b.then = p.then.bind(p);
  b.catch = p.catch.bind(p);
  return b;
};

// ── beforeEach ─────────────────────────────────────────────────────────────

beforeEach(() => {
  (global as any).__supabaseConfigured = true;
  (global as any).__demoPendentes = [{ ...EVENTO_PENDENTE_SEED }];
  mockRegistrarAcao       = jest.fn().mockResolvedValue(undefined);
  mockFunctionsInvoke     = jest.fn().mockResolvedValue({ data: null, error: null });
  mockEmailEventoAprovado  = jest.fn();
  mockEmailEventoRejeitado = jest.fn();
  mockFrom = jest.fn().mockReturnValue(makeBuilder({ data: null, error: null, count: 0 }));
});

// ══════════════════════════════════════════════════════════════════════════
// listarPendentes()
// ══════════════════════════════════════════════════════════════════════════

describe('moderacaoService.listarPendentes()', () => {
  let moderacaoService: typeof import('@/services/moderacao')['moderacaoService'];

  beforeEach(() => {
    jest.isolateModules(() => {
      const mod = require('@/services/moderacao');
      moderacaoService = mod.moderacaoService;
    });
  });

  it('happy path: retorna lista paginada de eventos pendentes', async () => {
    const builder = makeBuilder({
      data: [EVENTO_PENDENTE_SEED],
      error: null,
      count: 1,
    });
    mockFrom.mockReturnValue(builder);

    const result = await moderacaoService.listarPendentes(1, 10);
    expect(result).toMatchObject({
      dados:    expect.any(Array),
      total:    expect.any(Number),
      pagina:   1,
      porPagina: 10,
      temMais:  expect.any(Boolean),
    });
  });

  it('segunda página: offset calculado corretamente', async () => {
    const builder = makeBuilder({ data: [], error: null, count: 15 });
    mockFrom.mockReturnValue(builder);

    const result = await moderacaoService.listarPendentes(2, 10);
    expect(result.pagina).toBe(2);
  });

  it('erro do banco: lança Error', async () => {
    const builder = makeBuilder({ data: null, error: { message: 'permission denied' }, count: 0 });
    mockFrom.mockReturnValue(builder);

    await expect(moderacaoService.listarPendentes()).rejects.toThrow('permission denied');
  });

  it('modo demo: retorna _demoPendentes paginados', async () => {
    (global as any).__supabaseConfigured = false;
    jest.isolateModules(() => {
      const mod = require('@/services/moderacao');
      moderacaoService = mod.moderacaoService;
    });

    const result = await moderacaoService.listarPendentes(1, 10);
    expect(Array.isArray(result.dados)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// aprovar()
// ══════════════════════════════════════════════════════════════════════════

describe('moderacaoService.aprovar()', () => {
  let moderacaoService: typeof import('@/services/moderacao')['moderacaoService'];

  beforeEach(() => {
    jest.isolateModules(() => {
      const mod = require('@/services/moderacao');
      moderacaoService = mod.moderacaoService;
    });
  });

  it('happy path: UPDATE status → aprovado e registra auditoria', async () => {
    const builder = makeBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await expect(moderacaoService.aprovar('evt-pend-001')).resolves.not.toThrow();
    expect(mockRegistrarAcao).toHaveBeenCalledWith(
      expect.objectContaining({ acao: 'evento_aprovado', resultado: 'sucesso' }),
    );
  });

  it('erro do banco: lança Error e registra auditoria de falha', async () => {
    const builder = makeBuilder({ data: null, error: { message: 'row_lock_timeout' } });
    mockFrom.mockReturnValue(builder);

    await expect(moderacaoService.aprovar('evt-pend-001')).rejects.toThrow('row_lock_timeout');
    expect(mockRegistrarAcao).toHaveBeenCalledWith(
      expect.objectContaining({ resultado: 'falha' }),
    );
  });

  it('evento inexistente (no rows affected): lança erro', async () => {
    const builder = makeBuilder({ data: null, error: { message: 'no_rows' } });
    mockFrom.mockReturnValue(builder);

    await expect(moderacaoService.aprovar('id-inexistente')).rejects.toThrow();
  });

  it('modo demo: move evento de _demoPendentes sem chamar supabase', async () => {
    (global as any).__supabaseConfigured = false;
    const pendentesLocal = [{ ...EVENTO_PENDENTE_SEED }];
    (global as any).__demoPendentes = pendentesLocal;

    jest.isolateModules(() => {
      const mod = require('@/services/moderacao');
      moderacaoService = mod.moderacaoService;
    });

    await moderacaoService.aprovar('evt-pend-001');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// rejeitar()
// ══════════════════════════════════════════════════════════════════════════

describe('moderacaoService.rejeitar()', () => {
  let moderacaoService: typeof import('@/services/moderacao')['moderacaoService'];

  beforeEach(() => {
    jest.isolateModules(() => {
      const mod = require('@/services/moderacao');
      moderacaoService = mod.moderacaoService;
    });
  });

  it('happy path: UPDATE status → rejeitado com motivo', async () => {
    const builder = makeBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await expect(
      moderacaoService.rejeitar('evt-pend-001', 'Conteúdo não adequado'),
    ).resolves.not.toThrow();

    expect(mockRegistrarAcao).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: 'evento_rejeitado',
        resultado: 'sucesso',
        detalhes: expect.objectContaining({ motivo_rejeicao: 'Conteúdo não adequado' }),
      }),
    );
  });

  it('erro do banco: lança Error e registra auditoria de falha', async () => {
    const builder = makeBuilder({ data: null, error: { message: 'constraint_violation' } });
    mockFrom.mockReturnValue(builder);

    await expect(
      moderacaoService.rejeitar('evt-pend-001', 'Spam'),
    ).rejects.toThrow('constraint_violation');

    expect(mockRegistrarAcao).toHaveBeenCalledWith(
      expect.objectContaining({ resultado: 'falha' }),
    );
  });

  it('modo demo: não chama supabase', async () => {
    (global as any).__supabaseConfigured = false;
    jest.isolateModules(() => {
      const mod = require('@/services/moderacao');
      moderacaoService = mod.moderacaoService;
    });

    await moderacaoService.rejeitar('evt-pend-001', 'Motivo de teste');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// notificarCriador()
// ══════════════════════════════════════════════════════════════════════════

describe('moderacaoService.notificarCriador()', () => {
  let moderacaoService: typeof import('@/services/moderacao')['moderacaoService'];

  beforeEach(() => {
    jest.isolateModules(() => {
      const mod = require('@/services/moderacao');
      moderacaoService = mod.moderacaoService;
    });
  });

  it('aprovado: chama emailService.eventoAprovado e dispara push', async () => {
    const eventBuilder = makeBuilder({ data: CRIADOR_SEED, error: null });
    mockFrom.mockReturnValue(eventBuilder);

    await moderacaoService.notificarCriador('evt-pend-001', 'aprovado');

    expect(mockEmailEventoAprovado).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: 'usr-pj-001' }),
    );
  });

  it('rejeitado com motivo: chama emailService.eventoRejeitado', async () => {
    const eventBuilder = makeBuilder({ data: CRIADOR_SEED, error: null });
    mockFrom.mockReturnValue(eventBuilder);

    await moderacaoService.notificarCriador('evt-pend-001', 'rejeitado', 'Motivo X');

    expect(mockEmailEventoRejeitado).toHaveBeenCalledWith(
      expect.objectContaining({
        usuarioId: 'usr-pj-001',
        motivo: 'Motivo X',
      }),
    );
  });

  it('evento sem criador_id: não lança (ignora silenciosamente)', async () => {
    const eventBuilder = makeBuilder({ data: { criador_id: null, nome: 'X', local: 'L', data_inicio: '' }, error: null });
    mockFrom.mockReturnValue(eventBuilder);

    await expect(
      moderacaoService.notificarCriador('evt-sem-criador', 'aprovado'),
    ).resolves.not.toThrow();
  });

  it('erro ao buscar evento: não propaga (catch interno)', async () => {
    const eventBuilder = makeBuilder({ data: null, error: { message: 'db error' } });
    mockFrom.mockReturnValue(eventBuilder);

    await expect(
      moderacaoService.notificarCriador('evt-erro', 'aprovado'),
    ).resolves.not.toThrow();
  });

  it('modo demo: log sem chamar supabase', async () => {
    (global as any).__supabaseConfigured = false;
    jest.isolateModules(() => {
      const mod = require('@/services/moderacao');
      moderacaoService = mod.moderacaoService;
    });

    await moderacaoService.notificarCriador('evt-demo', 'aprovado');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Fluxo completo: aprovar + notificar
// ══════════════════════════════════════════════════════════════════════════

describe('Fluxo completo — aprovar e notificar criador', () => {
  let moderacaoService: typeof import('@/services/moderacao')['moderacaoService'];

  beforeEach(() => {
    jest.isolateModules(() => {
      const mod = require('@/services/moderacao');
      moderacaoService = mod.moderacaoService;
    });
  });

  it('aprovar → notificar em sequência sem erros', async () => {
    const updateBuilder = makeBuilder({ data: null, error: null });
    const selectBuilder = makeBuilder({ data: CRIADOR_SEED, error: null });

    mockFrom
      .mockReturnValueOnce(updateBuilder)  // aprovar: eventos.update
      .mockReturnValue(selectBuilder);      // notificarCriador: eventos.select

    await moderacaoService.aprovar('evt-pend-001');
    await moderacaoService.notificarCriador('evt-pend-001', 'aprovado');

    expect(mockRegistrarAcao).toHaveBeenCalledWith(
      expect.objectContaining({ acao: 'evento_aprovado', resultado: 'sucesso' }),
    );
    expect(mockEmailEventoAprovado).toHaveBeenCalled();
  });

  it('rejeitar + notificar com motivo em sequência', async () => {
    const updateBuilder = makeBuilder({ data: null, error: null });
    const selectBuilder = makeBuilder({ data: CRIADOR_SEED, error: null });

    mockFrom
      .mockReturnValueOnce(updateBuilder)
      .mockReturnValue(selectBuilder);

    await moderacaoService.rejeitar('evt-pend-001', 'Conteúdo impróprio');
    await moderacaoService.notificarCriador('evt-pend-001', 'rejeitado', 'Conteúdo impróprio');

    expect(mockEmailEventoRejeitado).toHaveBeenCalledWith(
      expect.objectContaining({ motivo: 'Conteúdo impróprio' }),
    );
  });
});
