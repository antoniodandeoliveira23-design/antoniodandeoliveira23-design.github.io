/**
 * contexts/__tests__/AuthContext.test.tsx
 *
 * Testes do AuthProvider e useAuth:
 *  - Estado inicial (user, loading, signed)
 *  - login / loginDemo / loginSocial / register
 *  - logout / updateUser / recuperarSenha / atualizarSenha
 *  - onAuthStateChange — SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, cleanup
 *
 * Estratégia:
 *  - react-test-renderer v19 + act() para renderizar o provider em memória
 *  - Uma única instância de React (import estático) — evita o erro
 *    "multiple copies of React" causado por isolateModules com hooks
 *  - @/services/supabase mockado com propriedades mutáveis: cada describe
 *    ajusta mockSupabaseMod.supabaseConfigured antes de renderizar
 *  - beforeEach global resseta todas as implementações de forma previsível
 */

import React from 'react';
import { create, act } from 'react-test-renderer';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

// ── Mocks de módulo (hoistados pelo Babel) ──────────────────────────────────

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

// Mock de authService com implementações padrão que são substituídas em beforeEach
jest.mock('@/services/auth', () => ({
  authService: {
    getStoredUser:  jest.fn(),
    getProfile:     jest.fn(),
    login:          jest.fn(),
    loginDemo:      jest.fn(),
    loginSocial:    jest.fn(),
    register:       jest.fn(),
    logout:         jest.fn(),
    updateUser:     jest.fn(),
    recuperarSenha: jest.fn(),
    atualizarSenha: jest.fn(),
  },
}));

jest.mock('@/services/doisFA', () => ({
  doisFA: { resetar: jest.fn() },
}));

// supabase mock com propriedades mutáveis: controlamos supabaseConfigured e
// onAuthStateChange por describe sem precisar de isolateModules
jest.mock('@/services/supabase', () => ({
  supabaseConfigured: false,          // mutado por beforeEach de cada describe
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(),   // implementação configurada em beforeEach
    },
  },
}));

// ── Dados de teste ──────────────────────────────────────────────────────────

const FAKE_USER = {
  id:           'u-test',
  email:        'test@agora.app',
  nome:         'Teste',
  sobrenome:    'Silva',
  username:     'testesilva',
  tipo_conta:   'pf' as const,
  verificado:   false,
  criado_em:    '2024-01-01T00:00:00Z',
  atualizado_em:'2024-01-01T00:00:00Z',
};

const REGISTER_DATA = {
  nome:       'Novo',
  sobrenome:  'Usuário',
  username:   'novousuario',
  email:      'novo@agora.app',
  senha:      'Senha@123!',
  tipo_conta: 'pf' as const,
};

const FAKE_PROFILE = {
  nome:         'Auth',
  sobrenome:    'User',
  username:     'authuser',
  tipo_conta:   'pf',
  verificado:   false,
  criado_em:    '2024-01-01T00:00:00Z',
  atualizado_em:'2024-01-01T00:00:00Z',
};

// ── Referências globais para mocks (preenchidas em beforeEach) ──────────────

let mockAuthSvc: any;
let mockDoisFA: any;
let mockSupabaseMod: any;
let mockOnAuthStateChange: jest.Mock;
let mockUnsubscribe: jest.Mock;
let capturedAuthCb: ((event: string, session: any) => void) | null;

beforeEach(() => {
  mockAuthSvc     = (require('@/services/auth') as any).authService;
  mockDoisFA      = (require('@/services/doisFA') as any).doisFA;
  mockSupabaseMod = require('@/services/supabase') as any;
  mockOnAuthStateChange = mockSupabaseMod.supabase.auth.onAuthStateChange as jest.Mock;

  // Unsubscribe fresco para cada teste
  mockUnsubscribe = jest.fn();
  capturedAuthCb  = null;

  // Captura o callback de onAuthStateChange quando chamado pelo provider
  mockOnAuthStateChange.mockImplementation((cb: any) => {
    capturedAuthCb = cb;
    return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
  });

  // Por padrão: supabase NÃO configurado (sem subscription)
  mockSupabaseMod.supabaseConfigured = false;

  // Implementações padrão de authService
  mockAuthSvc.getStoredUser.mockResolvedValue(null);
  mockAuthSvc.getProfile.mockResolvedValue(null);
  mockAuthSvc.login.mockResolvedValue(FAKE_USER);
  mockAuthSvc.loginDemo.mockResolvedValue(FAKE_USER);
  mockAuthSvc.loginSocial.mockResolvedValue(FAKE_USER);
  mockAuthSvc.register.mockResolvedValue(FAKE_USER);
  mockAuthSvc.logout.mockResolvedValue(undefined);
  mockAuthSvc.updateUser.mockResolvedValue(FAKE_USER);
  mockAuthSvc.recuperarSenha.mockResolvedValue(undefined);
  mockAuthSvc.atualizarSenha.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.clearAllMocks();
});

// ── Helper: renderiza o provider e mantém ctx sempre atualizado ─────────────

async function renderProvider() {
  const captured = { ctx: null as ReturnType<typeof useAuth> | null };

  function Consumer() {
    captured.ctx = useAuth();
    return null;
  }

  let renderer: any;
  await act(async () => {
    renderer = create(
      React.createElement(AuthProvider, null,
        React.createElement(Consumer, null),
      ),
    );
  });

  return {
    renderer,
    /** Retorna o contexto mais recente (atualizado a cada re-render do Consumer) */
    ctx: (): ReturnType<typeof useAuth> => captured.ctx!,
    /** Dispara evento como se viesse do onAuthStateChange do Supabase */
    fire: (event: string, session?: any) => capturedAuthCb?.(event, session ?? null),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Estado inicial
// ─────────────────────────────────────────────────────────────────────────────

describe('AuthProvider — estado inicial', () => {
  it('user é null quando getStoredUser retorna null', async () => {
    const { ctx } = await renderProvider();
    expect(ctx().user).toBeNull();
  });

  it('signed é false quando user é null', async () => {
    const { ctx } = await renderProvider();
    expect(ctx().signed).toBe(false);
  });

  it('loading fica false após getStoredUser resolver', async () => {
    const { ctx } = await renderProvider();
    expect(ctx().loading).toBe(false);
  });

  it('user é preenchido quando getStoredUser retorna um User', async () => {
    mockAuthSvc.getStoredUser.mockResolvedValue(FAKE_USER);
    const { ctx } = await renderProvider();
    expect(ctx().user).toEqual(FAKE_USER);
  });

  it('signed é true quando getStoredUser retorna um User', async () => {
    mockAuthSvc.getStoredUser.mockResolvedValue(FAKE_USER);
    const { ctx } = await renderProvider();
    expect(ctx().signed).toBe(true);
  });

  it('loading fica false mesmo quando getStoredUser lança erro', async () => {
    mockAuthSvc.getStoredUser.mockRejectedValue(new Error('Storage indisponível'));
    const { ctx } = await renderProvider();
    expect(ctx().loading).toBe(false);
    expect(ctx().user).toBeNull();
  });

  it('expõe todas as funções de autenticação no contexto', async () => {
    const { ctx } = await renderProvider();
    const c = ctx();
    ['login','loginDemo','loginSocial','register','logout',
     'updateUser','recuperarSenha','atualizarSenha'].forEach(fn => {
      expect(typeof (c as any)[fn]).toBe('function');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. login()
// ─────────────────────────────────────────────────────────────────────────────

describe('AuthProvider — login()', () => {
  it('chama authService.login com email e senha corretos', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().login('test@agora.app', 'Senha@123'); });

    expect(mockAuthSvc.login).toHaveBeenCalledWith('test@agora.app', 'Senha@123');
  });

  it('user e signed são atualizados após login bem-sucedido', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().login('test@agora.app', 'senha'); });

    expect(ctx().user).toEqual(FAKE_USER);
    expect(ctx().signed).toBe(true);
  });

  it('loading volta para false após login bem-sucedido', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().login('test@agora.app', 'senha'); });

    expect(ctx().loading).toBe(false);
  });

  it('loading volta para false quando login lança erro', async () => {
    mockAuthSvc.login.mockRejectedValue(new Error('Credenciais inválidas'));
    const { ctx } = await renderProvider();

    await act(async () => {
      try { await ctx().login('bad@agora.app', 'errada'); } catch {}
    });

    expect(ctx().loading).toBe(false);
  });

  it('propaga o erro quando authService.login lança', async () => {
    mockAuthSvc.login.mockRejectedValue(new Error('RATE_LIMIT:600'));
    const { ctx } = await renderProvider();

    let caught: Error | null = null;
    await act(async () => {
      try { await ctx().login('u@agora.app', 'senha'); } catch (e) { caught = e as Error; }
    });

    expect(caught?.message).toContain('RATE_LIMIT');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. loginDemo()
// ─────────────────────────────────────────────────────────────────────────────

describe('AuthProvider — loginDemo()', () => {
  it('chama authService.loginDemo com o tipo correto', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().loginDemo('pj'); });

    expect(mockAuthSvc.loginDemo).toHaveBeenCalledWith('pj');
  });

  it('user é atualizado com o resultado de loginDemo', async () => {
    const demoUser = { ...FAKE_USER, tipo_conta: 'pj' as const };
    mockAuthSvc.loginDemo.mockResolvedValue(demoUser);
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().loginDemo('pj'); });

    expect(ctx().user).toEqual(demoUser);
    expect(ctx().signed).toBe(true);
  });

  it('loading volta para false após loginDemo', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().loginDemo('gov'); });

    expect(ctx().loading).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. loginSocial()
// ─────────────────────────────────────────────────────────────────────────────

describe('AuthProvider — loginSocial()', () => {
  it('chama authService.loginSocial com o provider correto', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().loginSocial('google'); });

    expect(mockAuthSvc.loginSocial).toHaveBeenCalledWith('google');
  });

  it('user é atualizado quando loggedUser tem id não-demo', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().loginSocial('apple'); });

    expect(ctx().user).toEqual(FAKE_USER);
  });

  it('user NÃO é atualizado quando loginSocial retorna null (redirect web)', async () => {
    mockAuthSvc.loginSocial.mockResolvedValue(null);
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().loginSocial('google'); });

    expect(ctx().user).toBeNull();
  });

  it('user NÃO é atualizado quando loggedUser.id começa com "demo-"', async () => {
    mockAuthSvc.loginSocial.mockResolvedValue({ ...FAKE_USER, id: 'demo-pf' });
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().loginSocial('x'); });

    expect(ctx().user).toBeNull();
  });

  it('loading volta para false após loginSocial', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().loginSocial('google'); });

    expect(ctx().loading).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. register()
// ─────────────────────────────────────────────────────────────────────────────

describe('AuthProvider — register()', () => {
  it('chama authService.register com os dados fornecidos', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().register(REGISTER_DATA); });

    expect(mockAuthSvc.register).toHaveBeenCalledWith(REGISTER_DATA);
  });

  it('user é atualizado após cadastro bem-sucedido', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().register(REGISTER_DATA); });

    expect(ctx().user).toEqual(FAKE_USER);
    expect(ctx().signed).toBe(true);
  });

  it('loading volta para false após register', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().register(REGISTER_DATA); });

    expect(ctx().loading).toBe(false);
  });

  it('loading volta para false mesmo quando register lança', async () => {
    mockAuthSvc.register.mockRejectedValue(new Error('SENHA_FRACA:Sem especial'));
    const { ctx } = await renderProvider();

    await act(async () => {
      try { await ctx().register(REGISTER_DATA); } catch {}
    });

    expect(ctx().loading).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. logout()
// ─────────────────────────────────────────────────────────────────────────────

describe('AuthProvider — logout()', () => {
  beforeEach(() => {
    mockAuthSvc.getStoredUser.mockResolvedValue(FAKE_USER);
  });

  it('chama authService.logout()', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().logout(); });

    expect(mockAuthSvc.logout).toHaveBeenCalled();
  });

  it('chama doisFA.resetar() ao sair', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().logout(); });

    expect(mockDoisFA.resetar).toHaveBeenCalled();
  });

  it('user fica null e signed fica false após logout', async () => {
    const { ctx } = await renderProvider();
    expect(ctx().user).toEqual(FAKE_USER);   // confirma que user estava preenchido

    await act(async () => { await ctx().logout(); });

    expect(ctx().user).toBeNull();
    expect(ctx().signed).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. updateUser()
// ─────────────────────────────────────────────────────────────────────────────

describe('AuthProvider — updateUser()', () => {
  it('não chama authService.updateUser quando user é null', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().updateUser({ nome: 'Novo' }); });

    expect(mockAuthSvc.updateUser).not.toHaveBeenCalled();
  });

  it('chama authService.updateUser com user.id e os dados corretos', async () => {
    mockAuthSvc.getStoredUser.mockResolvedValue(FAKE_USER);
    mockAuthSvc.updateUser.mockResolvedValue({ ...FAKE_USER, nome: 'Atualizado' });
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().updateUser({ nome: 'Atualizado' }); });

    expect(mockAuthSvc.updateUser).toHaveBeenCalledWith(FAKE_USER.id, { nome: 'Atualizado' });
  });

  it('user é atualizado com o resultado de updateUser', async () => {
    mockAuthSvc.getStoredUser.mockResolvedValue(FAKE_USER);
    const updated = { ...FAKE_USER, nome: 'Novo Nome' };
    mockAuthSvc.updateUser.mockResolvedValue(updated);
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().updateUser({ nome: 'Novo Nome' }); });

    expect(ctx().user?.nome).toBe('Novo Nome');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H. recuperarSenha()
// ─────────────────────────────────────────────────────────────────────────────

describe('AuthProvider — recuperarSenha()', () => {
  it('chama authService.recuperarSenha com o email correto', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().recuperarSenha('user@agora.app'); });

    expect(mockAuthSvc.recuperarSenha).toHaveBeenCalledWith('user@agora.app');
  });

  it('resolve sem lançar quando recuperarSenha bem-sucedida', async () => {
    const { ctx } = await renderProvider();

    await expect(
      act(async () => { await ctx().recuperarSenha('u@test.com'); })
    ).resolves.not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I. atualizarSenha()
// ─────────────────────────────────────────────────────────────────────────────

describe('AuthProvider — atualizarSenha()', () => {
  it('chama authService.atualizarSenha com a nova senha', async () => {
    const { ctx } = await renderProvider();

    await act(async () => { await ctx().atualizarSenha('Senha@Nova1!'); });

    expect(mockAuthSvc.atualizarSenha).toHaveBeenCalledWith('Senha@Nova1!');
  });

  it('resolve sem lançar quando atualizarSenha bem-sucedida', async () => {
    const { ctx } = await renderProvider();

    await expect(
      act(async () => { await ctx().atualizarSenha('Forte@123!'); })
    ).resolves.not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// J. onAuthStateChange (supabaseConfigured = true)
// ─────────────────────────────────────────────────────────────────────────────

describe('AuthProvider — onAuthStateChange (supabaseConfigured = true)', () => {
  beforeEach(() => {
    mockSupabaseMod.supabaseConfigured = true;
    mockAuthSvc.getProfile.mockResolvedValue(FAKE_PROFILE);
  });

  it('registra onAuthStateChange ao montar', async () => {
    await renderProvider();
    expect(mockOnAuthStateChange).toHaveBeenCalled();
  });

  it('chama subscription.unsubscribe ao desmontar o provider', async () => {
    const { renderer } = await renderProvider();

    await act(async () => { renderer.unmount(); });

    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('SIGNED_IN → chama getProfile e popula user quando user era null', async () => {
    const { ctx, fire } = await renderProvider();
    expect(ctx().user).toBeNull();

    await act(async () => {
      fire('SIGNED_IN', {
        user: {
          id: 'u-oauth',
          email: 'oauth@agora.app',
          created_at: '2024-01-01T00:00:00Z',
          user_metadata: {},
        },
      });
      // flush microtasks do handler assíncrono
      await new Promise(r => setTimeout(r, 0));
    });

    expect(mockAuthSvc.getProfile).toHaveBeenCalledWith('u-oauth');
    expect(ctx().user?.id).toBe('u-oauth');
    expect(ctx().user?.nome).toBe(FAKE_PROFILE.nome);
  });

  it('SIGNED_IN → chama getProfile mesmo com usuário existente (closure estática)', async () => {
    // O guard "if (user) return" usa a closure do useEffect([]) que captura
    // user = null no momento da montagem. getStoredUser resolve depois,
    // mas a closure não atualiza — getProfile é chamado mesmo assim.
    // O mecanismo de proteção real contra duplicação é _suppressAuthChange (useRef).
    mockAuthSvc.getStoredUser.mockResolvedValue(FAKE_USER);
    const newProfile = { ...FAKE_PROFILE, nome: 'Outro' };
    mockAuthSvc.getProfile.mockResolvedValue(newProfile);
    const { ctx, fire } = await renderProvider();
    expect(ctx().user).toEqual(FAKE_USER);

    await act(async () => {
      fire('SIGNED_IN', {
        user: {
          id: 'outro-user',
          email: 'outro@agora.app',
          created_at: '2024-01-01T00:00:00Z',
          user_metadata: {},
        },
      });
      await new Promise(r => setTimeout(r, 0));
    });

    // getProfile É chamado (closure estática com user = null não bloqueia)
    expect(mockAuthSvc.getProfile).toHaveBeenCalledWith('outro-user');
  });

  it('SIGNED_OUT → seta user null e signed false', async () => {
    mockAuthSvc.getStoredUser.mockResolvedValue(FAKE_USER);
    const { ctx, fire } = await renderProvider();
    expect(ctx().user).toEqual(FAKE_USER);

    await act(async () => {
      fire('SIGNED_OUT', null);
    });

    expect(ctx().user).toBeNull();
    expect(ctx().signed).toBe(false);
    expect(ctx().loading).toBe(false);
  });

  it('TOKEN_REFRESHED → chama getProfile e popula user quando user era null', async () => {
    const { ctx, fire } = await renderProvider();

    await act(async () => {
      fire('TOKEN_REFRESHED', {
        user: {
          id: 'u-refresh',
          email: 'refresh@agora.app',
          created_at: '2024-01-01T00:00:00Z',
          user_metadata: {},
        },
      });
      await new Promise(r => setTimeout(r, 0));
    });

    expect(ctx().user?.id).toBe('u-refresh');
  });

  it('evento desconhecido não altera user nem signed', async () => {
    const { ctx, fire } = await renderProvider();

    await act(async () => {
      fire('UNKNOWN_EVENT', null);
    });

    expect(ctx().user).toBeNull();
    expect(ctx().signed).toBe(false);
  });

  it('_suppressAuthChange bloqueia SIGNED_IN enquanto login está em progresso', async () => {
    // login() seta _suppressAuthChange = true antes de chamar authService.login
    // e o reseta no finally — eventos durante essa janela devem ser ignorados
    let resolveLogin!: (u: any) => void;
    mockAuthSvc.login.mockReturnValue(new Promise(res => { resolveLogin = res; }));

    const { ctx, fire } = await renderProvider();

    // Inicia login sem aguardar
    let loginPromise: Promise<void>;
    act(() => { loginPromise = ctx().login('u@agora.app', 'senha'); });

    // Dispara SIGNED_IN enquanto suppress está ativo
    const callsBefore = mockAuthSvc.getProfile.mock.calls.length;
    fire('SIGNED_IN', {
      user: { id: 'u-concurrent', email: 'c@test.com', created_at: '2024-01-01T00:00:00Z' },
    });

    // Resolve o login
    await act(async () => {
      resolveLogin(FAKE_USER);
      await loginPromise!;
    });

    // getProfile NÃO foi chamado pelo SIGNED_IN suprimido
    expect(mockAuthSvc.getProfile.mock.calls.length).toBe(callsBefore);
    // user vem do login, não do evento ignorado
    expect(ctx().user).toEqual(FAKE_USER);
  });
});
