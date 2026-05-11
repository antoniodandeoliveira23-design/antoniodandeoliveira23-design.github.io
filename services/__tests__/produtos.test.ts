/**
 * services/__tests__/produtos.test.ts
 *
 * Cobertura completa de produtosService.
 * DEMO_PRODUTOS é privado (não exportado) — verificado via métodos do service.
 */

// ── Helpers ────────────────────────────────────────────────────────────────

function makeBuilder(resolved: unknown) {
  const p = Promise.resolve(resolved);
  const b: any = { then: p.then.bind(p), catch: p.catch.bind(p) };
  ['select','eq','order','limit','update','insert','range','single','or'].forEach(m => { b[m] = () => b; });
  return b;
}

// ── Mock state ─────────────────────────────────────────────────────────────

let mockRegistrarAcao: jest.Mock;
let mockSanitizadorTexto: jest.Mock;
let mockSanitizadorUrl: jest.Mock;
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

jest.mock('@/services/seguranca', () => ({
  get sanitizador() {
    return {
      texto: mockSanitizadorTexto,
      url:   mockSanitizadorUrl,
    };
  },
}));

// ── beforeEach ─────────────────────────────────────────────────────────────

beforeEach(() => {
  mockRegistrarAcao     = jest.fn().mockResolvedValue(undefined);
  mockSanitizadorTexto  = jest.fn().mockImplementation((v: string) => v);
  mockSanitizadorUrl    = jest.fn().mockImplementation((v: string) => v);
  mockAuthGetUser       = jest.fn().mockResolvedValue({ data: { user: { id: 'usr-test' } }, error: null });
  mockFrom              = jest.fn();
});

// ── DEMO ───────────────────────────────────────────────────────────────────

describe('produtosService — modo demo (supabaseConfigured = false)', () => {
  let produtosService: typeof import('@/services/produtos')['produtosService'];

  beforeEach(() => {
    (global as any).__supabaseConfigured = false;
    jest.isolateModules(() => { produtosService = require('@/services/produtos').produtosService; });
  });

  // listar
  describe('listar()', () => {
    it('retorna todos os 3 produtos demo sem filtros', async () => {
      const res = await produtosService.listar();
      expect(res.dados).toHaveLength(3);
      expect(res.total).toBe(3);
    });

    it('filtra por categoria', async () => {
      const res = await produtosService.listar({ categoria: 'alimentacao' });
      expect(res.dados.every(p => p.categoria === 'alimentacao')).toBe(true);
    });

    it('filtra por eventoId', async () => {
      const res = await produtosService.listar({ eventoId: '2' });
      expect(res.dados.every(p => p.evento_id === '2')).toBe(true);
    });

    it('filtra por criadorId', async () => {
      const res = await produtosService.listar({ criadorId: 'demo-pj' });
      expect(res.dados.length).toBe(3);
    });

    it('filtra por busca no nome/descrição', async () => {
      const res = await produtosService.listar({ busca: 'Camiseta' });
      expect(res.dados.length).toBeGreaterThanOrEqual(1);
      expect(res.dados[0].nome).toContain('Camiseta');
    });

    it('pagina corretamente (porPagina=1)', async () => {
      const p1 = await produtosService.listar({ pagina: 1, porPagina: 1 });
      const p2 = await produtosService.listar({ pagina: 2, porPagina: 1 });
      expect(p1.dados).toHaveLength(1);
      expect(p2.dados).toHaveLength(1);
      expect(p1.temMais).toBe(true);
      expect(p1.dados[0].id).not.toBe(p2.dados[0].id);
    });

    it('temMais=false na última página', async () => {
      const res = await produtosService.listar({ pagina: 2, porPagina: 2 });
      expect(res.temMais).toBe(false);
    });
  });

  // listarPorEvento
  describe('listarPorEvento()', () => {
    it('retorna produtos do evento especificado', async () => {
      const prods = await produtosService.listarPorEvento('1');
      expect(prods.every(p => p.evento_id === '1')).toBe(true);
    });

    it('retorna [] para evento sem produtos', async () => {
      expect(await produtosService.listarPorEvento('nao-existe')).toEqual([]);
    });
  });

  // obter
  describe('obter()', () => {
    it('retorna produto pelo id', async () => {
      const p = await produtosService.obter('prod-1');
      expect(p?.id).toBe('prod-1');
    });

    it('retorna null quando não encontrado', async () => {
      expect(await produtosService.obter('nao-existe')).toBeNull();
    });
  });

  // criar
  describe('criar()', () => {
    const BASE: import('@/services/produtos').CriarProdutoData = {
      nome: 'Produto Novo', descricao: 'Desc', preco: 50, categoria: 'servicos',
      local: 'Local X', lat: -12.74, lng: -60.14,
    };

    it('retorna produto criado com status ativo', async () => {
      const p = await produtosService.criar(BASE);
      expect(p.status).toBe('ativo');
      expect(p.nome).toBe('Produto Novo');
    });

    it('usa BRL como moeda padrão', async () => {
      const p = await produtosService.criar(BASE);
      expect(p.moeda).toBe('BRL');
    });

    it('adiciona produto ao início da lista', async () => {
      const antes = (await produtosService.listar()).total;
      await produtosService.criar(BASE);
      const depois = (await produtosService.listar()).total;
      expect(depois).toBe(antes + 1);
    });
  });

  // editar
  describe('editar()', () => {
    it('atualiza produto e retorna versão atualizada', async () => {
      const p = await produtosService.editar('prod-1', { nome: 'Nome Atualizado' });
      expect(p.nome).toBe('Nome Atualizado');
    });

    it('lança quando produto não encontrado', async () => {
      await expect(produtosService.editar('nao-existe', { nome: 'X' })).rejects.toThrow('Produto não encontrado');
    });
  });

  // deletar
  describe('deletar()', () => {
    it('remove produto da lista (soft-delete em demo remove fisicamente)', async () => {
      const antes = (await produtosService.listar()).total;
      await produtosService.deletar('prod-1');
      const depois = (await produtosService.listar()).total;
      expect(depois).toBe(antes - 1);
    });

    it('não lança quando produto não encontrado', async () => {
      await expect(produtosService.deletar('nao-existe')).resolves.toBeUndefined();
    });
  });
});

// ── CONFIGURADO ────────────────────────────────────────────────────────────

describe('produtosService — modo configurado (supabaseConfigured = true)', () => {
  let produtosService: typeof import('@/services/produtos')['produtosService'];

  const PRODUTO = {
    id: 'prod-1', criador_id: 'usr-test', nome: 'Prod', descricao: 'Desc',
    preco: 50, moeda: 'BRL', categoria: 'servicos' as const,
    local: 'L', lat: 0, lng: 0, status: 'ativo' as const, criado_em: '',
  };

  beforeEach(() => {
    (global as any).__supabaseConfigured = true;
    jest.isolateModules(() => { produtosService = require('@/services/produtos').produtosService; });
  });

  // listar
  describe('listar()', () => {
    it('retorna RespostaPaginadaProdutos em sucesso', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: [PRODUTO], count: 1, error: null }));
      const res = await produtosService.listar();
      expect(res.dados).toHaveLength(1);
      expect(res.total).toBe(1);
    });

    it('lança quando supabase retorna error', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: null, count: null, error: { message: 'db err' } }));
      await expect(produtosService.listar()).rejects.toThrow('db err');
    });

    it('temMais=true quando count > porPagina', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: [], count: 50, error: null }));
      const res = await produtosService.listar({ porPagina: 20 });
      expect(res.temMais).toBe(true);
    });
  });

  // listarPorEvento
  describe('listarPorEvento()', () => {
    it('retorna produtos do evento', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: [PRODUTO], error: null }));
      const res = await produtosService.listarPorEvento('e-1');
      expect(res).toHaveLength(1);
    });

    it('lança quando supabase retorna error', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'query fail' } }));
      await expect(produtosService.listarPorEvento('e-1')).rejects.toThrow('query fail');
    });
  });

  // obter
  describe('obter()', () => {
    it('retorna produto pelo id', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: PRODUTO, error: null }));
      const p = await produtosService.obter('prod-1');
      expect(p?.id).toBe('prod-1');
    });

    it('retorna null quando error.code é PGRST116 (not found)', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: null, error: { code: 'PGRST116', message: 'not found' } }));
      expect(await produtosService.obter('x')).toBeNull();
    });

    it('lança para outros erros', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: null, error: { code: '23505', message: 'other error' } }));
      await expect(produtosService.obter('x')).rejects.toThrow('other error');
    });
  });

  // criar
  describe('criar()', () => {
    const BASE: import('@/services/produtos').CriarProdutoData = {
      nome: 'Prod Novo', descricao: 'Desc', preco: 99, categoria: 'servicos',
      local: 'Local', lat: -12.74, lng: -60.14,
    };

    it('lança "Usuário não autenticado" quando getUser retorna null', async () => {
      mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });
      await expect(produtosService.criar(BASE)).rejects.toThrow('Usuário não autenticado');
    });

    it('lança APENAS_PJ quando tipo_conta é pf', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: { tipo_conta: 'pf', verificado: true }, error: null }));
      await expect(produtosService.criar(BASE)).rejects.toThrow('APENAS_PJ');
      expect(mockRegistrarAcao).toHaveBeenCalledWith(expect.objectContaining({ acao: 'produto_criacao_bloqueada' }));
    });

    it('lança APENAS_PJ quando profile é null', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: null, error: null }));
      await expect(produtosService.criar(BASE)).rejects.toThrow('APENAS_PJ');
    });

    it('chama sanitizador.texto para nome, descricao e local', async () => {
      // 1) profiles, 2) produtos insert
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'pj', verificado: true }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: PRODUTO, error: null }));
      await produtosService.criar(BASE);
      expect(mockSanitizadorTexto).toHaveBeenCalledWith('Prod Novo');
      expect(mockSanitizadorTexto).toHaveBeenCalledWith('Desc');
      expect(mockSanitizadorTexto).toHaveBeenCalledWith('Local');
    });

    it('lança EVENTO_NAO_ENCONTRADO quando evento_id fornecido mas evento não existe', async () => {
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'pj', verificado: true }, error: null })) // profiles
        .mockReturnValueOnce(makeBuilder({ data: null, error: null })); // eventos
      await expect(produtosService.criar({ ...BASE, evento_id: 'e-x' })).rejects.toThrow('EVENTO_NAO_ENCONTRADO');
    });

    it('lança EVENTO_SEM_PERMISSAO quando evento pertence a outro usuário', async () => {
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'pj', verificado: true }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: { id: 'e-1', criador_id: 'outro-user' }, error: null }));
      await expect(produtosService.criar({ ...BASE, evento_id: 'e-1' })).rejects.toThrow('EVENTO_SEM_PERMISSAO');
    });

    it('retorna produto criado em caso de sucesso (pj, sem evento_id)', async () => {
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'pj', verificado: true }, error: null })) // profiles
        .mockReturnValueOnce(makeBuilder({ data: PRODUTO, error: null })); // insert
      const p = await produtosService.criar(BASE);
      expect(p.id).toBe('prod-1');
      expect(mockRegistrarAcao).toHaveBeenCalledWith(expect.objectContaining({ acao: 'produto_criado' }));
    });

    it('lança e registra falha quando insert retorna error', async () => {
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'pj', verificado: true }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: null, error: { message: 'insert fail' } }));
      await expect(produtosService.criar(BASE)).rejects.toThrow('insert fail');
      expect(mockRegistrarAcao).toHaveBeenCalledWith(expect.objectContaining({ acao: 'produto_criacao_falha' }));
    });

    it('admin pode criar sem restrição de tipo_conta', async () => {
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'admin', verificado: true }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: PRODUTO, error: null }));
      const p = await produtosService.criar(BASE);
      expect(p).toBeDefined();
    });
  });

  // editar
  describe('editar()', () => {
    it('lança "Usuário não autenticado" quando getUser retorna null', async () => {
      mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });
      await expect(produtosService.editar('prod-1', { nome: 'X' })).rejects.toThrow('Usuário não autenticado');
    });

    it('lança SEM_PERMISSAO quando não é dono nem admin', async () => {
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { criador_id: 'outro' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'pf' }, error: null }));
      await expect(produtosService.editar('prod-1', { nome: 'X' })).rejects.toThrow('SEM_PERMISSAO');
    });

    it('retorna produto atualizado e registra auditoria em sucesso', async () => {
      const atualizado = { ...PRODUTO, nome: 'Novo Nome' };
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { criador_id: 'usr-test' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'pj' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: atualizado, error: null }));
      const p = await produtosService.editar('prod-1', { nome: 'Novo Nome' });
      expect(p.nome).toBe('Novo Nome');
      expect(mockRegistrarAcao).toHaveBeenCalledWith(expect.objectContaining({ acao: 'produto_editado' }));
    });

    it('lança quando update retorna error', async () => {
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { criador_id: 'usr-test' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'pj' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: null, error: { message: 'update fail' } }));
      await expect(produtosService.editar('prod-1', { nome: 'X' })).rejects.toThrow('update fail');
    });
  });

  // deletar
  describe('deletar()', () => {
    it('lança "Usuário não autenticado" quando getUser retorna null', async () => {
      mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });
      await expect(produtosService.deletar('prod-1')).rejects.toThrow('Usuário não autenticado');
    });

    it('lança SEM_PERMISSAO quando não é dono nem admin', async () => {
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { criador_id: 'outro' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'pj' }, error: null }));
      await expect(produtosService.deletar('prod-1')).rejects.toThrow('SEM_PERMISSAO');
    });

    it('faz soft-delete (status=inativo) e registra auditoria', async () => {
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { criador_id: 'usr-test' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'pj' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ error: null }));
      await produtosService.deletar('prod-1');
      expect(mockRegistrarAcao).toHaveBeenCalledWith(expect.objectContaining({ acao: 'produto_deletado' }));
    });

    it('lança quando update retorna error', async () => {
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: { criador_id: 'usr-test' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ data: { tipo_conta: 'pj' }, error: null }))
        .mockReturnValueOnce(makeBuilder({ error: { message: 'delete fail' } }));
      await expect(produtosService.deletar('prod-1')).rejects.toThrow('delete fail');
    });
  });
});

// ── Tipos exportados ──────────────────────────────────────────────────────

describe('exports', () => {
  it('produtosService está disponível', () => {
    const mod = require('@/services/produtos');
    expect(mod.produtosService).toBeDefined();
  });
});
