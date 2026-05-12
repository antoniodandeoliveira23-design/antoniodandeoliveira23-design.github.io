/**
 * contexts/__tests__/ChatContext.test.tsx
 *
 * Testes do ChatProvider e useChat:
 *  - Sem usuário logado: estado padrão, guards em todas as ações
 *  - Com usuário logado: auto-carregamento no mount, subscription
 *  - carregarConversas: delegação, state, erro silencioso (catch interno)
 *  - criarOuObterConversa: delegação, retorno, recarrega lista
 *  - atualizarConversa: move para topo, atualiza campos, incrementa badge
 *  - marcarConversaLida: zera naoLidas, decrementa badge (Math.max)
 *  - Subscription cleanup: subscribeConversas chamado com ids, unsubscribe ao desmontar
 *  - Callback de mensagem nova dispara atualizarConversa internamente
 *
 * Estratégia:
 *  - Import estático de ChatProvider/useChat — única instância React
 *  - useAuth mockado para controlar o usuário por teste
 *  - chatService mockado inteiramente; subscribeConversas captura o callback
 *  - act(async) para flush de useEffect assíncronos (listarConversas)
 */

import React from 'react';
import { create, act } from 'react-test-renderer';
import { ChatProvider, useChat } from '@/contexts/ChatContext';

// ── Mocks ───────────────────────────────────────────────────────────────────

// useAuth controlado por teste via mockUseAuth.mockReturnValue()
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/services/chat', () => ({
  chatService: {
    listarConversas:      jest.fn(),
    criarOuObterConversa: jest.fn(),
    subscribeConversas:   jest.fn(),
    unsubscribe:          jest.fn(),
  },
}));

// ── Dados de teste ──────────────────────────────────────────────────────────

const FAKE_USER = { id: 'u-123', email: 'u@test.com', nome: 'Usuário Teste' };

type Conv = {
  id: string; criador_id: string; participante_id: string;
  ultima_mensagem: string; atualizado_em: string; naoLidas: number;
  participante: { id: string; nome: string; username: string; avatar_url: null };
};

const makeConversa = (overrides: Partial<Conv> = {}): Conv => ({
  id:              'conv-1',
  criador_id:      'u-123',
  participante_id: 'u-456',
  ultima_mensagem: 'Oi!',
  atualizado_em:   '2026-01-01T12:00:00Z',
  naoLidas:        0,
  participante:    { id: 'u-456', nome: 'Outro', username: 'outro', avatar_url: null },
  ...overrides,
});

const CONV_A = makeConversa({ id: 'conv-1', naoLidas: 2 });
const CONV_B = makeConversa({ id: 'conv-2', naoLidas: 1, ultima_mensagem: 'Boa tarde!' });

// Canal fake retornado por subscribeConversas
const FAKE_CANAL = { topic: 'realtime:chat-test' } as any;

// ── Referências globais ─────────────────────────────────────────────────────

let mockUseAuth: jest.Mock;
let mockChatSvc: any;
let capturedSubscribeCb: ((convId: string, msg: string, ts: string) => void) | null;

beforeEach(() => {
  mockUseAuth  = (require('@/contexts/AuthContext') as any).useAuth as jest.Mock;
  mockChatSvc  = (require('@/services/chat') as any).chatService;
  capturedSubscribeCb = null;

  // Por padrão: sem usuário
  mockUseAuth.mockReturnValue({ user: null });

  // Defaults de chatService
  mockChatSvc.listarConversas.mockResolvedValue([]);
  mockChatSvc.criarOuObterConversa.mockResolvedValue('conv-new');
  mockChatSvc.subscribeConversas.mockImplementation(
    (_uid: string, _ids: string[], cb: any) => {
      capturedSubscribeCb = cb;
      return FAKE_CANAL;
    },
  );
  mockChatSvc.unsubscribe.mockResolvedValue(undefined);
});

afterEach(() => jest.clearAllMocks());

// ── Helper ──────────────────────────────────────────────────────────────────

async function renderProvider(user: typeof FAKE_USER | null = null) {
  mockUseAuth.mockReturnValue({ user });

  const captured = { ctx: null as ReturnType<typeof useChat> | null };
  function Consumer() {
    captured.ctx = useChat();
    return null;
  }

  let renderer: any;
  await act(async () => {
    renderer = create(
      React.createElement(ChatProvider, null,
        React.createElement(Consumer, null),
      ),
    );
  });

  return { renderer, ctx: (): ReturnType<typeof useChat> => captured.ctx! };
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Sem usuário logado
// ─────────────────────────────────────────────────────────────────────────────

describe('ChatProvider — sem usuário logado (user = null)', () => {
  it('conversas começa como array vazio', async () => {
    const { ctx } = await renderProvider(null);
    expect(ctx().conversas).toEqual([]);
  });

  it('totalNaoLidas começa como 0', async () => {
    const { ctx } = await renderProvider(null);
    expect(ctx().totalNaoLidas).toBe(0);
  });

  it('loading começa como false', async () => {
    const { ctx } = await renderProvider(null);
    expect(ctx().loading).toBe(false);
  });

  it('listarConversas NÃO é chamado ao montar sem user', async () => {
    await renderProvider(null);
    expect(mockChatSvc.listarConversas).not.toHaveBeenCalled();
  });

  it('subscribeConversas NÃO é chamado ao montar sem user', async () => {
    await renderProvider(null);
    expect(mockChatSvc.subscribeConversas).not.toHaveBeenCalled();
  });

  it('carregarConversas() retorna sem chamar service quando user é null', async () => {
    const { ctx } = await renderProvider(null);

    await act(async () => { await ctx().carregarConversas(); });

    expect(mockChatSvc.listarConversas).not.toHaveBeenCalled();
  });

  it('criarOuObterConversa() lança "Não autenticado" quando user é null', async () => {
    const { ctx } = await renderProvider(null);

    let err: Error | null = null;
    await act(async () => {
      try { await ctx().criarOuObterConversa('u-456'); } catch (e) { err = e as Error; }
    });

    expect(err?.message).toMatch(/não autenticado/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Com usuário logado — mount e auto-carregamento
// ─────────────────────────────────────────────────────────────────────────────

describe('ChatProvider — com usuário logado (mount)', () => {
  beforeEach(() => {
    mockChatSvc.listarConversas.mockResolvedValue([CONV_A, CONV_B]);
  });

  it('chama listarConversas com user.id ao montar', async () => {
    await renderProvider(FAKE_USER);
    expect(mockChatSvc.listarConversas).toHaveBeenCalledWith(FAKE_USER.id);
  });

  it('conversas são preenchidas com o resultado de listarConversas', async () => {
    const { ctx } = await renderProvider(FAKE_USER);
    expect(ctx().conversas).toEqual([CONV_A, CONV_B]);
  });

  it('totalNaoLidas é soma de naoLidas de todas as conversas', async () => {
    // CONV_A.naoLidas=2 + CONV_B.naoLidas=1 = 3
    const { ctx } = await renderProvider(FAKE_USER);
    expect(ctx().totalNaoLidas).toBe(3);
  });

  it('loading fica false após carregarConversas no mount', async () => {
    const { ctx } = await renderProvider(FAKE_USER);
    expect(ctx().loading).toBe(false);
  });

  it('erro em listarConversas não propaga (catch interno) — loading fica false', async () => {
    mockChatSvc.listarConversas.mockRejectedValue(new Error('DB offline'));
    const { ctx } = await renderProvider(FAKE_USER);
    // Não lança, captura internamente com console.warn
    expect(ctx().loading).toBe(false);
    expect(ctx().conversas).toEqual([]);
  });

  it('subscribeConversas é chamado com user.id e ids das conversas', async () => {
    await renderProvider(FAKE_USER);
    expect(mockChatSvc.subscribeConversas).toHaveBeenCalledWith(
      FAKE_USER.id,
      ['conv-1', 'conv-2'],
      expect.any(Function),
    );
  });

  it('subscribeConversas NÃO é chamado quando conversas está vazia', async () => {
    mockChatSvc.listarConversas.mockResolvedValue([]);
    await renderProvider(FAKE_USER);
    expect(mockChatSvc.subscribeConversas).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. carregarConversas() manual
// ─────────────────────────────────────────────────────────────────────────────

describe('ChatProvider — carregarConversas() manual', () => {
  it('chama chatService.listarConversas com user.id', async () => {
    mockChatSvc.listarConversas.mockResolvedValue([]);
    const { ctx } = await renderProvider(FAKE_USER);
    mockChatSvc.listarConversas.mockClear();

    mockChatSvc.listarConversas.mockResolvedValue([CONV_A]);
    await act(async () => { await ctx().carregarConversas(); });

    expect(mockChatSvc.listarConversas).toHaveBeenCalledWith(FAKE_USER.id);
  });

  it('substitui conversas com a nova lista', async () => {
    mockChatSvc.listarConversas.mockResolvedValue([CONV_A]);
    const { ctx } = await renderProvider(FAKE_USER);

    mockChatSvc.listarConversas.mockResolvedValue([CONV_B]);
    await act(async () => { await ctx().carregarConversas(); });

    expect(ctx().conversas).toEqual([CONV_B]);
  });

  it('recalcula totalNaoLidas após novo carregamento', async () => {
    mockChatSvc.listarConversas.mockResolvedValue([CONV_A]); // naoLidas=2
    const { ctx } = await renderProvider(FAKE_USER);

    const convSemLidas = makeConversa({ naoLidas: 0 });
    mockChatSvc.listarConversas.mockResolvedValue([convSemLidas]);
    await act(async () => { await ctx().carregarConversas(); });

    expect(ctx().totalNaoLidas).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. criarOuObterConversa()
// ─────────────────────────────────────────────────────────────────────────────

describe('ChatProvider — criarOuObterConversa()', () => {
  beforeEach(() => {
    mockChatSvc.listarConversas.mockResolvedValue([]);
  });

  it('chama chatService.criarOuObterConversa com user.id e outroId', async () => {
    const { ctx } = await renderProvider(FAKE_USER);

    await act(async () => { await ctx().criarOuObterConversa('u-456'); });

    expect(mockChatSvc.criarOuObterConversa).toHaveBeenCalledWith(FAKE_USER.id, 'u-456');
  });

  it('retorna o id da conversa retornado pelo service', async () => {
    mockChatSvc.criarOuObterConversa.mockResolvedValue('conv-abc');
    const { ctx } = await renderProvider(FAKE_USER);

    let resultado: string | undefined;
    await act(async () => { resultado = await ctx().criarOuObterConversa('u-456'); });

    expect(resultado).toBe('conv-abc');
  });

  it('chama carregarConversas após criar/obter conversa', async () => {
    const { ctx } = await renderProvider(FAKE_USER);
    mockChatSvc.listarConversas.mockClear();

    await act(async () => { await ctx().criarOuObterConversa('u-456'); });

    expect(mockChatSvc.listarConversas).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. atualizarConversa()
// ─────────────────────────────────────────────────────────────────────────────

describe('ChatProvider — atualizarConversa()', () => {
  const CONV_C = makeConversa({ id: 'conv-3', ultima_mensagem: 'Olá', atualizado_em: '2026-01-01T10:00:00Z' });

  beforeEach(() => {
    mockChatSvc.listarConversas.mockResolvedValue([CONV_A, CONV_B, CONV_C]);
  });

  it('move a conversa atualizada para o topo da lista', async () => {
    const { ctx } = await renderProvider(FAKE_USER);

    await act(() => {
      ctx().atualizarConversa('conv-3', 'Nova mensagem!', '2026-06-01T12:00:00Z');
    });

    expect(ctx().conversas[0].id).toBe('conv-3');
  });

  it('atualiza ultima_mensagem e atualizado_em da conversa', async () => {
    const { ctx } = await renderProvider(FAKE_USER);

    await act(() => {
      ctx().atualizarConversa('conv-2', 'Mensagem nova', '2026-06-01T15:00:00Z');
    });

    const conv = ctx().conversas.find(c => c.id === 'conv-2')!;
    expect(conv.ultima_mensagem).toBe('Mensagem nova');
    expect(conv.atualizado_em).toBe('2026-06-01T15:00:00Z');
  });

  it('incrementa totalNaoLidas em 1', async () => {
    const { ctx } = await renderProvider(FAKE_USER);
    const antes = ctx().totalNaoLidas; // CONV_A.naoLidas=2 + CONV_B.naoLidas=1 = 3

    await act(() => {
      ctx().atualizarConversa('conv-1', 'Msg', '2026-06-01T12:00:00Z');
    });

    expect(ctx().totalNaoLidas).toBe(antes + 1);
  });

  it('não altera a lista quando conversaId não existe', async () => {
    const { ctx } = await renderProvider(FAKE_USER);
    const listaAntes = ctx().conversas.map(c => c.id);

    await act(() => {
      ctx().atualizarConversa('conv-inexistente', 'Msg', '2026-06-01T12:00:00Z');
    });

    expect(ctx().conversas.map(c => c.id)).toEqual(listaAntes);
  });

  it('as demais conversas permanecem na lista após reordenação', async () => {
    const { ctx } = await renderProvider(FAKE_USER);

    await act(() => {
      ctx().atualizarConversa('conv-3', 'Atualizada', '2026-06-01T12:00:00Z');
    });

    // conv-1 e conv-2 ainda presentes, só conv-3 foi para o topo
    expect(ctx().conversas.map(c => c.id)).toContain('conv-1');
    expect(ctx().conversas.map(c => c.id)).toContain('conv-2');
    expect(ctx().conversas).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. marcarConversaLida()
// ─────────────────────────────────────────────────────────────────────────────

describe('ChatProvider — marcarConversaLida()', () => {
  beforeEach(() => {
    // CONV_A: naoLidas=2, CONV_B: naoLidas=1  →  totalNaoLidas=3
    mockChatSvc.listarConversas.mockResolvedValue([CONV_A, CONV_B]);
  });

  it('zera naoLidas da conversa marcada como lida', async () => {
    const { ctx } = await renderProvider(FAKE_USER);

    await act(() => { ctx().marcarConversaLida('conv-1'); });

    const conv = ctx().conversas.find(c => c.id === 'conv-1')!;
    expect(conv.naoLidas).toBe(0);
  });

  it('decrementa totalNaoLidas pelo valor de naoLidas da conversa', async () => {
    const { ctx } = await renderProvider(FAKE_USER);
    expect(ctx().totalNaoLidas).toBe(3);

    await act(() => { ctx().marcarConversaLida('conv-1'); }); // naoLidas=2

    expect(ctx().totalNaoLidas).toBe(1);
  });

  it('totalNaoLidas não fica abaixo de 0 (Math.max)', async () => {
    // Uma única conversa com 1 não-lida
    const conv = makeConversa({ id: 'conv-x', naoLidas: 1 });
    mockChatSvc.listarConversas.mockResolvedValue([conv]);
    const { ctx } = await renderProvider(FAKE_USER);

    await act(() => { ctx().marcarConversaLida('conv-x'); });
    await act(() => { ctx().marcarConversaLida('conv-x'); }); // segunda vez, já é 0

    expect(ctx().totalNaoLidas).toBeGreaterThanOrEqual(0);
  });

  it('não altera conversa que já tem naoLidas = 0', async () => {
    const convLida = makeConversa({ id: 'conv-lida', naoLidas: 0 });
    mockChatSvc.listarConversas.mockResolvedValue([CONV_A, convLida]);
    const { ctx } = await renderProvider(FAKE_USER);
    const totalAntes = ctx().totalNaoLidas;

    await act(() => { ctx().marcarConversaLida('conv-lida'); });

    // totalNaoLidas não muda
    expect(ctx().totalNaoLidas).toBe(totalAntes);
    expect(ctx().conversas.find(c => c.id === 'conv-lida')?.naoLidas).toBe(0);
  });

  it('não altera outras conversas ao marcar uma como lida', async () => {
    const { ctx } = await renderProvider(FAKE_USER);

    await act(() => { ctx().marcarConversaLida('conv-1'); });

    expect(ctx().conversas.find(c => c.id === 'conv-2')?.naoLidas).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. Subscription e cleanup
// ─────────────────────────────────────────────────────────────────────────────

describe('ChatProvider — subscription e cleanup', () => {
  beforeEach(() => {
    mockChatSvc.listarConversas.mockResolvedValue([CONV_A]);
  });

  it('chama unsubscribe ao desmontar o provider', async () => {
    const { renderer } = await renderProvider(FAKE_USER);

    await act(async () => { renderer.unmount(); });

    expect(mockChatSvc.unsubscribe).toHaveBeenCalled();
  });

  it('callback de subscribeConversas dispara atualizarConversa', async () => {
    const { ctx } = await renderProvider(FAKE_USER);

    // capturedSubscribeCb foi capturado durante o mount
    expect(capturedSubscribeCb).not.toBeNull();
    const totalAntes = ctx().totalNaoLidas;

    await act(() => {
      capturedSubscribeCb!('conv-1', 'Nova mensagem via realtime', '2026-06-01T18:00:00Z');
    });

    // atualizarConversa: move conv-1 para o topo + incrementa badge
    expect(ctx().conversas[0].id).toBe('conv-1');
    expect(ctx().conversas[0].ultima_mensagem).toBe('Nova mensagem via realtime');
    expect(ctx().totalNaoLidas).toBe(totalAntes + 1);
  });

  it('subscribeConversas recebe os ids de todas as conversas carregadas', async () => {
    mockChatSvc.listarConversas.mockResolvedValue([CONV_A, CONV_B]);
    await renderProvider(FAKE_USER);

    const chamada = mockChatSvc.subscribeConversas.mock.calls[0];
    expect(chamada[1]).toEqual(expect.arrayContaining(['conv-1', 'conv-2']));
  });
});
