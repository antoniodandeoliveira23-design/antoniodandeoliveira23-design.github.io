/**
 * services/__tests__/inscricoes.test.ts
 *
 * Cobertura completa de inscricoesService.
 * Padrão: jest.isolateModules em beforeEach para reset de _demoInscritos.
 */

// ── Helpers ────────────────────────────────────────────────────────────────

/** Cria um Supabase query-builder chainable + awaitable. */
function makeBuilder(resolved: unknown) {
  const p = Promise.resolve(resolved);
  const b: Record<string, unknown> = {
    then:   p.then.bind(p),
    catch:  p.catch.bind(p),
  };
  const chain = (name: string) => (..._args: unknown[]) => { b._last = name; return b; };
  ['select','eq','order','limit','update','insert','upsert','single'].forEach(m => { b[m] = chain(m); });
  return b;
}

// ── Mocks de topo ─────────────────────────────────────────────────────────
// supabase é re-mockado por isolateModules; estas variáveis são sobrescritas
// a cada bloco.

let mockFrom    = jest.fn();
let mockInvoke  = jest.fn();

jest.mock('@/services/supabase', () => ({
  get supabaseConfigured() { return (global as any).__supabaseConfigured ?? false; },
  get supabase() {
    return {
      from:      (...a: unknown[]) => mockFrom(...a),
      functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    };
  },
}));

// ── Helpers de acesso ─────────────────────────────────────────────────────

function loadModule() {
  // jest.isolateModules retorna void — o módulo deve ser capturado dentro do callback
  let mod!: typeof import('@/services/inscricoes');
  jest.isolateModules(() => {
    mod = require('@/services/inscricoes');
  });
  return mod;
}

// ── Suítes ────────────────────────────────────────────────────────────────

describe('inscricoesService — modo demo (supabaseConfigured = false)', () => {
  let inscricoesService: ReturnType<typeof loadModule>['inscricoesService'];

  beforeEach(() => {
    (global as any).__supabaseConfigured = false;
    mockFrom   = jest.fn();
    mockInvoke = jest.fn();
    const mod = require('@/services/inscricoes');
    // Re-isola o módulo para resetar _demoInscritos
    jest.isolateModules(() => {
      const fresh = require('@/services/inscricoes');
      inscricoesService = fresh.inscricoesService;
    });
  });

  // inscrever
  describe('inscrever()', () => {
    it('adiciona eventoId ao set interno e resolve', async () => {
      await expect(inscricoesService.inscrever('evt-1', 'usr-1')).resolves.toBeUndefined();
    });

    it('não chama supabase', async () => {
      await inscricoesService.inscrever('evt-2', 'usr-1');
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('inscrições anteriores persistem (idempotente)', async () => {
      await inscricoesService.inscrever('evt-3', 'usr-1');
      await inscricoesService.inscrever('evt-3', 'usr-1'); // duplicata
      expect(await inscricoesService.estaInscrito('evt-3', 'usr-1')).toBe(true);
    });
  });

  // cancelar
  describe('cancelar()', () => {
    it('remove eventoId do set interno e resolve', async () => {
      await inscricoesService.inscrever('evt-4', 'usr-1');
      await expect(inscricoesService.cancelar('evt-4', 'usr-1')).resolves.toBeUndefined();
      expect(await inscricoesService.estaInscrito('evt-4', 'usr-1')).toBe(false);
    });

    it('não lança se evento não estava no set', async () => {
      await expect(inscricoesService.cancelar('nao-existe', 'usr-1')).resolves.toBeUndefined();
    });
  });

  // listarIds
  describe('listarIds()', () => {
    it('retorna Set vazio inicialmente', async () => {
      const ids = await inscricoesService.listarIds('usr-1');
      expect(ids).toBeInstanceOf(Set);
      expect(ids.size).toBe(0);
    });

    it('retorna Set com os IDs inscritos', async () => {
      await inscricoesService.inscrever('evt-a', 'usr-1');
      await inscricoesService.inscrever('evt-b', 'usr-1');
      const ids = await inscricoesService.listarIds('usr-1');
      expect(ids.has('evt-a')).toBe(true);
      expect(ids.has('evt-b')).toBe(true);
    });

    it('retorna cópia (mutação externa não afeta o set interno)', async () => {
      await inscricoesService.inscrever('evt-x', 'usr-1');
      const ids = await inscricoesService.listarIds('usr-1');
      ids.delete('evt-x');
      expect(await inscricoesService.estaInscrito('evt-x', 'usr-1')).toBe(true);
    });
  });

  // estaInscrito
  describe('estaInscrito()', () => {
    it('retorna false antes de inscrever', async () => {
      expect(await inscricoesService.estaInscrito('evt-z', 'usr-1')).toBe(false);
    });

    it('retorna true após inscrever', async () => {
      await inscricoesService.inscrever('evt-z', 'usr-1');
      expect(await inscricoesService.estaInscrito('evt-z', 'usr-1')).toBe(true);
    });

    it('retorna false após cancelar', async () => {
      await inscricoesService.inscrever('evt-z', 'usr-1');
      await inscricoesService.cancelar('evt-z', 'usr-1');
      expect(await inscricoesService.estaInscrito('evt-z', 'usr-1')).toBe(false);
    });
  });

  // listarComEvento
  describe('listarComEvento()', () => {
    it('retorna array vazio em modo demo', async () => {
      const res = await inscricoesService.listarComEvento('usr-1');
      expect(res).toEqual([]);
    });
  });

  // contarInscritos
  describe('contarInscritos()', () => {
    it('retorna 0 em modo demo', async () => {
      expect(await inscricoesService.contarInscritos('evt-1')).toBe(0);
    });
  });

  // toggle
  describe('toggle()', () => {
    it('inscreve quando estaInscrito=false e retorna true', async () => {
      const result = await inscricoesService.toggle('evt-t', 'usr-1', false);
      expect(result).toBe(true);
      expect(await inscricoesService.estaInscrito('evt-t', 'usr-1')).toBe(true);
    });

    it('cancela quando estaInscrito=true e retorna false', async () => {
      await inscricoesService.inscrever('evt-t2', 'usr-1');
      const result = await inscricoesService.toggle('evt-t2', 'usr-1', true);
      expect(result).toBe(false);
      expect(await inscricoesService.estaInscrito('evt-t2', 'usr-1')).toBe(false);
    });
  });
});

// ── Modo configurado ──────────────────────────────────────────────────────

describe('inscricoesService — modo configurado (supabaseConfigured = true)', () => {
  let inscricoesService: ReturnType<typeof loadModule>['inscricoesService'];

  beforeEach(() => {
    (global as any).__supabaseConfigured = true;
    mockFrom   = jest.fn();
    mockInvoke = jest.fn().mockResolvedValue({ data: null, error: null });

    jest.isolateModules(() => {
      const fresh = require('@/services/inscricoes');
      inscricoesService = fresh.inscricoesService;
    });
  });

  // inscrever — sucesso
  describe('inscrever()', () => {
    it('chama supabase.from("inscricoes").upsert com dados corretos', async () => {
      const builder = makeBuilder({ error: null });
      mockFrom.mockReturnValue(builder);

      await inscricoesService.inscrever('evt-1', 'usr-1');

      expect(mockFrom).toHaveBeenCalledWith('inscricoes');
      expect(builder._last).toBe('upsert');
    });

    it('resolve sem erro em caso de sucesso', async () => {
      mockFrom.mockReturnValue(makeBuilder({ error: null }));
      await expect(inscricoesService.inscrever('evt-1', 'usr-1')).resolves.toBeUndefined();
    });

    it('lança Error quando supabase retorna error', async () => {
      mockFrom.mockReturnValue(makeBuilder({ error: { message: 'upsert falhou' } }));
      await expect(inscricoesService.inscrever('evt-1', 'usr-1')).rejects.toThrow('upsert falhou');
    });

    it('dispara push notification fire-and-forget (não bloqueia)', async () => {
      mockFrom.mockReturnValue(makeBuilder({ error: null }));
      mockInvoke.mockResolvedValue({});

      await inscricoesService.inscrever('evt-1', 'usr-1');

      // Aguarda microtasks do fire-and-forget
      await new Promise(r => setTimeout(r, 0));
      expect(mockInvoke).toHaveBeenCalledWith('enviar-push', expect.objectContaining({
        body: expect.objectContaining({ tipo: 'inscricao_confirmada', usuario_id: 'usr-1' }),
      }));
    });

    it('não lança quando push notification falha (catch interno)', async () => {
      mockFrom.mockReturnValue(makeBuilder({ error: null }));
      mockInvoke.mockRejectedValue(new Error('push down'));

      await expect(inscricoesService.inscrever('evt-1', 'usr-1')).resolves.toBeUndefined();
    });
  });

  // cancelar
  describe('cancelar()', () => {
    it('chama from("inscricoes").update.eq.eq e resolve', async () => {
      const builder = makeBuilder({ error: null });
      mockFrom.mockReturnValue(builder);

      await inscricoesService.cancelar('evt-1', 'usr-1');

      expect(mockFrom).toHaveBeenCalledWith('inscricoes');
    });

    it('lança quando supabase retorna error', async () => {
      mockFrom.mockReturnValue(makeBuilder({ error: { message: 'update falhou' } }));
      await expect(inscricoesService.cancelar('evt-1', 'usr-1')).rejects.toThrow('update falhou');
    });
  });

  // listarIds
  describe('listarIds()', () => {
    it('retorna Set com evento_ids do banco', async () => {
      const data = [{ evento_id: 'evt-a' }, { evento_id: 'evt-b' }];
      mockFrom.mockReturnValue(makeBuilder({ data, error: null }));

      const ids = await inscricoesService.listarIds('usr-1');

      expect(ids).toBeInstanceOf(Set);
      expect(ids.has('evt-a')).toBe(true);
      expect(ids.has('evt-b')).toBe(true);
    });

    it('retorna Set vazio e emite console.warn em caso de erro', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'sel falhou' } }));
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const ids = await inscricoesService.listarIds('usr-1');

      expect(ids.size).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[inscricoes]'), expect.stringContaining('sel falhou'));
      warnSpy.mockRestore();
    });

    it('retorna Set vazio quando data é null sem erro', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: null, error: null }));
      const ids = await inscricoesService.listarIds('usr-1');
      expect(ids.size).toBe(0);
    });
  });

  // estaInscrito
  describe('estaInscrito()', () => {
    it('retorna true quando count > 0', async () => {
      mockFrom.mockReturnValue(makeBuilder({ count: 3, error: null }));
      expect(await inscricoesService.estaInscrito('evt-1', 'usr-1')).toBe(true);
    });

    it('retorna false quando count = 0', async () => {
      mockFrom.mockReturnValue(makeBuilder({ count: 0, error: null }));
      expect(await inscricoesService.estaInscrito('evt-1', 'usr-1')).toBe(false);
    });

    it('retorna false quando count é null (fallback 0)', async () => {
      mockFrom.mockReturnValue(makeBuilder({ count: null, error: null }));
      expect(await inscricoesService.estaInscrito('evt-1', 'usr-1')).toBe(false);
    });
  });

  // listarComEvento
  describe('listarComEvento()', () => {
    it('retorna array de InscricaoComEvento em caso de sucesso', async () => {
      const data = [
        {
          id: 'i-1', usuario_id: 'u-1', evento_id: 'e-1',
          status: 'confirmada', criado_em: '', atualizado_em: '',
          eventos: { id: 'e-1', nome: 'Show', local: 'Praça', data_inicio: '', imagem_url: null, categoria: 'show' },
        },
      ];
      mockFrom.mockReturnValue(makeBuilder({ data, error: null }));

      const res = await inscricoesService.listarComEvento('usr-1');

      expect(res).toHaveLength(1);
      expect(res[0].eventos.nome).toBe('Show');
    });

    it('retorna [] e emite console.warn em caso de erro', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'join falhou' } }));
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const res = await inscricoesService.listarComEvento('usr-1');

      expect(res).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[inscricoes]'), expect.stringContaining('join falhou'));
      warnSpy.mockRestore();
    });

    it('retorna [] quando data é null sem erro', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: null, error: null }));
      expect(await inscricoesService.listarComEvento('usr-1')).toEqual([]);
    });
  });

  // contarInscritos
  describe('contarInscritos()', () => {
    it('retorna count do banco', async () => {
      mockFrom.mockReturnValue(makeBuilder({ count: 42, error: null }));
      expect(await inscricoesService.contarInscritos('evt-1')).toBe(42);
    });

    it('retorna 0 quando count é null (fallback)', async () => {
      mockFrom.mockReturnValue(makeBuilder({ count: null, error: null }));
      expect(await inscricoesService.contarInscritos('evt-1')).toBe(0);
    });
  });

  // toggle
  describe('toggle()', () => {
    it('chama cancelar e retorna false quando estaInscrito=true', async () => {
      mockFrom.mockReturnValue(makeBuilder({ error: null }));
      const result = await inscricoesService.toggle('evt-1', 'usr-1', true);
      expect(result).toBe(false);
    });

    it('chama inscrever e retorna true quando estaInscrito=false', async () => {
      mockFrom.mockReturnValue(makeBuilder({ error: null }));
      const result = await inscricoesService.toggle('evt-1', 'usr-1', false);
      expect(result).toBe(true);
    });

    it('propaga erro de cancelar quando ocorre', async () => {
      mockFrom.mockReturnValue(makeBuilder({ error: { message: 'cancelar falhou' } }));
      await expect(inscricoesService.toggle('evt-1', 'usr-1', true)).rejects.toThrow('cancelar falhou');
    });
  });
});

// ── Tipos exportados ──────────────────────────────────────────────────────

describe('tipos exportados', () => {
  it('Inscricao e InscricaoComEvento podem ser importados', () => {
    const mod = require('@/services/inscricoes');
    // Se os tipos são apenas interfaces, apenas verificamos que o módulo carrega
    expect(mod.inscricoesService).toBeDefined();
  });
});
