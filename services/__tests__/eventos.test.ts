/**
 * services/__tests__/eventos.test.ts
 *
 * Cobertura completa de eventosService.
 * Padrão: isolateModules em beforeEach (demo) para resetar DEMO_EVENTOS mutáveis.
 * Modo configurado: mockFrom com sequência de retornos por teste.
 */

// ── Helpers ────────────────────────────────────────────────────────────────

function makeBuilder(resolved: unknown) {
  const p = Promise.resolve(resolved);
  const b: any = { then: p.then.bind(p), catch: p.catch.bind(p) };
  ['select','eq','order','limit','update','insert','upsert',
   'single','delete','or','range','ilike'].forEach(m => { b[m] = () => b; });
  return b;
}

// ── Mock state ─────────────────────────────────────────────────────────────

let mockDetectarConteudoComercial: jest.Mock;
let mockRegistrarAcao: jest.Mock;
let mockRegistrarAnomalia: jest.Mock;
let mockEmailEventoPendente: jest.Mock;
let mockAuthGetUser: jest.Mock;
let mockFrom: jest.Mock;
let mockRpc: jest.Mock;

// ── Top-level jest.mock (hoistado, getters referenciam variáveis acima) ───

jest.mock('@/services/supabase', () => ({
  get supabaseConfigured() { return (global as any).__supabaseConfigured ?? false; },
  get supabase() {
    return {
      auth: { getUser: () => mockAuthGetUser() },
      from:  (...a: unknown[]) => mockFrom(...a),
      rpc:   (...a: unknown[]) => mockRpc(...a),
    };
  },
}));

jest.mock('@/services/validacao-semantica', () => ({
  get validacaoSemantica() {
    return { detectarConteudoComercial: mockDetectarConteudoComercial };
  },
}));

jest.mock('@/services/auditoria', () => ({
  get registrarAcao()    { return mockRegistrarAcao; },
  get registrarAnomalia(){ return mockRegistrarAnomalia; },
}));

jest.mock('@/services/email', () => ({
  get emailService() {
    return { eventoPendente: mockEmailEventoPendente };
  },
}));

// ── Inicialização dos mocks ────────────────────────────────────────────────

beforeEach(() => {
  mockDetectarConteudoComercial = jest.fn().mockReturnValue(false);
  mockRegistrarAcao   = jest.fn().mockResolvedValue(undefined);
  mockRegistrarAnomalia = jest.fn().mockResolvedValue(undefined);
  mockEmailEventoPendente = jest.fn();
  mockAuthGetUser = jest.fn().mockResolvedValue({ data: { user: { id: 'usr-test' } }, error: null });
  mockFrom = jest.fn();
  mockRpc  = jest.fn();
});

// ── DEMO ───────────────────────────────────────────────────────────────────

describe('eventosService — modo demo (supabaseConfigured = false)', () => {
  let eventosService: typeof import('@/services/eventos')['eventosService'];
  let _demoPendentes: typeof import('@/services/eventos')['_demoPendentes'];

  beforeEach(() => {
    (global as any).__supabaseConfigured = false;
    jest.isolateModules(() => {
      const mod = require('@/services/eventos');
      eventosService  = mod.eventosService;
      _demoPendentes  = mod._demoPendentes;
    });
  });

  // listar
  describe('listar()', () => {
    it('retorna todos os 6 eventos demo sem filtros', async () => {
      const res = await eventosService.listar();
      expect(res.dados).toHaveLength(6);
      expect(res.total).toBe(6);
      expect(res.temMais).toBe(false);
    });

    it('filtra por categoria', async () => {
      const res = await eventosService.listar({ categoria: 'musica' });
      expect(res.dados.every(e => e.categoria === 'musica')).toBe(true);
    });

    it('filtra por busca no nome/local', async () => {
      const res = await eventosService.listar({ busca: 'Festival' });
      expect(res.dados.length).toBeGreaterThanOrEqual(1);
      expect(res.dados[0].nome).toContain('Festival');
    });

    it('filtra por exclusivoMulheres', async () => {
      const res = await eventosService.listar({ exclusivoMulheres: true });
      expect(res.dados.length).toBeGreaterThanOrEqual(1);
      expect(res.dados.every(e => e.exclusivo_mulheres)).toBe(true);
    });

    it('pagina corretamente (porPagina=2)', async () => {
      const p1 = await eventosService.listar({ pagina: 1, porPagina: 2 });
      const p2 = await eventosService.listar({ pagina: 2, porPagina: 2 });
      expect(p1.dados).toHaveLength(2);
      expect(p2.dados).toHaveLength(2);
      expect(p1.temMais).toBe(true);
      expect(p1.dados[0].id).not.toBe(p2.dados[0].id);
    });

    it('temMais=false na última página', async () => {
      const res = await eventosService.listar({ pagina: 2, porPagina: 4 });
      expect(res.temMais).toBe(false);
    });
  });

  // listarPorRaio
  describe('listarPorRaio()', () => {
    const LAT = -12.7405, LNG = -60.1458; // mesma área dos DEMO_EVENTOS

    it('retorna eventos dentro do raio', async () => {
      const res = await eventosService.listarPorRaio(LAT, LNG, 100);
      expect(res.dados.length).toBeGreaterThan(0);
      expect(res.dados.every(e => e.distancia_km <= 100)).toBe(true);
    });

    it('retorna vazio para raio muito pequeno', async () => {
      const res = await eventosService.listarPorRaio(0, 0, 0.001);
      expect(res.dados).toHaveLength(0);
      expect(res.total).toBe(0);
    });

    it('ordena por distancia_km crescente', async () => {
      const res = await eventosService.listarPorRaio(LAT, LNG, 100);
      const dist = res.dados.map(e => e.distancia_km);
      for (let i = 1; i < dist.length; i++) expect(dist[i]).toBeGreaterThanOrEqual(dist[i - 1]);
    });

    it('filtra por exclusivoMulheres=true', async () => {
      const res = await eventosService.listarPorRaio(LAT, LNG, 100, { exclusivoMulheres: true });
      expect(res.dados.every(e => e.exclusivo_mulheres)).toBe(true);
    });

    it('inclui distancia_km em cada evento retornado', async () => {
      const res = await eventosService.listarPorRaio(LAT, LNG, 100);
      res.dados.forEach(e => expect(typeof e.distancia_km).toBe('number'));
    });
  });

  // obter
  describe('obter()', () => {
    it('retorna evento pelo id', async () => {
      const evento = await eventosService.obter('1');
      expect(evento.id).toBe('1');
    });

    it('retorna DEMO_EVENTOS[0] quando id não encontrado', async () => {
      const evento = await eventosService.obter('nao-existe');
      expect(evento).toBeDefined();
      expect(evento.id).toBe('1'); // primeiro do array
    });
  });

  // criar
  describe('criar()', () => {
    const BASE = {
      nome: 'Evento Teste', descricao: 'Descrição normal', local: 'Praça',
      lat: -12.74, lng: -60.14, categoria: 'cultura' as any,
      data_inicio: new Date().toISOString(), exclusivo_mulheres: false,
    };

    it('pf sem conteúdo comercial → status aprovado', async () => {
      mockDetectarConteudoComercial.mockReturnValue(false);
      const ev = await eventosService.criar(BASE, 'pf', false);
      expect(ev.status).toBe('aprovado');
      expect(ev.comercial).toBe(false);
    });

    it('pf com conteúdo comercial → lança BLOQUEIO_COMERCIAL', async () => {
      mockDetectarConteudoComercial.mockReturnValue(true);
      await expect(eventosService.criar(BASE, 'pf', false)).rejects.toThrow('BLOQUEIO_COMERCIAL');
    });

    it('pj → status pendente e adicionado a _demoPendentes', async () => {
      mockDetectarConteudoComercial.mockReturnValue(false);
      const ev = await eventosService.criar(BASE, 'pj', false);
      expect(ev.status).toBe('pendente');
      expect(_demoPendentes.some(p => p.id === ev.id)).toBe(true);
    });

    it('gov não verificado → lança GOV_NAO_VERIFICADO', async () => {
      await expect(eventosService.criar(BASE, 'gov', false)).rejects.toThrow('GOV_NAO_VERIFICADO');
    });

    it('gov verificado sem conteúdo comercial → status aprovado', async () => {
      mockDetectarConteudoComercial.mockReturnValue(false);
      const ev = await eventosService.criar(BASE, 'gov', true);
      expect(ev.status).toBe('aprovado');
    });
  });

  // editar
  describe('editar()', () => {
    it('atualiza campos e retorna evento atualizado', async () => {
      const ev = await eventosService.editar('1', { nome: 'Novo Nome' });
      expect(ev.nome).toBe('Novo Nome');
    });

    it('lança quando evento não encontrado', async () => {
      await expect(eventosService.editar('nao-existe', { nome: 'X' })).rejects.toThrow('Evento não encontrado');
    });
  });

  // deletar
  describe('deletar()', () => {
    it('remove evento do array e resolve', async () => {
      const antes = (await eventosService.listar()).total;
      await eventosService.deletar('1');
      const depois = (await eventosService.listar()).total;
      expect(depois).toBe(antes - 1);
    });

    it('não lança quando evento não existe', async () => {
      await expect(eventosService.deletar('nao-existe')).resolves.toBeUndefined();
    });
  });

  // favoritar / desfavoritar / listarFavoritos
  describe('favoritar/desfavoritar/listarFavoritos()', () => {
    it('favoritar() resolve imediatamente em demo', async () => {
      await expect(eventosService.favoritar('evt-1')).resolves.toBeUndefined();
    });

    it('desfavoritar() resolve imediatamente em demo', async () => {
      await expect(eventosService.desfavoritar('evt-1')).resolves.toBeUndefined();
    });

    it('listarFavoritos() retorna array vazio em demo', async () => {
      expect(await eventosService.listarFavoritos()).toEqual([]);
    });
  });
});

// ── CONFIGURADO ────────────────────────────────────────────────────────────

describe('eventosService — modo configurado (supabaseConfigured = true)', () => {
  let eventosService: typeof import('@/services/eventos')['eventosService'];

  const DEMO_EVENTO = {
    id: 'e-1', nome: 'Show', status: 'aprovado', criador_id: 'usr-test',
  };

  beforeEach(() => {
    (global as any).__supabaseConfigured = true;
    jest.isolateModules(() => {
      const mod = require('@/services/eventos');
      eventosService = mod.eventosService;
    });
  });

  // listar
  describe('listar()', () => {
    it('retorna RespostaPaginada em caso de sucesso', async () => {
      const dados = [DEMO_EVENTO];
      mockFrom.mockReturnValue(makeBuilder({ data: dados, error: null, count: 1 }));

      const res = await eventosService.listar();

      expect(mockFrom).toHaveBeenCalledWith('eventos');
      expect(res.dados).toHaveLength(1);
      expect(res.total).toBe(1);
      expect(res.temMais).toBe(false);
    });

    it('lança quando supabase retorna error', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'db down' }, count: null }));
      await expect(eventosService.listar()).rejects.toThrow('db down');
    });

    it('porPagina e total determinam temMais=true', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: [], error: null, count: 100 }));
      const res = await eventosService.listar({ pagina: 1, porPagina: 20 });
      expect(res.temMais).toBe(true);
    });
  });

  // listarPorRaio
  describe('listarPorRaio()', () => {
    it('chama supabase.rpc com parâmetros corretos', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });
      await eventosService.listarPorRaio(-12.74, -60.14, 10);
      expect(mockRpc).toHaveBeenCalledWith('eventos_por_raio', expect.objectContaining({
        lat: -12.74, lng: -60.14, raio_km: 10,
      }));
    });

    it('mapeia e_lat/e_lng para lat/lng', async () => {
      const row = { id: 'r-1', e_lat: -12.74, e_lng: -60.14, distancia_km: 1.5 };
      mockRpc.mockResolvedValue({ data: [row], error: null });
      const res = await eventosService.listarPorRaio(-12.74, -60.14, 10);
      expect(res.dados[0].lat).toBe(-12.74);
      expect(res.dados[0].lng).toBe(-60.14);
    });

    it('lança quando rpc retorna error', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc fail' } });
      await expect(eventosService.listarPorRaio(-12.74, -60.14)).rejects.toThrow('rpc fail');
    });

    it('temMais=true quando dados.length === porPagina', async () => {
      const rows = Array.from({ length: 20 }, (_, i) => ({
        id: String(i), e_lat: -12.74, e_lng: -60.14, distancia_km: i,
      }));
      mockRpc.mockResolvedValue({ data: rows, error: null });
      const res = await eventosService.listarPorRaio(-12.74, -60.14, 100, { porPagina: 20 });
      expect(res.temMais).toBe(true);
    });
  });

  // obter
  describe('obter()', () => {
    it('retorna evento pelo id', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: DEMO_EVENTO, error: null }));
      const ev = await eventosService.obter('e-1');
      expect(ev.id).toBe('e-1');
    });

    it('lança quando supabase retorna error', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'not found' } }));
      await expect(eventosService.obter('x')).rejects.toThrow('not found');
    });
  });

  // criar
  describe('criar()', () => {
    const BASE_DATA = {
      nome: 'Evento Teste', descricao: 'Desc', local: 'Local',
      lat: -12.74, lng: -60.14, categoria: 'cultura' as any,
      data_inicio: new Date().toISOString(), exclusivo_mulheres: false,
    };

    it('usa caminho demo quando getUser retorna null (sem sessão real)', async () => {
      // Com supabaseConfigured=true mas sem sessão Supabase ativa (login demo),
      // criar() deve usar o caminho demo em vez de lançar erro de autenticação.
      mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });
      const ev = await eventosService.criar(BASE_DATA, 'pf');
      expect(ev.id).toMatch(/^demo-/);
      expect(ev.status).toBe('aprovado');
      expect(ev.criador_id).toBe('demo');
    });

    it('lança GOV_NAO_VERIFICADO para gov não verificado e registra auditoria', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: { tipo_conta: 'gov', verificado: false }, error: null }));
      await expect(eventosService.criar(BASE_DATA)).rejects.toThrow('GOV_NAO_VERIFICADO');
      expect(mockRegistrarAcao).toHaveBeenCalledWith(expect.objectContaining({ acao: 'evento_criacao_bloqueada' }));
    });

    it('lança BLOQUEIO_COMERCIAL para pf com conteúdo comercial e registra anomalia', async () => {
      mockDetectarConteudoComercial.mockReturnValue(true);
      mockFrom.mockReturnValue(makeBuilder({ data: { tipo_conta: 'pf', verificado: true }, error: null }));
      await expect(eventosService.criar(BASE_DATA)).rejects.toThrow('BLOQUEIO_COMERCIAL');
      expect(mockRegistrarAnomalia).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'conteudo_suspeito' }));
    });

    it('lança quando supabase.insert retorna error', async () => {
      // 1) from('profiles').single() → profile pf
      // 2) from('eventos').insert().select().single() → error
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'pf', verificado: true }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: null, error: { message: 'insert fail' } }));

      await expect(eventosService.criar(BASE_DATA)).rejects.toThrow('insert fail');
      expect(mockRegistrarAcao).toHaveBeenCalledWith(expect.objectContaining({ acao: 'evento_criacao_falha' }));
    });

    it('pj → status pendente, chama emailService.eventoPendente, retorna evento', async () => {
      const novoEvento = { ...BASE_DATA, id: 'new-evt', status: 'pendente', comercial: true };
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'pj', verificado: true }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: novoEvento, error: null }));

      const ev = await eventosService.criar(BASE_DATA);

      expect(ev.status).toBe('pendente');
      expect(mockEmailEventoPendente).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: 'usr-test' }));
      expect(mockRegistrarAcao).toHaveBeenCalledWith(expect.objectContaining({ acao: 'evento_criado' }));
    });

    it('pf → status aprovado, não chama emailService.eventoPendente', async () => {
      const novoEvento = { ...BASE_DATA, id: 'new-evt2', status: 'aprovado', comercial: false };
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'pf', verificado: true }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: novoEvento, error: null }));

      const ev = await eventosService.criar(BASE_DATA);

      expect(ev.status).toBe('aprovado');
      expect(mockEmailEventoPendente).not.toHaveBeenCalled();
    });
  });

  // editar
  describe('editar()', () => {
    it('lança "Evento não encontrado" quando getUser retorna null e id não existe no demo', async () => {
      // Sem sessão real → caminho demo; 'e-1' não existe em DEMO_EVENTOS nem _demoPendentes
      mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });
      await expect(eventosService.editar('id-inexistente', { nome: 'X' })).rejects.toThrow('Evento não encontrado');
    });

    it('lança SEM_PERMISSAO quando não é dono nem admin', async () => {
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { criador_id: 'outro-user', nome: 'Old' }, error: null })) // evento
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'pf' }, error: null })); // profile

      await expect(eventosService.editar('e-1', { nome: 'X' })).rejects.toThrow('SEM_PERMISSAO');
    });

    it('lança BLOQUEIO_COMERCIAL para pf com nome comercial', async () => {
      mockDetectarConteudoComercial.mockReturnValue(true);
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { criador_id: 'usr-test', nome: 'Old', descricao: 'Old' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'pf' }, error: null }));

      await expect(eventosService.editar('e-1', { nome: 'Promoção imperdível!' })).rejects.toThrow('BLOQUEIO_COMERCIAL');
    });

    it('admin pode editar com conteúdo comercial sem bloqueio', async () => {
      mockDetectarConteudoComercial.mockReturnValue(true);
      const eventoAtualizado = { ...DEMO_EVENTO, nome: 'Promoção' };
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { criador_id: 'outro', nome: 'Old', descricao: 'Old' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'admin' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: eventoAtualizado, error: null }));

      const ev = await eventosService.editar('e-1', { nome: 'Promoção' });
      expect(ev.nome).toBe('Promoção');
    });

    it('resolve com evento atualizado em caso de sucesso', async () => {
      const atualizado = { ...DEMO_EVENTO, nome: 'Nome Novo' };
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { criador_id: 'usr-test', nome: 'Old', descricao: 'Old' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'pf' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: atualizado, error: null }));

      const ev = await eventosService.editar('e-1', { nome: 'Nome Novo' });
      expect(ev.nome).toBe('Nome Novo');
      expect(mockRegistrarAcao).toHaveBeenCalledWith(expect.objectContaining({ acao: 'evento_editado' }));
    });

    it('lança quando update retorna error', async () => {
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { criador_id: 'usr-test', nome: 'Old', descricao: 'Old' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'pf' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: null, error: { message: 'update fail' } }));

      await expect(eventosService.editar('e-1', { nome: 'X' })).rejects.toThrow('update fail');
    });
  });

  // deletar
  describe('deletar()', () => {
    it('resolve silenciosamente quando getUser retorna null (caminho demo)', async () => {
      // Sem sessão real → caminho demo; remove da lista local (ou é no-op se não encontrar)
      mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });
      await expect(eventosService.deletar('id-inexistente')).resolves.toBeUndefined();
    });

    it('lança SEM_PERMISSAO quando não é dono nem admin', async () => {
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { criador_id: 'outro' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'pf' }, error: null }));
      await expect(eventosService.deletar('e-1')).rejects.toThrow('SEM_PERMISSAO');
    });

    it('faz soft-delete (status=expirado) e registra auditoria', async () => {
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { criador_id: 'usr-test' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'pf' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ error: null }));

      await eventosService.deletar('e-1');
      expect(mockRegistrarAcao).toHaveBeenCalledWith(expect.objectContaining({ acao: 'evento_deletado' }));
    });

    it('lança quando update retorna error', async () => {
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { criador_id: 'usr-test' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'pf' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ error: { message: 'delete fail' } }));

      await expect(eventosService.deletar('e-1')).rejects.toThrow('delete fail');
    });
  });

  // favoritar / desfavoritar / listarFavoritos
  describe('favoritar()', () => {
    it('resolve silenciosamente quando getUser retorna null (caminho demo)', async () => {
      // Sem sessão real → no-op silencioso (favoritos não persistem no demo)
      mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });
      await expect(eventosService.favoritar('e-1')).resolves.toBeUndefined();
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('chama from("favoritos").insert e resolve', async () => {
      mockFrom.mockReturnValue(makeBuilder({ error: null }));
      await expect(eventosService.favoritar('e-1')).resolves.toBeUndefined();
      expect(mockFrom).toHaveBeenCalledWith('favoritos');
    });
  });

  describe('desfavoritar()', () => {
    it('resolve silenciosamente quando getUser retorna null (caminho demo)', async () => {
      // Sem sessão real → no-op silencioso
      mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });
      await expect(eventosService.desfavoritar('e-1')).resolves.toBeUndefined();
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('chama from("favoritos").delete e resolve', async () => {
      mockFrom.mockReturnValue(makeBuilder({ error: null }));
      await expect(eventosService.desfavoritar('e-1')).resolves.toBeUndefined();
    });
  });

  describe('listarFavoritos()', () => {
    it('retorna [] quando usuário não autenticado', async () => {
      mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });
      expect(await eventosService.listarFavoritos()).toEqual([]);
    });

    it('retorna array de evento_ids', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: [{ evento_id: 'e-a' }, { evento_id: 'e-b' }] }));
      expect(await eventosService.listarFavoritos()).toEqual(['e-a', 'e-b']);
    });
  });
});

// ── Tipos exportados ──────────────────────────────────────────────────────

describe('tipos exportados', () => {
  it('eventosService, _demoPendentes e tipos são exportados', () => {
    const mod = require('@/services/eventos');
    expect(mod.eventosService).toBeDefined();
    expect(Array.isArray(mod._demoPendentes)).toBe(true);
  });
});
