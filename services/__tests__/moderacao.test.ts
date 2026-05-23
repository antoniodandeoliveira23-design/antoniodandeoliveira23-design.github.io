/**
 * services/__tests__/moderacao.test.ts
 *
 * Cobertura completa de moderacaoService.
 * Demo mode usa _demoPendentes mockado de eventos.
 * Configured mode usa mockFrom e mocks de auditoria/email.
 */

// ── Helpers ────────────────────────────────────────────────────────────────

function makeBuilder(resolved: unknown) {
  const p = Promise.resolve(resolved);
  const b: any = { then: p.then.bind(p), catch: p.catch.bind(p) };
  // range é jest.fn() para permitir inspeção dos argumentos de paginação
  b.range = jest.fn().mockReturnValue(b);
  ['select','eq','order','limit','update','insert','single'].forEach(m => { b[m] = () => b; });
  return b;
}

// ── Mock state ─────────────────────────────────────────────────────────────

let mockDemoPendentes: any[];
let mockRegistrarAcao: jest.Mock;
let mockEmailEventoAprovado: jest.Mock;
let mockEmailEventoRejeitado: jest.Mock;
let mockFrom: jest.Mock;
let mockFunctionsInvoke: jest.Mock;

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/services/supabase', () => ({
  get supabaseConfigured() { return (global as any).__supabaseConfigured ?? false; },
  get supabase() {
    return {
      from:      (...a: unknown[]) => mockFrom(...a),
      functions: { invoke: (...a: unknown[]) => mockFunctionsInvoke(...a) },
    };
  },
}));

jest.mock('@/services/eventos', () => ({
  get _demoPendentes() { return mockDemoPendentes; },
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

// ── beforeEach ─────────────────────────────────────────────────────────────

beforeEach(() => {
  mockDemoPendentes = [
    { id: 'pend-1', nome: 'Evento A', status: 'pendente', criador_id: 'usr-a', local: 'Local A', data_inicio: '2026-01-01', imagem_url: null, categoria: 'negocios', criado_em: '2026-01-01' },
    { id: 'pend-2', nome: 'Evento B', status: 'pendente', criador_id: 'usr-b', local: 'Local B', data_inicio: '2026-02-01', imagem_url: null, categoria: 'negocios', criado_em: '2026-02-01' },
  ];
  mockRegistrarAcao      = jest.fn().mockResolvedValue(undefined);
  mockEmailEventoAprovado  = jest.fn();
  mockEmailEventoRejeitado = jest.fn();
  mockFrom               = jest.fn();
  mockFunctionsInvoke    = jest.fn().mockResolvedValue({ data: null, error: null });
});

// ── DEMO ───────────────────────────────────────────────────────────────────

describe('moderacaoService — modo demo (supabaseConfigured = false)', () => {
  let moderacaoService: typeof import('@/services/moderacao')['moderacaoService'];

  beforeEach(() => {
    (global as any).__supabaseConfigured = false;
    jest.isolateModules(() => {
      moderacaoService = require('@/services/moderacao').moderacaoService;
    });
  });

  // listarPendentes
  describe('listarPendentes()', () => {
    it('retorna todos os pendentes demo', async () => {
      const res = await moderacaoService.listarPendentes();
      expect(res.dados).toHaveLength(2);
      expect(res.total).toBe(2);
      expect(res.temMais).toBe(false);
    });

    it('pagina corretamente (porPagina=1, pagina=1)', async () => {
      const res = await moderacaoService.listarPendentes(1, 1);
      expect(res.dados).toHaveLength(1);
      expect(res.dados[0].id).toBe('pend-1');
      expect(res.temMais).toBe(true);
    });

    it('pagina corretamente (porPagina=1, pagina=2)', async () => {
      const res = await moderacaoService.listarPendentes(2, 1);
      expect(res.dados).toHaveLength(1);
      expect(res.dados[0].id).toBe('pend-2');
      expect(res.temMais).toBe(false);
    });

    it('retorna vazio quando _demoPendentes está vazio', async () => {
      mockDemoPendentes.length = 0;
      const res = await moderacaoService.listarPendentes();
      expect(res.dados).toHaveLength(0);
      expect(res.total).toBe(0);
    });
  });

  // aprovar
  describe('aprovar()', () => {
    it('remove evento de _demoPendentes e resolve', async () => {
      await moderacaoService.aprovar('pend-1');
      expect(mockDemoPendentes.find(e => e.id === 'pend-1')).toBeUndefined();
    });

    it('não lança quando evento não encontrado', async () => {
      await expect(moderacaoService.aprovar('nao-existe')).resolves.toBeUndefined();
    });

    it('não chama supabase em demo', async () => {
      await moderacaoService.aprovar('pend-1');
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  // rejeitar
  describe('rejeitar()', () => {
    it('remove evento de _demoPendentes e resolve', async () => {
      await moderacaoService.rejeitar('pend-2', 'Conteúdo inapropriado');
      expect(mockDemoPendentes.find(e => e.id === 'pend-2')).toBeUndefined();
    });

    it('não lança quando evento não encontrado', async () => {
      await expect(moderacaoService.rejeitar('nao-existe', 'X')).resolves.toBeUndefined();
    });
  });

  // notificarCriador
  describe('notificarCriador()', () => {
    it('loga mensagem demo e resolve sem lançar', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await expect(moderacaoService.notificarCriador('evt-1', 'aprovado')).resolves.toBeUndefined();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('aprovado'));
      logSpy.mockRestore();
    });

    it('funciona para tipo rejeitado também', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await expect(moderacaoService.notificarCriador('evt-1', 'rejeitado', 'Spam')).resolves.toBeUndefined();
      logSpy.mockRestore();
    });
  });
});

// ── CONFIGURADO ────────────────────────────────────────────────────────────

describe('moderacaoService — modo configurado (supabaseConfigured = true)', () => {
  let moderacaoService: typeof import('@/services/moderacao')['moderacaoService'];

  beforeEach(() => {
    (global as any).__supabaseConfigured = true;
    jest.isolateModules(() => {
      moderacaoService = require('@/services/moderacao').moderacaoService;
    });
  });

  // listarPendentes
  describe('listarPendentes()', () => {
    it('retorna RespostaPaginadaPendentes em caso de sucesso', async () => {
      const dados = [{ id: 'e-1', nome: 'Show', status: 'pendente' }];
      mockFrom.mockReturnValue(makeBuilder({ data: dados, count: 1, error: null }));

      const res = await moderacaoService.listarPendentes();

      expect(mockFrom).toHaveBeenCalledWith('eventos');
      expect(res.dados).toHaveLength(1);
      expect(res.total).toBe(1);
    });

    it('temMais=true quando count > porPagina', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: [], count: 50, error: null }));
      const res = await moderacaoService.listarPendentes(1, 10);
      expect(res.temMais).toBe(true);
    });

    it('lança quando supabase retorna error', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: null, count: null, error: { message: 'DB falhou' } }));
      await expect(moderacaoService.listarPendentes()).rejects.toThrow('DB falhou');
    });

    it('usa count=0 como fallback quando count é null', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: [], count: null, error: null }));
      const res = await moderacaoService.listarPendentes();
      expect(res.total).toBe(0);
    });

    it('chama range() com offsets corretos para pagina=2, porPagina=5', async () => {
      const builder = makeBuilder({ data: [], count: 50, error: null });
      mockFrom.mockReturnValue(builder);

      await moderacaoService.listarPendentes(2, 5);

      // pagina=2, porPagina=5 → from=(2-1)*5=5, to=2*5-1=9
      expect(builder.range).toHaveBeenCalledWith(5, 9);
    });

    it('chama range() com offsets corretos para pagina=1, porPagina=10 (primeira página)', async () => {
      const builder = makeBuilder({ data: [], count: 10, error: null });
      mockFrom.mockReturnValue(builder);

      await moderacaoService.listarPendentes(1, 10);

      // pagina=1, porPagina=10 → from=0, to=9
      expect(builder.range).toHaveBeenCalledWith(0, 9);
    });
  });

  // aprovar
  describe('aprovar()', () => {
    it('chama update status=aprovado e registra auditoria', async () => {
      mockFrom.mockReturnValue(makeBuilder({ error: null }));
      await moderacaoService.aprovar('e-1');
      expect(mockFrom).toHaveBeenCalledWith('eventos');
      expect(mockRegistrarAcao).toHaveBeenCalledWith(expect.objectContaining({ acao: 'evento_aprovado', resultado: 'sucesso' }));
    });

    it('lança e registra falha quando supabase retorna error', async () => {
      mockFrom.mockReturnValue(makeBuilder({ error: { message: 'approve fail' } }));
      await expect(moderacaoService.aprovar('e-1')).rejects.toThrow('approve fail');
      expect(mockRegistrarAcao).toHaveBeenCalledWith(expect.objectContaining({ acao: 'evento_aprovacao_falha', resultado: 'falha' }));
    });
  });

  // rejeitar
  describe('rejeitar()', () => {
    it('chama update status=rejeitado e registra auditoria com motivo', async () => {
      mockFrom.mockReturnValue(makeBuilder({ error: null }));
      await moderacaoService.rejeitar('e-1', 'Spam comercial');
      expect(mockRegistrarAcao).toHaveBeenCalledWith(expect.objectContaining({
        acao: 'evento_rejeitado',
        detalhes: expect.objectContaining({ motivo_rejeicao: 'Spam comercial' }),
      }));
    });

    it('lança e registra falha quando supabase retorna error', async () => {
      mockFrom.mockReturnValue(makeBuilder({ error: { message: 'reject fail' } }));
      await expect(moderacaoService.rejeitar('e-1', 'x')).rejects.toThrow('reject fail');
      expect(mockRegistrarAcao).toHaveBeenCalledWith(expect.objectContaining({ acao: 'evento_rejeicao_falha' }));
    });
  });

  // notificarCriador
  describe('notificarCriador()', () => {
    const EVENTO = { criador_id: 'usr-a', nome: 'Show', local: 'Praça', data_inicio: '2026-01-01' };

    it('chama emailService.eventoAprovado e push para aprovado', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: EVENTO, error: null }));

      await moderacaoService.notificarCriador('e-1', 'aprovado');

      expect(mockEmailEventoAprovado).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: 'usr-a' }));
      expect(mockFunctionsInvoke).toHaveBeenCalledWith('enviar-push', expect.objectContaining({
        body: expect.objectContaining({ tipo: 'evento_aprovado' }),
      }));
      expect(mockRegistrarAcao).toHaveBeenCalledWith(expect.objectContaining({ acao: 'email_aprovado_enviado' }));
    });

    it('chama emailService.eventoRejeitado e push para rejeitado', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: EVENTO, error: null }));

      await moderacaoService.notificarCriador('e-1', 'rejeitado', 'Conteúdo inválido');

      expect(mockEmailEventoRejeitado).toHaveBeenCalledWith(expect.objectContaining({
        motivo: 'Conteúdo inválido',
      }));
      expect(mockFunctionsInvoke).toHaveBeenCalledWith('enviar-push', expect.objectContaining({
        body: expect.objectContaining({ tipo: 'evento_rejeitado' }),
      }));
    });

    it('usa motivo padrão quando não fornecido para rejeitado', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: EVENTO, error: null }));
      await moderacaoService.notificarCriador('e-1', 'rejeitado');
      expect(mockEmailEventoRejeitado).toHaveBeenCalledWith(expect.objectContaining({
        motivo: expect.stringContaining('Não informado'),
      }));
    });

    it('retorna sem email quando criador_id é nulo', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: { criador_id: null }, error: null }));
      await moderacaoService.notificarCriador('e-1', 'aprovado');
      expect(mockEmailEventoAprovado).not.toHaveBeenCalled();
    });

    it('retorna sem lançar quando evento não encontrado (data=null)', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: null, error: null }));
      await expect(moderacaoService.notificarCriador('e-1', 'aprovado')).resolves.toBeUndefined();
    });

    it('captura erro interno sem propagar (try/catch)', async () => {
      mockFrom.mockImplementation(() => { throw new Error('Boom!'); });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      await expect(moderacaoService.notificarCriador('e-1', 'aprovado')).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[moderacao]'), expect.any(Error));
      warnSpy.mockRestore();
    });

    it('não lança quando push notification falha (catch interno)', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: EVENTO, error: null }));
      mockFunctionsInvoke.mockRejectedValue(new Error('push down'));
      await expect(moderacaoService.notificarCriador('e-1', 'aprovado')).resolves.toBeUndefined();
    });
  });
});

// ── Tipo exportado ──────────────────────────────────────────────────────────

describe('tipos exportados', () => {
  it('moderacaoService está disponível', () => {
    const mod = require('@/services/moderacao');
    expect(mod.moderacaoService).toBeDefined();
  });
});
