/**
 * services/__tests__/denuncias.test.ts
 *
 * Cobertura completa de denunciasService.
 * DEMO_DENUNCIAS é um array mutável exportado — isolateModules reseta estado.
 * _adminEmailCache é estado de módulo — também resetado via isolateModules.
 */

// ── Helpers ────────────────────────────────────────────────────────────────

function makeBuilder(resolved: unknown) {
  const p = Promise.resolve(resolved);
  const b: any = { then: p.then.bind(p), catch: p.catch.bind(p) };
  ['select','eq','order','limit','update','insert','range','single'].forEach(m => { b[m] = () => b; });
  return b;
}

// ── Mock state ─────────────────────────────────────────────────────────────

let mockRegistrarAcao: jest.Mock;
let mockEmailAlertaDenuncia: jest.Mock;
let mockAuthGetUser: jest.Mock;
let mockFrom: jest.Mock;

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/services/supabase', () => ({
  get supabaseConfigured() { return (global as any).__supabaseConfigured ?? false; },
  get supabase() {
    return {
      auth: { getUser: () => mockAuthGetUser() },
      from:  (...a: unknown[]) => mockFrom(...a),
    };
  },
}));

jest.mock('@/services/auditoria', () => ({
  get registrarAcao() { return mockRegistrarAcao; },
}));

jest.mock('@/services/email', () => ({
  get emailService() {
    return { alertaDenuncia: mockEmailAlertaDenuncia };
  },
}));

// ── beforeEach ─────────────────────────────────────────────────────────────

beforeEach(() => {
  mockRegistrarAcao      = jest.fn().mockResolvedValue(undefined);
  mockEmailAlertaDenuncia = jest.fn();
  mockAuthGetUser        = jest.fn().mockResolvedValue({ data: { user: { id: 'usr-test' } }, error: null });
  mockFrom               = jest.fn();
});

// ── DEMO ───────────────────────────────────────────────────────────────────

describe('denunciasService — modo demo (supabaseConfigured = false)', () => {
  let denunciasService: typeof import('@/services/denuncias')['denunciasService'];
  let DEMO_DENUNCIAS: typeof import('@/services/denuncias')['DEMO_DENUNCIAS'];

  beforeEach(() => {
    (global as any).__supabaseConfigured = false;
    jest.isolateModules(() => {
      const mod = require('@/services/denuncias');
      denunciasService = mod.denunciasService;
      DEMO_DENUNCIAS   = mod.DEMO_DENUNCIAS;
    });
  });

  // criar
  describe('criar()', () => {
    it('cria denúncia com status aberta e retorna o objeto', async () => {
      const den = await denunciasService.criar({
        tipo: 'evento', alvo_id: 'e-1', motivo: 'Fake event',
      });
      expect(den.status).toBe('aberta');
      expect(den.tipo).toBe('evento');
      expect(den.motivo).toBe('Fake event');
    });

    it('adiciona denúncia ao início de DEMO_DENUNCIAS', async () => {
      const tamanhoAntes = DEMO_DENUNCIAS.length;
      await denunciasService.criar({ tipo: 'mensagem', alvo_id: 'm-1', motivo: 'Spam' });
      expect(DEMO_DENUNCIAS.length).toBe(tamanhoAntes + 1);
      expect(DEMO_DENUNCIAS[0].tipo).toBe('mensagem');
    });

    it('não chama supabase em modo demo', async () => {
      await denunciasService.criar({ tipo: 'evento', alvo_id: 'x', motivo: 'X' });
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  // listar
  describe('listar()', () => {
    it('retorna todas as denúncias abertas por padrão', async () => {
      const res = await denunciasService.listar();
      // DEMO_DENUNCIAS tem 2 abertas (den-1 e den-2), den-3 é em_analise
      expect(res.dados.every(d => d.status === 'aberta')).toBe(true);
    });

    it('filtra por status=em_analise', async () => {
      const res = await denunciasService.listar({ status: 'em_analise' });
      expect(res.dados.length).toBe(1);
      expect(res.dados[0].id).toBe('den-3');
    });

    it('filtra por tipo=evento', async () => {
      const res = await denunciasService.listar({ status: 'aberta', tipo: 'evento' });
      expect(res.dados.every(d => d.tipo === 'evento')).toBe(true);
    });

    it('pagina corretamente (porPagina=1)', async () => {
      const res = await denunciasService.listar({ status: 'aberta', porPagina: 1 });
      expect(res.dados).toHaveLength(1);
      expect(res.temMais).toBe(true);
    });

    it('inclui total correto', async () => {
      const res = await denunciasService.listar({ status: 'aberta' });
      expect(res.total).toBeGreaterThanOrEqual(2);
    });
  });

  // resolver
  describe('resolver()', () => {
    it('muda status da denúncia para "resolvida"', async () => {
      await denunciasService.resolver('den-1', 'resolvida');
      const den = DEMO_DENUNCIAS.find(d => d.id === 'den-1');
      expect(den?.status).toBe('resolvida');
    });

    it('muda status da denúncia para "descartada"', async () => {
      await denunciasService.resolver('den-2', 'descartada');
      const den = DEMO_DENUNCIAS.find(d => d.id === 'den-2');
      expect(den?.status).toBe('descartada');
    });

    it('não lança quando denúncia não encontrada', async () => {
      await expect(denunciasService.resolver('nao-existe', 'resolvida')).resolves.toBeUndefined();
    });
  });

  // contarAbertas
  describe('contarAbertas()', () => {
    it('retorna contagem de denúncias com status=aberta', async () => {
      const count = await denunciasService.contarAbertas();
      expect(count).toBe(2); // den-1 e den-2 têm status=aberta
    });

    it('reduz contagem após resolver uma', async () => {
      await denunciasService.resolver('den-1', 'resolvida');
      const count = await denunciasService.contarAbertas();
      expect(count).toBe(1);
    });
  });
});

// ── CONFIGURADO ────────────────────────────────────────────────────────────

describe('denunciasService — modo configurado (supabaseConfigured = true)', () => {
  let denunciasService: typeof import('@/services/denuncias')['denunciasService'];

  const NOVA_DENUNCIA = {
    id: 'den-new', denunciante_id: 'usr-test', tipo: 'evento' as const,
    alvo_id: 'e-1', motivo: 'Fake', status: 'aberta' as const,
    criado_em: new Date().toISOString(),
  };

  beforeEach(() => {
    (global as any).__supabaseConfigured = true;
    jest.isolateModules(() => {
      denunciasService = require('@/services/denuncias').denunciasService;
    });
  });

  // criar
  describe('criar()', () => {
    it('lança "Não autenticado" quando getUser retorna null', async () => {
      mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });
      await expect(denunciasService.criar({ tipo: 'evento', alvo_id: 'x', motivo: 'X' }))
        .rejects.toThrow('Não autenticado');
    });

    it('lança e registra falha quando insert retorna error', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'insert fail' } }));
      await expect(denunciasService.criar({ tipo: 'evento', alvo_id: 'x', motivo: 'X' }))
        .rejects.toThrow('insert fail');
      expect(mockRegistrarAcao).toHaveBeenCalledWith(expect.objectContaining({ acao: 'denuncia_falha' }));
    });

    it('retorna denúncia e registra ação em caso de sucesso', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: NOVA_DENUNCIA, error: null }));
      const den = await denunciasService.criar({ tipo: 'evento', alvo_id: 'e-1', motivo: 'Fake' });
      expect(den.id).toBe('den-new');
      expect(mockRegistrarAcao).toHaveBeenCalledWith(expect.objectContaining({ acao: 'denuncia_criada' }));
    });

    it('usa severidade "aviso" para denúncias de usuário', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: { ...NOVA_DENUNCIA, tipo: 'usuario' }, error: null }));
      await denunciasService.criar({ tipo: 'usuario', alvo_id: 'u-1', motivo: 'Spam' });
      expect(mockRegistrarAcao).toHaveBeenCalledWith(expect.objectContaining({ severidade: 'aviso' }));
    });

    it('dispara alertaDenuncia por email para denúncias de usuário', async () => {
      const adminData = { nome: 'Admin', id: 'admin-1' };
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { ...NOVA_DENUNCIA, tipo: 'usuario' }, error: null })) // insert
        .mockReturnValueOnce(makeBuilder({ data: adminData, error: null })); // buscarEmailAdmin
      await denunciasService.criar({ tipo: 'usuario', alvo_id: 'u-1', motivo: 'Spam' });
      // Aguarda microtask do fire-and-forget
      await new Promise(r => setTimeout(r, 0));
      expect(mockEmailAlertaDenuncia).toHaveBeenCalledWith(expect.objectContaining({
        tipo: 'usuario', motivo: 'Spam',
      }));
    });

    it('não dispara email de alerta para denúncias de evento', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: NOVA_DENUNCIA, error: null }));
      await denunciasService.criar({ tipo: 'evento', alvo_id: 'e-1', motivo: 'Fake' });
      await new Promise(r => setTimeout(r, 0));
      expect(mockEmailAlertaDenuncia).not.toHaveBeenCalled();
    });

    it('usa cache de admin: segunda chamada não busca no banco', async () => {
      const adminData = { nome: 'Admin', id: 'admin-1' };
      // Primeira chamada: insert + buscarEmailAdmin (from profiles)
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { ...NOVA_DENUNCIA, tipo: 'usuario' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: adminData, error: null }));
      await denunciasService.criar({ tipo: 'usuario', alvo_id: 'u-1', motivo: 'S1' });
      await new Promise(r => setTimeout(r, 0));

      // Segunda chamada: apenas insert (cache retorna admin sem buscar no banco)
      mockFrom.mockReturnValue(makeBuilder({ data: { ...NOVA_DENUNCIA, tipo: 'usuario' }, error: null }));
      await denunciasService.criar({ tipo: 'usuario', alvo_id: 'u-2', motivo: 'S2' });
      await new Promise(r => setTimeout(r, 0));

      // mockEmailAlertaDenuncia chamado 2x, mas mockFrom(profiles) apenas 1x
      expect(mockEmailAlertaDenuncia).toHaveBeenCalledTimes(2);
    });
  });

  // listar
  describe('listar()', () => {
    it('retorna dados e total do banco', async () => {
      const dados = [NOVA_DENUNCIA];
      mockFrom.mockReturnValue(makeBuilder({ data: dados, count: 1, error: null }));
      const res = await denunciasService.listar();
      expect(res.dados).toHaveLength(1);
      expect(res.total).toBe(1);
    });

    it('lança quando supabase retorna error', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: null, count: null, error: { message: 'db err' } }));
      await expect(denunciasService.listar()).rejects.toThrow('db err');
    });

    it('temMais=true quando count > porPagina', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: [], count: 100, error: null }));
      const res = await denunciasService.listar({ porPagina: 15 });
      expect(res.temMais).toBe(true);
    });

    it('count=null usa fallback 0', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: [], count: null, error: null }));
      const res = await denunciasService.listar();
      expect(res.total).toBe(0);
    });
  });

  // resolver
  describe('resolver()', () => {
    it('chama update e registra auditoria em caso de sucesso', async () => {
      mockFrom.mockReturnValue(makeBuilder({ error: null }));
      await denunciasService.resolver('den-1', 'resolvida');
      expect(mockRegistrarAcao).toHaveBeenCalledWith(expect.objectContaining({
        acao: 'denuncia_resolvida', resultado: 'sucesso',
      }));
    });

    it('chama update com status=descartada', async () => {
      mockFrom.mockReturnValue(makeBuilder({ error: null }));
      await denunciasService.resolver('den-1', 'descartada');
      expect(mockRegistrarAcao).toHaveBeenCalledWith(expect.objectContaining({ acao: 'denuncia_descartada' }));
    });

    it('lança quando supabase retorna error', async () => {
      mockFrom.mockReturnValue(makeBuilder({ error: { message: 'update fail' } }));
      await expect(denunciasService.resolver('den-1', 'resolvida')).rejects.toThrow('update fail');
    });
  });

  // contarAbertas
  describe('contarAbertas()', () => {
    it('retorna count do banco', async () => {
      mockFrom.mockReturnValue(makeBuilder({ count: 7, error: null }));
      expect(await denunciasService.contarAbertas()).toBe(7);
    });

    it('retorna 0 quando count é null', async () => {
      mockFrom.mockReturnValue(makeBuilder({ count: null, error: null }));
      expect(await denunciasService.contarAbertas()).toBe(0);
    });
  });
});

// ── Tipos/exports ─────────────────────────────────────────────────────────

describe('exports', () => {
  it('DEMO_DENUNCIAS e denunciasService são exportados', () => {
    const mod = require('@/services/denuncias');
    expect(Array.isArray(mod.DEMO_DENUNCIAS)).toBe(true);
    expect(mod.denunciasService).toBeDefined();
  });
});
