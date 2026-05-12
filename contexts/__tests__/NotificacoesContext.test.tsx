/**
 * contexts/__tests__/NotificacoesContext.test.tsx
 *
 * Testes do NotificacoesProvider e useNotificacoes:
 *  - Sem usuário: estado padrão, guards em recarregar e marcarTodasLidas
 *  - Com usuário (supabaseConfigured=false): auto-carregamento, sem canal realtime
 *  - Com usuário (supabaseConfigured=true): canal criado, removeChannel no unmount
 *  - recarregar(): delegação a buscarNotificacoes + contarNaoLidas, loading
 *  - marcarLida(): delega, marca na lista, decrementa badge (Math.max)
 *  - marcarTodasLidas(): delega, marca todas, zera badge
 *  - Realtime INSERT: nova notificação no topo, badge+1
 *
 * Estratégia:
 *  - Import estático de NotificacoesProvider/useNotificacoes
 *  - useAuth mockado para controlar user/signed por teste
 *  - @/services/supabase mock mutável: supabaseConfigured + channel builder
 *  - channel.on captura callback realtime para simular INSERTs
 *  - @/services/notificacoes funções mockadas individualmente
 */

import React from 'react';
import { create, act } from 'react-test-renderer';
import { NotificacoesProvider, useNotificacoes } from '@/contexts/NotificacoesContext';

// ── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/services/supabase', () => ({
  supabaseConfigured: false,     // mutado em beforeEach / por describe
  supabase: {
    channel:       jest.fn(),
    removeChannel: jest.fn(),
  },
}));

jest.mock('@/services/notificacoes', () => ({
  buscarNotificacoes:    jest.fn(),
  contarNaoLidas:        jest.fn(),
  marcarComoLida:        jest.fn(),
  marcarTodasComoLidas:  jest.fn(),
}));

// ── Tipos e dados de teste ──────────────────────────────────────────────────

type Notif = {
  id: string; usuario_id: string; tipo: string;
  titulo: string; mensagem: string; dados: Record<string, string>;
  lida: boolean; criado_em: string;
};

const makeNotif = (overrides: Partial<Notif> = {}): Notif => ({
  id:         'notif-1',
  usuario_id: 'u-123',
  tipo:       'nova_mensagem',
  titulo:     'Nova mensagem',
  mensagem:   'Você recebeu uma mensagem',
  dados:      {},
  lida:       false,
  criado_em:  '2026-01-01T12:00:00Z',
  ...overrides,
});

const FAKE_USER   = { id: 'u-123', email: 'u@test.com', nome: 'Usuário' };
const NOTIF_A     = makeNotif({ id: 'notif-1', lida: false });
const NOTIF_B     = makeNotif({ id: 'notif-2', lida: true  });

// ── Referências globais ─────────────────────────────────────────────────────

let mockUseAuth:    jest.Mock;
let mockSupabaseMod: any;
let mockNotifSvc:   any;
let capturedRealtimeCb: ((payload: any) => void) | null;

/** Cria um novo mock do channel builder capturando o callback de .on() */
function makeChannelMock() {
  const channelObj: any = {};
  capturedRealtimeCb = null;

  channelObj.on = jest.fn().mockImplementation(
    (_event: string, _filter: any, cb: (payload: any) => void) => {
      capturedRealtimeCb = cb;
      return channelObj;
    },
  );
  channelObj.subscribe = jest.fn().mockReturnValue(channelObj);
  return channelObj;
}

beforeEach(() => {
  mockUseAuth    = (require('@/contexts/AuthContext') as any).useAuth as jest.Mock;
  mockSupabaseMod = require('@/services/supabase') as any;
  mockNotifSvc   = require('@/services/notificacoes') as any;

  // Por padrão: sem usuário, supabase não configurado
  mockUseAuth.mockReturnValue({ user: null, signed: false });
  mockSupabaseMod.supabaseConfigured = false;

  // channel mock fresco por teste
  mockSupabaseMod.supabase.channel.mockReturnValue(makeChannelMock());
  mockSupabaseMod.supabase.removeChannel.mockResolvedValue(undefined);

  // Defaults dos serviços
  mockNotifSvc.buscarNotificacoes.mockResolvedValue([]);
  mockNotifSvc.contarNaoLidas.mockResolvedValue(0);
  mockNotifSvc.marcarComoLida.mockResolvedValue(undefined);
  mockNotifSvc.marcarTodasComoLidas.mockResolvedValue(undefined);
});

afterEach(() => jest.clearAllMocks());

// ── Helper ──────────────────────────────────────────────────────────────────

async function renderProvider(
  user: typeof FAKE_USER | null = null,
  signed = !!user,
) {
  mockUseAuth.mockReturnValue({ user, signed });

  const captured = { ctx: null as ReturnType<typeof useNotificacoes> | null };
  function Consumer() {
    captured.ctx = useNotificacoes();
    return null;
  }

  let renderer: any;
  await act(async () => {
    renderer = create(
      React.createElement(NotificacoesProvider, null,
        React.createElement(Consumer, null),
      ),
    );
  });

  return { renderer, ctx: (): ReturnType<typeof useNotificacoes> => captured.ctx! };
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Sem usuário logado
// ─────────────────────────────────────────────────────────────────────────────

describe('NotificacoesProvider — sem usuário (signed=false)', () => {
  it('notificacoes começa como array vazio', async () => {
    const { ctx } = await renderProvider(null);
    expect(ctx().notificacoes).toEqual([]);
  });

  it('totalNaoLidas começa como 0', async () => {
    const { ctx } = await renderProvider(null);
    expect(ctx().totalNaoLidas).toBe(0);
  });

  it('loading começa como false', async () => {
    const { ctx } = await renderProvider(null);
    expect(ctx().loading).toBe(false);
  });

  it('buscarNotificacoes NÃO é chamado ao montar sem usuário', async () => {
    await renderProvider(null);
    expect(mockNotifSvc.buscarNotificacoes).not.toHaveBeenCalled();
  });

  it('supabase.channel NÃO é criado sem usuário', async () => {
    await renderProvider(null);
    expect(mockSupabaseMod.supabase.channel).not.toHaveBeenCalled();
  });

  it('recarregar() retorna sem chamar service quando user é null', async () => {
    const { ctx } = await renderProvider(null);

    await act(async () => { await ctx().recarregar(); });

    expect(mockNotifSvc.buscarNotificacoes).not.toHaveBeenCalled();
    expect(mockNotifSvc.contarNaoLidas).not.toHaveBeenCalled();
  });

  it('marcarTodasLidas() retorna sem chamar service quando user é null', async () => {
    const { ctx } = await renderProvider(null);

    await act(async () => { await ctx().marcarTodasLidas(); });

    expect(mockNotifSvc.marcarTodasComoLidas).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Com usuário logado — supabaseConfigured = false
// ─────────────────────────────────────────────────────────────────────────────

describe('NotificacoesProvider — com usuário (supabaseConfigured=false)', () => {
  beforeEach(() => {
    mockNotifSvc.buscarNotificacoes.mockResolvedValue([NOTIF_A, NOTIF_B]);
    mockNotifSvc.contarNaoLidas.mockResolvedValue(1); // NOTIF_A não lida
  });

  it('chama buscarNotificacoes com user.id ao montar', async () => {
    await renderProvider(FAKE_USER);
    expect(mockNotifSvc.buscarNotificacoes).toHaveBeenCalledWith(FAKE_USER.id);
  });

  it('chama contarNaoLidas com user.id ao montar', async () => {
    await renderProvider(FAKE_USER);
    expect(mockNotifSvc.contarNaoLidas).toHaveBeenCalledWith(FAKE_USER.id);
  });

  it('notificacoes são preenchidas com o resultado de buscarNotificacoes', async () => {
    const { ctx } = await renderProvider(FAKE_USER);
    expect(ctx().notificacoes).toEqual([NOTIF_A, NOTIF_B]);
  });

  it('totalNaoLidas é preenchido com resultado de contarNaoLidas', async () => {
    const { ctx } = await renderProvider(FAKE_USER);
    expect(ctx().totalNaoLidas).toBe(1);
  });

  it('loading fica false após recarregar no mount', async () => {
    const { ctx } = await renderProvider(FAKE_USER);
    expect(ctx().loading).toBe(false);
  });

  it('loading fica false mesmo quando recarregar lança erro (via chamada manual)', async () => {
    // Monta com sucesso para evitar rejeição não capturada no useEffect
    const { ctx } = await renderProvider(FAKE_USER);

    // Dispara recarregar com erro de forma explícita, capturando a rejeição
    mockNotifSvc.buscarNotificacoes.mockRejectedValue(new Error('timeout'));
    await act(async () => {
      try { await ctx().recarregar(); } catch {}
    });

    expect(ctx().loading).toBe(false);
  });

  it('supabase.channel NÃO é chamado quando supabaseConfigured=false', async () => {
    await renderProvider(FAKE_USER);
    expect(mockSupabaseMod.supabase.channel).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Com usuário logado — supabaseConfigured = true
// ─────────────────────────────────────────────────────────────────────────────

describe('NotificacoesProvider — com usuário (supabaseConfigured=true)', () => {
  beforeEach(() => {
    mockSupabaseMod.supabaseConfigured = true;
    mockNotifSvc.buscarNotificacoes.mockResolvedValue([NOTIF_A]);
    mockNotifSvc.contarNaoLidas.mockResolvedValue(1);
  });

  it('supabase.channel é chamado com o nome do canal correto', async () => {
    await renderProvider(FAKE_USER);
    expect(mockSupabaseMod.supabase.channel).toHaveBeenCalledWith(
      `notificacoes:${FAKE_USER.id}`,
    );
  });

  it('channel.on é chamado com event INSERT na tabela notificacoes', async () => {
    const channelMock = makeChannelMock();
    mockSupabaseMod.supabase.channel.mockReturnValue(channelMock);

    await renderProvider(FAKE_USER);

    expect(channelMock.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ event: 'INSERT', table: 'notificacoes' }),
      expect.any(Function),
    );
  });

  it('channel.subscribe é chamado após .on()', async () => {
    const channelMock = makeChannelMock();
    mockSupabaseMod.supabase.channel.mockReturnValue(channelMock);

    await renderProvider(FAKE_USER);

    expect(channelMock.subscribe).toHaveBeenCalled();
  });

  it('supabase.removeChannel é chamado ao desmontar', async () => {
    const { renderer } = await renderProvider(FAKE_USER);

    await act(async () => { renderer.unmount(); });

    expect(mockSupabaseMod.supabase.removeChannel).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. recarregar() manual
// ─────────────────────────────────────────────────────────────────────────────

describe('NotificacoesProvider — recarregar() manual', () => {
  it('chama buscarNotificacoes e contarNaoLidas com user.id', async () => {
    mockNotifSvc.buscarNotificacoes.mockResolvedValue([]);
    mockNotifSvc.contarNaoLidas.mockResolvedValue(0);
    const { ctx } = await renderProvider(FAKE_USER);
    jest.clearAllMocks();

    mockNotifSvc.buscarNotificacoes.mockResolvedValue([NOTIF_A]);
    mockNotifSvc.contarNaoLidas.mockResolvedValue(1);
    await act(async () => { await ctx().recarregar(); });

    expect(mockNotifSvc.buscarNotificacoes).toHaveBeenCalledWith(FAKE_USER.id);
    expect(mockNotifSvc.contarNaoLidas).toHaveBeenCalledWith(FAKE_USER.id);
  });

  it('substitui notificacoes com a nova lista', async () => {
    mockNotifSvc.buscarNotificacoes.mockResolvedValue([NOTIF_A]);
    mockNotifSvc.contarNaoLidas.mockResolvedValue(1);
    const { ctx } = await renderProvider(FAKE_USER);

    const novaLista = [makeNotif({ id: 'notif-novo', titulo: 'Novo' })];
    mockNotifSvc.buscarNotificacoes.mockResolvedValue(novaLista);
    mockNotifSvc.contarNaoLidas.mockResolvedValue(1);
    await act(async () => { await ctx().recarregar(); });

    expect(ctx().notificacoes).toEqual(novaLista);
  });

  it('atualiza totalNaoLidas com o novo valor', async () => {
    mockNotifSvc.buscarNotificacoes.mockResolvedValue([NOTIF_A]);
    mockNotifSvc.contarNaoLidas.mockResolvedValue(1);
    const { ctx } = await renderProvider(FAKE_USER);

    mockNotifSvc.buscarNotificacoes.mockResolvedValue([]);
    mockNotifSvc.contarNaoLidas.mockResolvedValue(0);
    await act(async () => { await ctx().recarregar(); });

    expect(ctx().totalNaoLidas).toBe(0);
  });

  it('loading fica false no finally após sucesso', async () => {
    mockNotifSvc.buscarNotificacoes.mockResolvedValue([]);
    mockNotifSvc.contarNaoLidas.mockResolvedValue(0);
    const { ctx } = await renderProvider(FAKE_USER);

    await act(async () => { await ctx().recarregar(); });

    expect(ctx().loading).toBe(false);
  });

  it('loading fica false no finally quando lança erro', async () => {
    mockNotifSvc.buscarNotificacoes.mockResolvedValue([]);
    mockNotifSvc.contarNaoLidas.mockResolvedValue(0);
    const { ctx } = await renderProvider(FAKE_USER);

    mockNotifSvc.buscarNotificacoes.mockRejectedValue(new Error('fail'));
    await act(async () => {
      try { await ctx().recarregar(); } catch {}
    });

    expect(ctx().loading).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. marcarLida()
// ─────────────────────────────────────────────────────────────────────────────

describe('NotificacoesProvider — marcarLida()', () => {
  beforeEach(() => {
    mockNotifSvc.buscarNotificacoes.mockResolvedValue([NOTIF_A, NOTIF_B]);
    mockNotifSvc.contarNaoLidas.mockResolvedValue(1);
  });

  it('chama marcarComoLida com o id correto', async () => {
    const { ctx } = await renderProvider(FAKE_USER);

    await act(async () => { await ctx().marcarLida('notif-1'); });

    expect(mockNotifSvc.marcarComoLida).toHaveBeenCalledWith('notif-1');
  });

  it('marca a notificação como lida na lista local', async () => {
    const { ctx } = await renderProvider(FAKE_USER);

    await act(async () => { await ctx().marcarLida('notif-1'); });

    const notif = ctx().notificacoes.find(n => n.id === 'notif-1')!;
    expect(notif.lida).toBe(true);
  });

  it('decrementa totalNaoLidas em 1', async () => {
    const { ctx } = await renderProvider(FAKE_USER);
    expect(ctx().totalNaoLidas).toBe(1);

    await act(async () => { await ctx().marcarLida('notif-1'); });

    expect(ctx().totalNaoLidas).toBe(0);
  });

  it('totalNaoLidas não fica negativo (Math.max)', async () => {
    mockNotifSvc.contarNaoLidas.mockResolvedValue(0);
    const { ctx } = await renderProvider(FAKE_USER);

    await act(async () => { await ctx().marcarLida('notif-1'); });
    await act(async () => { await ctx().marcarLida('notif-1'); });

    expect(ctx().totalNaoLidas).toBeGreaterThanOrEqual(0);
  });

  it('não altera outras notificações ao marcar uma como lida', async () => {
    const { ctx } = await renderProvider(FAKE_USER);

    await act(async () => { await ctx().marcarLida('notif-1'); });

    // NOTIF_B (notif-2) já estava lida, permanece lida
    const outra = ctx().notificacoes.find(n => n.id === 'notif-2')!;
    expect(outra.lida).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. marcarTodasLidas()
// ─────────────────────────────────────────────────────────────────────────────

describe('NotificacoesProvider — marcarTodasLidas()', () => {
  beforeEach(() => {
    mockNotifSvc.buscarNotificacoes.mockResolvedValue([NOTIF_A, NOTIF_B]);
    mockNotifSvc.contarNaoLidas.mockResolvedValue(1);
  });

  it('chama marcarTodasComoLidas com user.id', async () => {
    const { ctx } = await renderProvider(FAKE_USER);

    await act(async () => { await ctx().marcarTodasLidas(); });

    expect(mockNotifSvc.marcarTodasComoLidas).toHaveBeenCalledWith(FAKE_USER.id);
  });

  it('marca todas as notificações como lidas na lista local', async () => {
    const { ctx } = await renderProvider(FAKE_USER);

    await act(async () => { await ctx().marcarTodasLidas(); });

    expect(ctx().notificacoes.every(n => n.lida)).toBe(true);
  });

  it('zera totalNaoLidas', async () => {
    const { ctx } = await renderProvider(FAKE_USER);
    expect(ctx().totalNaoLidas).toBe(1);

    await act(async () => { await ctx().marcarTodasLidas(); });

    expect(ctx().totalNaoLidas).toBe(0);
  });

  it('mantém a lista de notificações (não limpa, só marca lida)', async () => {
    const { ctx } = await renderProvider(FAKE_USER);

    await act(async () => { await ctx().marcarTodasLidas(); });

    expect(ctx().notificacoes).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. Realtime — INSERT event
// ─────────────────────────────────────────────────────────────────────────────

describe('NotificacoesProvider — INSERT realtime', () => {
  beforeEach(() => {
    mockSupabaseMod.supabaseConfigured = true;
    mockNotifSvc.buscarNotificacoes.mockResolvedValue([NOTIF_A]);
    mockNotifSvc.contarNaoLidas.mockResolvedValue(1);
  });

  it('nova notificação é adicionada ao topo da lista', async () => {
    const channelMock = makeChannelMock();
    mockSupabaseMod.supabase.channel.mockReturnValue(channelMock);

    const { ctx } = await renderProvider(FAKE_USER);
    expect(capturedRealtimeCb).not.toBeNull();

    const novaNotif = makeNotif({ id: 'notif-nova', titulo: 'Nova em tempo real' });
    await act(() => {
      capturedRealtimeCb!({ new: novaNotif });
    });

    expect(ctx().notificacoes[0]).toEqual(novaNotif);
    expect(ctx().notificacoes[1]).toEqual(NOTIF_A);
  });

  it('totalNaoLidas é incrementado em 1 ao receber INSERT', async () => {
    const channelMock = makeChannelMock();
    mockSupabaseMod.supabase.channel.mockReturnValue(channelMock);

    const { ctx } = await renderProvider(FAKE_USER);
    const antes = ctx().totalNaoLidas; // 1

    const novaNotif = makeNotif({ id: 'notif-rt', titulo: 'Realtime' });
    await act(() => {
      capturedRealtimeCb!({ new: novaNotif });
    });

    expect(ctx().totalNaoLidas).toBe(antes + 1);
  });

  it('múltiplos INSERTs acumulam notificações no topo', async () => {
    const channelMock = makeChannelMock();
    mockSupabaseMod.supabase.channel.mockReturnValue(channelMock);

    const { ctx } = await renderProvider(FAKE_USER);

    const n1 = makeNotif({ id: 'rt-1', titulo: 'Primeira' });
    const n2 = makeNotif({ id: 'rt-2', titulo: 'Segunda' });

    await act(() => { capturedRealtimeCb!({ new: n1 }); });
    await act(() => { capturedRealtimeCb!({ new: n2 }); });

    expect(ctx().notificacoes[0]).toEqual(n2); // mais recente no topo
    expect(ctx().notificacoes[1]).toEqual(n1);
    expect(ctx().totalNaoLidas).toBe(3); // 1 inicial + 2 recebidas
  });
});
