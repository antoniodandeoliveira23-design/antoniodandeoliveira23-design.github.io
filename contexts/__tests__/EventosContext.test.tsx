/**
 * contexts/__tests__/EventosContext.test.tsx
 *
 * Testes do EventosProvider e useEventos:
 *  - Estado inicial (eventos, loading, filtroCategoria, busca, paginacao, favoritos)
 *  - carregarEventos — delegação, state, loading no finally
 *  - carregarMais — guard temMais/loading, append, paginação
 *  - buscarEventos — seta busca, substitui eventos, loading
 *  - filtrarPorCategoria — seta/limpa categoria
 *  - buscarPorRaio — delegação, categoria padrão do estado
 *  - criarEvento — aprovado insere no topo, pendente não insere, loading
 *  - editarEvento — substitui na lista, retorna atualizado
 *  - deletarEvento — remove da lista, decrementa total
 *  - favoritarEvento / desfavoritarEvento — adiciona/remove de favoritos
 *
 * Estratégia:
 *  - react-test-renderer v19 + act() — mesmo padrão do AuthContext
 *  - Import estático de EventosProvider/useEventos (uma única instância React)
 *  - jest.mock() de @/services/eventos com implementações configuradas em beforeEach
 *  - EventosProvider não tem useEffect nem supabase — sem mocks adicionais
 */

import React from 'react';
import { create, act } from 'react-test-renderer';
import { EventosProvider, useEventos } from '@/contexts/EventosContext';

// ── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@/services/eventos', () => ({
  eventosService: {
    listar:        jest.fn(),
    listarPorRaio: jest.fn(),
    criar:         jest.fn(),
    editar:        jest.fn(),
    deletar:       jest.fn(),
    favoritar:     jest.fn(),
    desfavoritar:  jest.fn(),
  },
}));

// ── Dados de teste ──────────────────────────────────────────────────────────

const makeEvento = (overrides: Partial<Record<string, any>> = {}) => ({
  id:                 'evt-1',
  criador_id:         'usr-1',
  nome:               'Show de Rock',
  descricao:          'Descrição do evento',
  local:              'Vilhena, RO',
  lat:                -12.74,
  lng:                -60.14,
  categoria:          'musica' as const,
  data_inicio:        '2026-07-01T20:00:00Z',
  comercial:          false,
  exclusivo_mulheres: false,
  status:             'aprovado' as const,
  pago:               false,
  destaque:           false,
  criado_em:          '2026-01-01T00:00:00Z',
  ...overrides,
});

const EVENTO_A = makeEvento({ id: 'evt-1', nome: 'Show de Rock' });
const EVENTO_B = makeEvento({ id: 'evt-2', nome: 'Feira de Artesanato', categoria: 'feira' as const });

const RESPOSTA_PADRAO = {
  dados:    [EVENTO_A],
  pagina:   1,
  porPagina:20,
  total:    1,
  temMais:  false,
};

const PAGINACAO_INICIAL = { pagina: 1, porPagina: 20, total: 0, temMais: false };

// ── Referências globais ─────────────────────────────────────────────────────

let mockSvc: any;

beforeEach(() => {
  mockSvc = (require('@/services/eventos') as any).eventosService;

  // Defaults
  mockSvc.listar.mockResolvedValue(RESPOSTA_PADRAO);
  mockSvc.listarPorRaio.mockResolvedValue({ ...RESPOSTA_PADRAO, dados: [] });
  mockSvc.criar.mockResolvedValue(EVENTO_A);
  mockSvc.editar.mockResolvedValue(EVENTO_A);
  mockSvc.deletar.mockResolvedValue(undefined);
  mockSvc.favoritar.mockResolvedValue(undefined);
  mockSvc.desfavoritar.mockResolvedValue(undefined);
});

afterEach(() => jest.clearAllMocks());

// ── Helper ──────────────────────────────────────────────────────────────────

async function renderProvider() {
  const captured = { ctx: null as ReturnType<typeof useEventos> | null };

  function Consumer() {
    captured.ctx = useEventos();
    return null;
  }

  let renderer: any;
  await act(async () => {
    renderer = create(
      React.createElement(EventosProvider, null,
        React.createElement(Consumer, null),
      ),
    );
  });

  return {
    renderer,
    ctx: (): ReturnType<typeof useEventos> => captured.ctx!,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Estado inicial
// ─────────────────────────────────────────────────────────────────────────────

describe('EventosProvider — estado inicial', () => {
  it('eventos começa como array vazio', async () => {
    const { ctx } = await renderProvider();
    expect(ctx().eventos).toEqual([]);
  });

  it('loading começa como false', async () => {
    const { ctx } = await renderProvider();
    expect(ctx().loading).toBe(false);
  });

  it('filtroCategoria começa como null', async () => {
    const { ctx } = await renderProvider();
    expect(ctx().filtroCategoria).toBeNull();
  });

  it('busca começa como string vazia', async () => {
    const { ctx } = await renderProvider();
    expect(ctx().busca).toBe('');
  });

  it('paginacao começa com valores padrão', async () => {
    const { ctx } = await renderProvider();
    expect(ctx().paginacao).toEqual(PAGINACAO_INICIAL);
  });

  it('favoritos começa como array vazio', async () => {
    const { ctx } = await renderProvider();
    expect(ctx().favoritos).toEqual([]);
  });

  it('expõe todas as funções do contexto', async () => {
    const { ctx } = await renderProvider();
    const c = ctx();
    ['carregarEventos','carregarMais','buscarEventos','filtrarPorCategoria',
     'buscarPorRaio','criarEvento','editarEvento','deletarEvento',
     'favoritarEvento','desfavoritarEvento'].forEach(fn => {
      expect(typeof (c as any)[fn]).toBe('function');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. carregarEventos()
// ─────────────────────────────────────────────────────────────────────────────

describe('EventosProvider — carregarEventos()', () => {
  it('chama eventosService.listar com pagina=1 e defaults', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().carregarEventos(); });

    expect(mockSvc.listar).toHaveBeenCalledWith(
      expect.objectContaining({ pagina: 1, porPagina: 20 }),
    );
  });

  it('substitui eventos com o resultado', async () => {
    mockSvc.listar.mockResolvedValue({ ...RESPOSTA_PADRAO, dados: [EVENTO_A, EVENTO_B] });
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().carregarEventos(); });

    expect(ctx().eventos).toEqual([EVENTO_A, EVENTO_B]);
  });

  it('atualiza paginacao com os valores retornados', async () => {
    mockSvc.listar.mockResolvedValue({
      dados: [EVENTO_A], pagina: 1, porPagina: 20, total: 50, temMais: true,
    });
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().carregarEventos(); });

    expect(ctx().paginacao).toEqual({ pagina: 1, porPagina: 20, total: 50, temMais: true });
  });

  it('loading fica false no finally após sucesso', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().carregarEventos(); });

    expect(ctx().loading).toBe(false);
  });

  it('loading fica false no finally quando listar lança erro', async () => {
    mockSvc.listar.mockRejectedValue(new Error('DB offline'));
    const { ctx } = await renderProvider();

    await act(async () => {
      try { await ctx().carregarEventos(); } catch {}
    });

    expect(ctx().loading).toBe(false);
  });

  it('passa opcoes extras para eventosService.listar', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().carregarEventos({ categoria: 'musica', busca: 'show' }); });

    expect(mockSvc.listar).toHaveBeenCalledWith(
      expect.objectContaining({ categoria: 'musica', busca: 'show', pagina: 1 }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. carregarMais()
// ─────────────────────────────────────────────────────────────────────────────

describe('EventosProvider — carregarMais()', () => {
  it('não faz nada quando temMais é false (padrão)', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().carregarMais(); });

    expect(mockSvc.listar).not.toHaveBeenCalled();
  });

  it('chama listar com proxima pagina quando temMais=true', async () => {
    // Primeiro carregarEventos para popular paginacao.temMais=true
    mockSvc.listar.mockResolvedValueOnce({
      dados: [EVENTO_A], pagina: 1, porPagina: 20, total: 40, temMais: true,
    });
    // Segunda chamada para carregarMais
    mockSvc.listar.mockResolvedValueOnce({
      dados: [EVENTO_B], pagina: 2, porPagina: 20, total: 40, temMais: false,
    });

    const { ctx } = await renderProvider();
    await act(async () => { await ctx().carregarEventos(); });

    await act(async () => { await ctx().carregarMais(); });

    expect(mockSvc.listar).toHaveBeenCalledTimes(2);
    expect(mockSvc.listar).toHaveBeenLastCalledWith(
      expect.objectContaining({ pagina: 2 }),
    );
  });

  it('faz append nos eventos existentes (não substitui)', async () => {
    mockSvc.listar.mockResolvedValueOnce({
      dados: [EVENTO_A], pagina: 1, porPagina: 20, total: 40, temMais: true,
    });
    mockSvc.listar.mockResolvedValueOnce({
      dados: [EVENTO_B], pagina: 2, porPagina: 20, total: 40, temMais: false,
    });

    const { ctx } = await renderProvider();
    await act(async () => { await ctx().carregarEventos(); });
    await act(async () => { await ctx().carregarMais(); });

    expect(ctx().eventos).toEqual([EVENTO_A, EVENTO_B]);
  });

  it('atualiza paginacao após carregar mais', async () => {
    mockSvc.listar.mockResolvedValueOnce({
      dados: [EVENTO_A], pagina: 1, porPagina: 20, total: 40, temMais: true,
    });
    mockSvc.listar.mockResolvedValueOnce({
      dados: [EVENTO_B], pagina: 2, porPagina: 20, total: 40, temMais: false,
    });

    const { ctx } = await renderProvider();
    await act(async () => { await ctx().carregarEventos(); });
    await act(async () => { await ctx().carregarMais(); });

    expect(ctx().paginacao.pagina).toBe(2);
    expect(ctx().paginacao.temMais).toBe(false);
  });

  it('loading fica false no finally após carregarMais', async () => {
    mockSvc.listar.mockResolvedValueOnce({
      dados: [EVENTO_A], pagina: 1, porPagina: 20, total: 40, temMais: true,
    });
    mockSvc.listar.mockResolvedValueOnce({
      dados: [EVENTO_B], pagina: 2, porPagina: 20, total: 40, temMais: false,
    });

    const { ctx } = await renderProvider();
    await act(async () => { await ctx().carregarEventos(); });
    await act(async () => { await ctx().carregarMais(); });

    expect(ctx().loading).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. buscarEventos()
// ─────────────────────────────────────────────────────────────────────────────

describe('EventosProvider — buscarEventos()', () => {
  it('atualiza estado busca com o termo fornecido', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().buscarEventos('rock'); });

    expect(ctx().busca).toBe('rock');
  });

  it('chama eventosService.listar com o termo de busca', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().buscarEventos('feira'); });

    expect(mockSvc.listar).toHaveBeenCalledWith(
      expect.objectContaining({ busca: 'feira', pagina: 1 }),
    );
  });

  it('substitui eventos com o resultado (não faz append)', async () => {
    // Carrega um evento inicial
    mockSvc.listar.mockResolvedValueOnce({ ...RESPOSTA_PADRAO, dados: [EVENTO_A] });
    const { ctx } = await renderProvider();
    await act(async () => { await ctx().carregarEventos(); });
    expect(ctx().eventos).toEqual([EVENTO_A]);

    // Busca retorna EVENTO_B
    mockSvc.listar.mockResolvedValueOnce({ ...RESPOSTA_PADRAO, dados: [EVENTO_B] });
    await act(async () => { await ctx().buscarEventos('artesanato'); });

    expect(ctx().eventos).toEqual([EVENTO_B]);
  });

  it('loading fica false após busca', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().buscarEventos('qualquer'); });

    expect(ctx().loading).toBe(false);
  });

  it('loading fica false mesmo quando listar lança durante busca', async () => {
    mockSvc.listar.mockRejectedValue(new Error('timeout'));
    const { ctx } = await renderProvider();

    await act(async () => {
      try { await ctx().buscarEventos('erro'); } catch {}
    });

    expect(ctx().loading).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. filtrarPorCategoria()
// ─────────────────────────────────────────────────────────────────────────────

describe('EventosProvider — filtrarPorCategoria()', () => {
  it('seta filtroCategoria com a categoria fornecida', async () => {
    const { ctx } = await renderProvider();

    await act(() => { ctx().filtrarPorCategoria('musica'); });

    expect(ctx().filtroCategoria).toBe('musica');
  });

  it('seta filtroCategoria como null quando chamado com null', async () => {
    const { ctx } = await renderProvider();
    await act(() => { ctx().filtrarPorCategoria('musica'); });

    await act(() => { ctx().filtrarPorCategoria(null); });

    expect(ctx().filtroCategoria).toBeNull();
  });

  it('não dispara carregamento automático de eventos', async () => {
    const { ctx } = await renderProvider();

    await act(() => { ctx().filtrarPorCategoria('teatro'); });

    // Nenhuma chamada ao service — filtro só muda state local
    expect(mockSvc.listar).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. buscarPorRaio()
// ─────────────────────────────────────────────────────────────────────────────

describe('EventosProvider — buscarPorRaio()', () => {
  const RAIO_RESP = {
    dados:    [{ ...EVENTO_A, distanciaKm: 2.5 }],
    pagina:   1,
    porPagina:20,
    total:    1,
    temMais:  false,
  };

  beforeEach(() => {
    mockSvc.listarPorRaio.mockResolvedValue(RAIO_RESP);
  });

  it('chama eventosService.listarPorRaio com lat, lng e raioKm', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().buscarPorRaio(-12.74, -60.14, 5); });

    expect(mockSvc.listarPorRaio).toHaveBeenCalledWith(
      -12.74, -60.14, 5, expect.any(Object),
    );
  });

  it('usa raioKm padrão 10 quando não fornecido', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().buscarPorRaio(-12.74, -60.14); });

    expect(mockSvc.listarPorRaio).toHaveBeenCalledWith(
      -12.74, -60.14, 10, expect.any(Object),
    );
  });

  it('retorna o resultado do service', async () => {
    const { ctx } = await renderProvider();

    let resultado: any;
    await act(async () => {
      resultado = await ctx().buscarPorRaio(-12.74, -60.14, 5);
    });

    expect(resultado).toEqual(RAIO_RESP);
  });

  it('usa filtroCategoria do estado quando opcoes.categoria não fornecida', async () => {
    const { ctx } = await renderProvider();
    await act(() => { ctx().filtrarPorCategoria('musica'); });

    await act(async () => { await ctx().buscarPorRaio(-12.74, -60.14, 10); });

    expect(mockSvc.listarPorRaio).toHaveBeenCalledWith(
      -12.74, -60.14, 10,
      expect.objectContaining({ categoria: 'musica' }),
    );
  });

  it('opcoes.categoria sobrepõe filtroCategoria do estado', async () => {
    const { ctx } = await renderProvider();
    await act(() => { ctx().filtrarPorCategoria('musica'); });

    await act(async () => {
      await ctx().buscarPorRaio(-12.74, -60.14, 10, { categoria: 'esporte' });
    });

    expect(mockSvc.listarPorRaio).toHaveBeenCalledWith(
      -12.74, -60.14, 10,
      expect.objectContaining({ categoria: 'esporte' }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. criarEvento()
// ─────────────────────────────────────────────────────────────────────────────

const CRIAR_DATA = {
  nome:               'Novo Evento',
  descricao:          'Desc',
  local:              'Vilhena, RO',
  lat:                -12.74,
  lng:                -60.14,
  categoria:          'musica' as const,
  data_inicio:        '2026-08-01T20:00:00Z',
  exclusivo_mulheres: false,
};

describe('EventosProvider — criarEvento()', () => {
  it('chama eventosService.criar com os dados fornecidos', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().criarEvento(CRIAR_DATA); });

    expect(mockSvc.criar).toHaveBeenCalledWith(CRIAR_DATA, undefined, undefined);
  });

  it('insere novo evento no topo quando status é "aprovado"', async () => {
    const novoEvento = makeEvento({ id: 'novo-1', nome: 'Novo Aprovado', status: 'aprovado' });
    mockSvc.criar.mockResolvedValue(novoEvento);

    // Carrega um evento existente primeiro
    mockSvc.listar.mockResolvedValue({ ...RESPOSTA_PADRAO, dados: [EVENTO_A] });
    const { ctx } = await renderProvider();
    await act(async () => { await ctx().carregarEventos(); });

    await act(async () => { await ctx().criarEvento(CRIAR_DATA); });

    expect(ctx().eventos[0]).toEqual(novoEvento);
    expect(ctx().eventos[1]).toEqual(EVENTO_A);
  });

  it('incrementa total na paginacao quando evento aprovado', async () => {
    mockSvc.listar.mockResolvedValue({ ...RESPOSTA_PADRAO, total: 5 });
    const { ctx } = await renderProvider();
    await act(async () => { await ctx().carregarEventos(); });

    mockSvc.criar.mockResolvedValue(makeEvento({ status: 'aprovado' }));
    await act(async () => { await ctx().criarEvento(CRIAR_DATA); });

    expect(ctx().paginacao.total).toBe(6);
  });

  it('NÃO insere na lista quando status é "pendente"', async () => {
    mockSvc.listar.mockResolvedValue({ ...RESPOSTA_PADRAO, dados: [EVENTO_A] });
    const { ctx } = await renderProvider();
    await act(async () => { await ctx().carregarEventos(); });

    mockSvc.criar.mockResolvedValue(makeEvento({ id: 'pend-1', status: 'pendente' }));
    await act(async () => { await ctx().criarEvento(CRIAR_DATA); });

    // Eventos não mudou
    expect(ctx().eventos).toEqual([EVENTO_A]);
  });

  it('retorna o evento criado', async () => {
    const novoEvento = makeEvento({ id: 'novo-2', nome: 'Criado' });
    mockSvc.criar.mockResolvedValue(novoEvento);
    const { ctx } = await renderProvider();

    let resultado: any;
    await act(async () => { resultado = await ctx().criarEvento(CRIAR_DATA); });

    expect(resultado).toEqual(novoEvento);
  });

  it('loading fica false no finally após criar', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().criarEvento(CRIAR_DATA); });

    expect(ctx().loading).toBe(false);
  });

  it('loading fica false mesmo quando criar lança erro', async () => {
    mockSvc.criar.mockRejectedValue(new Error('Sem permissão'));
    const { ctx } = await renderProvider();

    await act(async () => {
      try { await ctx().criarEvento(CRIAR_DATA); } catch {}
    });

    expect(ctx().loading).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H. editarEvento()
// ─────────────────────────────────────────────────────────────────────────────

describe('EventosProvider — editarEvento()', () => {
  it('chama eventosService.editar com eventoId e updates', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().editarEvento('evt-1', { nome: 'Novo Nome' }); });

    expect(mockSvc.editar).toHaveBeenCalledWith('evt-1', { nome: 'Novo Nome' });
  });

  it('substitui o evento na lista pelo evento atualizado', async () => {
    mockSvc.listar.mockResolvedValue({ ...RESPOSTA_PADRAO, dados: [EVENTO_A, EVENTO_B] });
    const eventoAtualizado = makeEvento({ id: 'evt-1', nome: 'Nome Editado' });
    mockSvc.editar.mockResolvedValue(eventoAtualizado);

    const { ctx } = await renderProvider();
    await act(async () => { await ctx().carregarEventos(); });

    await act(async () => { await ctx().editarEvento('evt-1', { nome: 'Nome Editado' }); });

    expect(ctx().eventos.find(e => e.id === 'evt-1')?.nome).toBe('Nome Editado');
    expect(ctx().eventos.find(e => e.id === 'evt-2')?.nome).toBe(EVENTO_B.nome);
  });

  it('retorna o evento atualizado', async () => {
    const atualizado = makeEvento({ id: 'evt-1', nome: 'Editado' });
    mockSvc.editar.mockResolvedValue(atualizado);
    const { ctx } = await renderProvider();

    let resultado: any;
    await act(async () => { resultado = await ctx().editarEvento('evt-1', { nome: 'Editado' }); });

    expect(resultado).toEqual(atualizado);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I. deletarEvento()
// ─────────────────────────────────────────────────────────────────────────────

describe('EventosProvider — deletarEvento()', () => {
  it('chama eventosService.deletar com o eventoId', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().deletarEvento('evt-1'); });

    expect(mockSvc.deletar).toHaveBeenCalledWith('evt-1');
  });

  it('remove o evento da lista', async () => {
    mockSvc.listar.mockResolvedValue({ ...RESPOSTA_PADRAO, dados: [EVENTO_A, EVENTO_B] });
    const { ctx } = await renderProvider();
    await act(async () => { await ctx().carregarEventos(); });

    await act(async () => { await ctx().deletarEvento('evt-1'); });

    expect(ctx().eventos.map(e => e.id)).toEqual(['evt-2']);
  });

  it('decrementa total na paginacao', async () => {
    mockSvc.listar.mockResolvedValue({ ...RESPOSTA_PADRAO, dados: [EVENTO_A], total: 5 });
    const { ctx } = await renderProvider();
    await act(async () => { await ctx().carregarEventos(); });

    await act(async () => { await ctx().deletarEvento('evt-1'); });

    expect(ctx().paginacao.total).toBe(4);
  });

  it('total não fica negativo quando já é 0', async () => {
    const { ctx } = await renderProvider(); // total = 0 (padrão)

    await act(async () => { await ctx().deletarEvento('evt-x'); });

    expect(ctx().paginacao.total).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// J. favoritarEvento()
// ─────────────────────────────────────────────────────────────────────────────

describe('EventosProvider — favoritarEvento()', () => {
  it('chama eventosService.favoritar com o eventoId', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().favoritarEvento('evt-1'); });

    expect(mockSvc.favoritar).toHaveBeenCalledWith('evt-1');
  });

  it('adiciona eventoId ao array de favoritos', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().favoritarEvento('evt-1'); });

    expect(ctx().favoritos).toContain('evt-1');
  });

  it('múltiplos favoritos acumulam corretamente', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().favoritarEvento('evt-1'); });
    await act(async () => { await ctx().favoritarEvento('evt-2'); });

    expect(ctx().favoritos).toEqual(['evt-1', 'evt-2']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// K. desfavoritarEvento()
// ─────────────────────────────────────────────────────────────────────────────

describe('EventosProvider — desfavoritarEvento()', () => {
  it('chama eventosService.desfavoritar com o eventoId', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().desfavoritarEvento('evt-1'); });

    expect(mockSvc.desfavoritar).toHaveBeenCalledWith('evt-1');
  });

  it('remove eventoId do array de favoritos', async () => {
    const { ctx } = await renderProvider();
    await act(async () => { await ctx().favoritarEvento('evt-1'); });
    await act(async () => { await ctx().favoritarEvento('evt-2'); });

    await act(async () => { await ctx().desfavoritarEvento('evt-1'); });

    expect(ctx().favoritos).toEqual(['evt-2']);
    expect(ctx().favoritos).not.toContain('evt-1');
  });

  it('não altera outros favoritos ao desfavoritar', async () => {
    const { ctx } = await renderProvider();
    await act(async () => { await ctx().favoritarEvento('evt-A'); });
    await act(async () => { await ctx().favoritarEvento('evt-B'); });
    await act(async () => { await ctx().favoritarEvento('evt-C'); });

    await act(async () => { await ctx().desfavoritarEvento('evt-B'); });

    expect(ctx().favoritos).toEqual(['evt-A', 'evt-C']);
  });
});
