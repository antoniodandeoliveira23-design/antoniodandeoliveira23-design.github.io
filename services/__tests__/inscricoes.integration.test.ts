/**
 * services/__tests__/inscricoes.integration.test.ts
 *
 * Testes de integração para inscricoesService.
 * Cobre: inscrever, cancelar, listarIds, estaInscrito, listarComEvento,
 * contarInscritos e toggle.
 *
 * Runner: Jest (jest-expo, jsdom)
 */

// ── Mock state ─────────────────────────────────────────────────────────────

let mockFrom: jest.Mock;
let mockFunctionsInvoke: jest.Mock;

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

// ── Seed data ──────────────────────────────────────────────────────────────

const INSCRICAO_SEED = {
  id: 'ins-001',
  evento_id: 'evt-001',
  usuario_id: 'usr-001',
  status: 'confirmada' as const,
  criado_em: new Date().toISOString(),
  atualizado_em: new Date().toISOString(),
};

const INSCRICAO_COM_EVENTO_SEED = {
  ...INSCRICAO_SEED,
  eventos: {
    id: 'evt-001',
    nome: 'Show Rock',
    local: 'Praça Central',
    data_inicio: new Date(Date.now() + 86400000).toISOString(),
    imagem_url: null,
    categoria: 'musica',
  },
};

// ── Builder mock ────────────────────────────────────────────────────────────

const makeBuilder = (resolvedValue: unknown = { data: null, error: null }) => {
  const b: any = {};
  const methods = [
    'select', 'eq', 'order', 'limit', 'update', 'insert', 'upsert',
    'single', 'delete', 'or', 'range', 'ilike', 'in', 'neq',
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
  mockFrom              = jest.fn().mockReturnValue(makeBuilder({ data: null, error: null }));
  mockFunctionsInvoke   = jest.fn().mockResolvedValue({ data: null, error: null });
});

// ══════════════════════════════════════════════════════════════════════════
// inscrever()
// ══════════════════════════════════════════════════════════════════════════

describe('inscricoesService.inscrever()', () => {
  let inscricoesService: typeof import('@/services/inscricoes')['inscricoesService'];

  beforeEach(() => {
    jest.isolateModules(() => {
      const mod = require('@/services/inscricoes');
      inscricoesService = mod.inscricoesService;
    });
  });

  it('happy path: INSERT via upsert, não lança erro', async () => {
    const builder = makeBuilder({ data: [INSCRICAO_SEED], error: null });
    mockFrom.mockReturnValue(builder);

    await expect(
      inscricoesService.inscrever('evt-001', 'usr-001'),
    ).resolves.not.toThrow();

    expect(mockFrom).toHaveBeenCalledWith('inscricoes');
  });

  it('dispara push notification (fire-and-forget)', async () => {
    const builder = makeBuilder({ data: [INSCRICAO_SEED], error: null });
    mockFrom.mockReturnValue(builder);

    await inscricoesService.inscrever('evt-001', 'usr-001');

    // O código chama supabase.functions.invoke sem await (fire-and-forget).
    // A chamada é feita de forma síncrona antes do retorno, então deve ser 1.
    expect(mockFunctionsInvoke).toHaveBeenCalledTimes(1);
    expect(mockFunctionsInvoke).toHaveBeenCalledWith(
      'enviar-push',
      expect.objectContaining({
        body: expect.objectContaining({
          usuario_id: 'usr-001',
          tipo: 'inscricao_confirmada',
        }),
      }),
    );
  });

  it('erro do Supabase: lança Error com mensagem', async () => {
    const builder = makeBuilder({ data: null, error: { message: 'unique_violation' } });
    mockFrom.mockReturnValue(builder);

    await expect(
      inscricoesService.inscrever('evt-001', 'usr-001'),
    ).rejects.toThrow('unique_violation');
  });

  it('modo demo: adiciona à lista local sem chamar supabase', async () => {
    (global as any).__supabaseConfigured = false;
    jest.isolateModules(() => {
      const mod = require('@/services/inscricoes');
      inscricoesService = mod.inscricoesService;
    });

    await inscricoesService.inscrever('evt-demo', 'usr-demo');
    expect(mockFrom).not.toHaveBeenCalled();

    const estaInscrito = await inscricoesService.estaInscrito('evt-demo', 'usr-demo');
    expect(estaInscrito).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// cancelar()
// ══════════════════════════════════════════════════════════════════════════

describe('inscricoesService.cancelar()', () => {
  let inscricoesService: typeof import('@/services/inscricoes')['inscricoesService'];

  beforeEach(() => {
    jest.isolateModules(() => {
      const mod = require('@/services/inscricoes');
      inscricoesService = mod.inscricoesService;
    });
  });

  it('happy path: UPDATE status → cancelada, não lança', async () => {
    const builder = makeBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await expect(
      inscricoesService.cancelar('evt-001', 'usr-001'),
    ).resolves.not.toThrow();

    expect(mockFrom).toHaveBeenCalledWith('inscricoes');
  });

  it('erro do banco: lança Error com mensagem', async () => {
    const builder = makeBuilder({ data: null, error: { message: 'row not found' } });
    mockFrom.mockReturnValue(builder);

    await expect(
      inscricoesService.cancelar('evt-001', 'usr-001'),
    ).rejects.toThrow('row not found');
  });

  it('modo demo: remove do Set local', async () => {
    (global as any).__supabaseConfigured = false;
    jest.isolateModules(() => {
      const mod = require('@/services/inscricoes');
      inscricoesService = mod.inscricoesService;
    });

    await inscricoesService.inscrever('evt-c', 'usr-c');
    expect(await inscricoesService.estaInscrito('evt-c', 'usr-c')).toBe(true);

    await inscricoesService.cancelar('evt-c', 'usr-c');
    expect(await inscricoesService.estaInscrito('evt-c', 'usr-c')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// listarIds()
// ══════════════════════════════════════════════════════════════════════════

describe('inscricoesService.listarIds()', () => {
  let inscricoesService: typeof import('@/services/inscricoes')['inscricoesService'];

  beforeEach(() => {
    jest.isolateModules(() => {
      const mod = require('@/services/inscricoes');
      inscricoesService = mod.inscricoesService;
    });
  });

  it('retorna Set com evento_ids do usuário', async () => {
    const builder = makeBuilder({ data: [{ evento_id: 'evt-001' }, { evento_id: 'evt-002' }], error: null });
    mockFrom.mockReturnValue(builder);

    const ids = await inscricoesService.listarIds('usr-001');
    expect(ids).toBeInstanceOf(Set);
    expect(ids.has('evt-001')).toBe(true);
    expect(ids.has('evt-002')).toBe(true);
  });

  it('erro silencioso: retorna Set vazio sem lançar', async () => {
    const builder = makeBuilder({ data: null, error: { message: 'network error' } });
    mockFrom.mockReturnValue(builder);

    const ids = await inscricoesService.listarIds('usr-001');
    expect(ids).toBeInstanceOf(Set);
    expect(ids.size).toBe(0);
  });

  it('modo demo: retorna Set com eventos marcados localmente', async () => {
    (global as any).__supabaseConfigured = false;
    jest.isolateModules(() => {
      const mod = require('@/services/inscricoes');
      inscricoesService = mod.inscricoesService;
    });

    await inscricoesService.inscrever('evt-local', 'usr-demo');
    const ids = await inscricoesService.listarIds('usr-demo');
    expect(ids.has('evt-local')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// estaInscrito()
// ══════════════════════════════════════════════════════════════════════════

describe('inscricoesService.estaInscrito()', () => {
  let inscricoesService: typeof import('@/services/inscricoes')['inscricoesService'];

  beforeEach(() => {
    jest.isolateModules(() => {
      const mod = require('@/services/inscricoes');
      inscricoesService = mod.inscricoesService;
    });
  });

  it('retorna true quando inscrito', async () => {
    const builder = makeBuilder({ count: 1, error: null });
    mockFrom.mockReturnValue(builder);

    const result = await inscricoesService.estaInscrito('evt-001', 'usr-001');
    expect(result).toBe(true);
  });

  it('retorna false quando não inscrito', async () => {
    const builder = makeBuilder({ count: 0, error: null });
    mockFrom.mockReturnValue(builder);

    const result = await inscricoesService.estaInscrito('evt-001', 'usr-002');
    expect(result).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// listarComEvento()
// ══════════════════════════════════════════════════════════════════════════

describe('inscricoesService.listarComEvento()', () => {
  let inscricoesService: typeof import('@/services/inscricoes')['inscricoesService'];

  beforeEach(() => {
    jest.isolateModules(() => {
      const mod = require('@/services/inscricoes');
      inscricoesService = mod.inscricoesService;
    });
  });

  it('retorna lista filtrada por usuario_id com dados do evento', async () => {
    const builder = makeBuilder({ data: [INSCRICAO_COM_EVENTO_SEED], error: null });
    mockFrom.mockReturnValue(builder);

    const result = await inscricoesService.listarComEvento('usr-001');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].evento_id).toBe('evt-001');
  });

  it('erro silencioso: retorna [] sem lançar', async () => {
    const builder = makeBuilder({ data: null, error: { message: 'timeout' } });
    mockFrom.mockReturnValue(builder);

    const result = await inscricoesService.listarComEvento('usr-001');
    expect(result).toEqual([]);
  });

  it('modo demo: retorna []', async () => {
    (global as any).__supabaseConfigured = false;
    jest.isolateModules(() => {
      const mod = require('@/services/inscricoes');
      inscricoesService = mod.inscricoesService;
    });

    const result = await inscricoesService.listarComEvento('usr-demo');
    expect(result).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// contarInscritos()
// ══════════════════════════════════════════════════════════════════════════

describe('inscricoesService.contarInscritos()', () => {
  let inscricoesService: typeof import('@/services/inscricoes')['inscricoesService'];

  beforeEach(() => {
    jest.isolateModules(() => {
      const mod = require('@/services/inscricoes');
      inscricoesService = mod.inscricoesService;
    });
  });

  it('retorna contagem correta', async () => {
    const builder = makeBuilder({ count: 42, error: null });
    mockFrom.mockReturnValue(builder);

    const count = await inscricoesService.contarInscritos('evt-001');
    expect(count).toBe(42);
  });

  it('count null retorna 0', async () => {
    const builder = makeBuilder({ count: null, error: null });
    mockFrom.mockReturnValue(builder);

    const count = await inscricoesService.contarInscritos('evt-001');
    expect(count).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// toggle()
// ══════════════════════════════════════════════════════════════════════════

describe('inscricoesService.toggle()', () => {
  let inscricoesService: typeof import('@/services/inscricoes')['inscricoesService'];

  beforeEach(() => {
    jest.isolateModules(() => {
      const mod = require('@/services/inscricoes');
      inscricoesService = mod.inscricoesService;
    });
  });

  it('toggle de não-inscrito: chama inscrever e retorna true', async () => {
    const builder = makeBuilder({ data: [INSCRICAO_SEED], error: null });
    mockFrom.mockReturnValue(builder);

    const result = await inscricoesService.toggle('evt-001', 'usr-001', false);
    expect(result).toBe(true);
  });

  it('toggle de inscrito: chama cancelar e retorna false', async () => {
    const builder = makeBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    const result = await inscricoesService.toggle('evt-001', 'usr-001', true);
    expect(result).toBe(false);
  });
});
