/**
 * services/__tests__/auth.test.ts
 *
 * Suite de testes para auth.ts
 *
 * Módulos testados:
 *   setDemoTipoConta / getDemoTipoConta  — estado de sessão demo
 *   loginDemo()    — acesso rápido demo
 *   login()        — rate limit, falha, sucesso
 *   register()     — rate limit, senha fraca, sanitização, sucesso, falha
 *   recuperarSenha() — rate limit, sucesso, falha
 *   atualizarSenha() — senha fraca, sucesso, falha
 *   logout()       — demo + configurado
 *   getStoredUser() — demo com/sem sessão + configurado
 *   getProfile()   — demo (null) + supabase
 *
 * Estratégia:
 *   - jest.mock() no topo (inline jest.fn()) para todas as dependências
 *     não-supabase: react-native, expo-web-browser, expo-linking,
 *     seguranca, auditoria, email
 *   - jest.isolateModules() em beforeEach para obter módulo fresco com
 *     referência correta aos mocks que auth.ts realmente usa
 *   - sessionStorage limpo em beforeEach (disponível no jsdom)
 *
 * Princípios FIRST:
 *  Fast      — sem I/O real; todas as dependências mockadas
 *  Isolated  — isolateModules + sessionStorage.clear() por teste
 *  Repeatable — mocks determinísticos, sem aleatoriedade
 *  Self-validating — assertions explícitas
 *  Timely    — cobertura pré-produção de módulo crítico de segurança
 */

// ─── mocks de módulo (hoistados) ──────────────────────────────────────────────

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn().mockReturnValue('agora://auth/callback'),
}));

// Segurança — inline jest.fn() para evitar TDZ
jest.mock('@/services/seguranca', () => ({
  rateLimiter: {
    verificar:     jest.fn().mockReturnValue(true),
    tempoRestante: jest.fn().mockReturnValue(900),
    resetar:       jest.fn(),
  },
  validarSenha: jest.fn().mockReturnValue({
    valida: true, erros: [], forca: 'forte', pontuacao: 5,
  }),
  storageSeguro: {
    set:       jest.fn(),
    get:       jest.fn().mockReturnValue(null),
    remove:    jest.fn(),
    limparTudo: jest.fn(),
  },
  sanitizador: {
    objeto: jest.fn().mockImplementation((o: Record<string, any>) => o),
  },
}));

jest.mock('@/services/auditoria', () => ({
  registrarAcao:   jest.fn().mockResolvedValue(undefined),
  registrarAcesso: jest.fn().mockResolvedValue(undefined),
  trackLoginFalha: jest.fn(),
}));

jest.mock('@/services/email', () => ({
  emailService: {
    boasVindas:      jest.fn(),
    senhaRedefinida: jest.fn(),
  },
}));

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildSupabaseMock(overrides: Record<string, any> = {}) {
  const profileBuilder = () => ({
    select: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    insert: jest.fn().mockResolvedValue({ error: null }),
    update: jest.fn().mockReturnThis(),
  });

  return {
    auth: {
      signInWithPassword: jest.fn().mockResolvedValue({
        data: { user: { id: 'u-login', email: 'user@test.com', created_at: new Date().toISOString() } },
        error: null,
      }),
      signUp: jest.fn().mockResolvedValue({
        data: { user: { id: 'u-new', email: 'new@test.com' } },
        error: null,
      }),
      signOut:   jest.fn().mockResolvedValue({}),
      getUser:   jest.fn().mockResolvedValue({ data: { user: { id: 'u-1', email: 'u@test.com' } } }),
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      resetPasswordForEmail: jest.fn().mockResolvedValue({ error: null }),
      updateUser:            jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInWithOAuth:       jest.fn().mockResolvedValue({ data: { url: 'https://oauth.provider.com' }, error: null }),
      ...overrides.auth,
    },
    from: jest.fn().mockReturnValue(profileBuilder()),
    ...overrides,
  };
}

const VALID_REGISTER = {
  email:      'novo@agora.app',
  senha:      'Senha@123!',
  nome:       'Novo',
  sobrenome:  'Usuário',
  username:   'novousuario',
  tipo_conta: 'pf' as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// A. MODO DEMO — supabaseConfigured = false
// ─────────────────────────────────────────────────────────────────────────────
describe('authService — modo demo (supabaseConfigured = false)', () => {
  let authService: typeof import('@/services/auth')['authService'];
  let setDemoTipoConta: typeof import('@/services/auth')['setDemoTipoConta'];
  let getDemoTipoConta: typeof import('@/services/auth')['getDemoTipoConta'];
  let mockSeguranca: any;
  let mockAuditoria: any;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    sessionStorage.clear();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    jest.isolateModules(() => {
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: false,
        supabase: null,
      }));
      const mod = require('@/services/auth');
      authService       = mod.authService;
      setDemoTipoConta  = mod.setDemoTipoConta;
      getDemoTipoConta  = mod.getDemoTipoConta;
      mockSeguranca     = require('@/services/seguranca');
      mockAuditoria     = require('@/services/auditoria');
    });

    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => consoleSpy.mockRestore());

  // ── setDemoTipoConta / getDemoTipoConta ──
  describe('setDemoTipoConta() / getDemoTipoConta()', () => {
    it('getDemoTipoConta() retorna "pf" por padrão', () => {
      expect(getDemoTipoConta()).toBe('pf');
    });

    it('setDemoTipoConta("pj") altera o tipo retornado por getDemoTipoConta', () => {
      setDemoTipoConta('pj');
      expect(getDemoTipoConta()).toBe('pj');
    });

    it('setDemoTipoConta persiste em sessionStorage', () => {
      setDemoTipoConta('gov');
      expect(sessionStorage.getItem('agoraDemoTipo')).toBe('gov');
    });
  });

  // ── loginDemo ──
  describe('loginDemo()', () => {
    it('retorna User do tipo pf para loginDemo("pf")', async () => {
      const user = await authService.loginDemo('pf');
      expect(user.tipo_conta).toBe('pf');
      expect(typeof user.id).toBe('string');
      expect(typeof user.nome).toBe('string');
    });

    it('retorna User do tipo pj para loginDemo("pj")', async () => {
      const user = await authService.loginDemo('pj');
      expect(user.tipo_conta).toBe('pj');
    });

    it('retorna User do tipo gov para loginDemo("gov")', async () => {
      const user = await authService.loginDemo('gov');
      expect(user.tipo_conta).toBe('gov');
    });

    it('retorna User com todas as propriedades obrigatórias', async () => {
      const user = await authService.loginDemo('pf');
      expect(user.id).toBeDefined();
      expect(user.email).toBeDefined();
      expect(user.nome).toBeDefined();
      expect(user.sobrenome).toBeDefined();
      expect(user.username).toBeDefined();
      expect(typeof user.verificado).toBe('boolean');
      expect(user.criado_em).toBeDefined();
    });

    it('chama storageSeguro.set com "agoraDemoLoggedIn"', async () => {
      await authService.loginDemo('pf');
      expect(mockSeguranca.storageSeguro.set).toHaveBeenCalledWith(
        'agoraDemoLoggedIn', 'true',
      );
    });
  });

  // ── login ──
  describe('login()', () => {
    it('retorna User demo sem chamar supabase', async () => {
      const user = await authService.login('a@b.com', 'senha');
      expect(typeof user.id).toBe('string');
    });

    it('inclui email fornecido no User retornado', async () => {
      const user = await authService.login('custom@test.com', 'senha');
      expect(user.email).toBe('custom@test.com');
    });
  });

  // ── register ──
  describe('register()', () => {
    it('retorna User demo com os dados fornecidos', async () => {
      const user = await authService.register(VALID_REGISTER);
      expect(user.email).toBe(VALID_REGISTER.email);
      expect(user.nome).toBe(VALID_REGISTER.nome);
    });

    it('não valida senha em demo mode (validarSenha não chamado)', async () => {
      await authService.register(VALID_REGISTER);
      expect(mockSeguranca.validarSenha).not.toHaveBeenCalled();
    });
  });

  // ── recuperarSenha ──
  describe('recuperarSenha()', () => {
    it('resolve sem lançar e loga mensagem demo', async () => {
      await expect(authService.recuperarSenha('u@test.com')).resolves.toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('recuperação'), 'u@test.com',
      );
    });
  });

  // ── atualizarSenha ──
  describe('atualizarSenha()', () => {
    it('resolve sem lançar em demo mode', async () => {
      await expect(authService.atualizarSenha('NovaSenha@123')).resolves.toBeUndefined();
    });

    it('não valida senha em demo mode', async () => {
      await authService.atualizarSenha('qualquer');
      expect(mockSeguranca.validarSenha).not.toHaveBeenCalled();
    });
  });

  // ── logout ──
  describe('logout()', () => {
    it('chama storageSeguro.limparTudo() e resolve', async () => {
      await expect(authService.logout()).resolves.toBeUndefined();
      expect(mockSeguranca.storageSeguro.limparTudo).toHaveBeenCalled();
    });
  });

  // ── getStoredUser ──
  describe('getStoredUser()', () => {
    it('retorna null quando sessionStorage não tem agoraDemoLoggedIn', async () => {
      const user = await authService.getStoredUser();
      expect(user).toBeNull();
    });

    it('retorna User demo quando agoraDemoLoggedIn está definido', async () => {
      sessionStorage.setItem('agoraDemoLoggedIn', 'true');
      const user = await authService.getStoredUser();
      expect(user).not.toBeNull();
      expect(user?.tipo_conta).toBeDefined();
    });
  });

  // ── getProfile ──
  describe('getProfile()', () => {
    it('retorna null em demo mode', async () => {
      const profile = await authService.getProfile('any-id');
      expect(profile).toBeNull();
    });
  });

  // ── updateUser ──
  describe('updateUser()', () => {
    it('retorna User mesclado com as atualizações em demo mode', async () => {
      const user = await authService.updateUser('uid', { nome: 'Atualizado' });
      expect(user.nome).toBe('Atualizado');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. MODO CONFIGURADO — supabaseConfigured = true
// ─────────────────────────────────────────────────────────────────────────────
describe('authService — modo configurado (supabaseConfigured = true)', () => {
  let authService: typeof import('@/services/auth')['authService'];
  let mockSupabase: ReturnType<typeof buildSupabaseMock>;
  let mockSeguranca: any;
  let mockAuditoria: any;
  let mockEmail: any;

  beforeEach(() => {
    sessionStorage.clear();
    mockSupabase = buildSupabaseMock();

    jest.isolateModules(() => {
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: true,
        supabase: mockSupabase,
      }));
      authService   = require('@/services/auth').authService;
      mockSeguranca = require('@/services/seguranca');
      mockAuditoria = require('@/services/auditoria');
      mockEmail     = require('@/services/email');
    });

    // Defaults após isolamento
    mockSeguranca.rateLimiter.verificar.mockReturnValue(true);
    mockSeguranca.validarSenha.mockReturnValue({ valida: true, erros: [], forca: 'forte' });
    mockSeguranca.sanitizador.objeto.mockImplementation((o: any) => o);
  });

  afterEach(() => jest.restoreAllMocks());

  // ── login ──
  describe('login()', () => {
    it('lança RATE_LIMIT quando rateLimiter.verificar retorna false', async () => {
      mockSeguranca.rateLimiter.verificar.mockReturnValue(false);
      mockSeguranca.rateLimiter.tempoRestante.mockReturnValue(600);

      await expect(authService.login('u@test.com', 'senha')).rejects.toThrow('RATE_LIMIT:600');
    });

    it('chama trackLoginFalha e lança quando supabase retorna error', async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: null,
        error: { message: 'Invalid login credentials' },
      });

      await expect(authService.login('u@test.com', 'senha')).rejects.toThrow(
        'Invalid login credentials',
      );
      expect(mockAuditoria.trackLoginFalha).toHaveBeenCalledWith('u@test.com');
    });

    it('registrarAcao com "login_falha" quando supabase retorna error', async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: null, error: { message: 'Wrong password' },
      });
      try { await authService.login('u@test.com', 'senha'); } catch {}
      expect(mockAuditoria.registrarAcao).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'login_falha', resultado: 'falha' }),
      );
    });

    it('reseta rateLimiter após login bem-sucedido', async () => {
      // getProfile retorna null (chamado internamente)
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null }),
      });

      await authService.login('u@test.com', 'senha');
      expect(mockSeguranca.rateLimiter.resetar).toHaveBeenCalledWith('login', 'u@test.com');
    });

    it('retorna User mapeado após login bem-sucedido', async () => {
      const fakeProfile = { nome: 'João', sobrenome: 'Silva', username: 'joao', tipo_conta: 'pf', verificado: false };
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: fakeProfile }),
      });

      const user = await authService.login('u@test.com', 'Senha@123');
      expect(user.id).toBe('u-login');
      expect(user.email).toBe('user@test.com');
      expect(user.nome).toBe('João');
    });

    it('registrarAcao com "login" bem-sucedido', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null }),
      });
      await authService.login('u@test.com', 'senha');
      expect(mockAuditoria.registrarAcao).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'login', resultado: 'sucesso' }),
      );
    });
  });

  // ── register ──
  describe('register()', () => {
    it('lança RATE_LIMIT quando rateLimiter bloqueia cadastro', async () => {
      mockSeguranca.rateLimiter.verificar.mockReturnValue(false);
      mockSeguranca.rateLimiter.tempoRestante.mockReturnValue(300);

      await expect(authService.register(VALID_REGISTER)).rejects.toThrow('RATE_LIMIT:300');
    });

    it('lança SENHA_FRACA quando validarSenha retorna valida: false', async () => {
      mockSeguranca.validarSenha.mockReturnValue({
        valida: false,
        erros: ['Mínimo 8 caracteres', 'Precisa de maiúscula'],
        forca: 'fraca',
      });

      await expect(authService.register(VALID_REGISTER)).rejects.toThrow('SENHA_FRACA:');
    });

    it('mensagem de SENHA_FRACA contém os erros concatenados com |', async () => {
      mockSeguranca.validarSenha.mockReturnValue({
        valida: false,
        erros: ['Erro A', 'Erro B'],
        forca: 'fraca',
      });

      await expect(authService.register(VALID_REGISTER)).rejects.toThrow('Erro A|Erro B');
    });

    it('chama sanitizador.objeto com nome, sobrenome e username', async () => {
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null }),
      });

      await authService.register(VALID_REGISTER);

      expect(mockSeguranca.sanitizador.objeto).toHaveBeenCalledWith(
        expect.objectContaining({
          nome:      VALID_REGISTER.nome,
          sobrenome: VALID_REGISTER.sobrenome,
          username:  VALID_REGISTER.username,
        }),
      );
    });

    it('lança quando supabase.auth.signUp retorna error', async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: null, error: { message: 'Email already registered' },
      });

      await expect(authService.register(VALID_REGISTER)).rejects.toThrow(
        'Email already registered',
      );
    });

    it('lança quando profiles.insert retorna error', async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: { id: 'u-new', email: 'new@test.com' } }, error: null,
      });
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: { message: 'FK violation' } }),
      });

      await expect(authService.register(VALID_REGISTER)).rejects.toThrow('FK violation');
    });

    it('chama emailService.boasVindas após cadastro bem-sucedido', async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: { id: 'u-new', email: VALID_REGISTER.email } }, error: null,
      });
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      await authService.register(VALID_REGISTER);

      expect(mockEmail.emailService.boasVindas).toHaveBeenCalledWith(
        expect.objectContaining({ para: VALID_REGISTER.email }),
      );
    });

    it('retorna User mapeado após cadastro bem-sucedido', async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: { id: 'u-new', email: VALID_REGISTER.email } }, error: null,
      });
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      const user = await authService.register(VALID_REGISTER);
      expect(user.email).toBe(VALID_REGISTER.email);
      expect(user.nome).toBe(VALID_REGISTER.nome);
    });

    it('registrarAcao com "cadastro" bem-sucedido', async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: { id: 'u-new', email: VALID_REGISTER.email } }, error: null,
      });
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      await authService.register(VALID_REGISTER);
      expect(mockAuditoria.registrarAcao).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'cadastro', resultado: 'sucesso' }),
      );
    });
  });

  // ── recuperarSenha ──
  describe('recuperarSenha()', () => {
    it('lança RATE_LIMIT quando bloqueado', async () => {
      mockSeguranca.rateLimiter.verificar.mockReturnValue(false);
      mockSeguranca.rateLimiter.tempoRestante.mockReturnValue(120);

      await expect(authService.recuperarSenha('u@test.com')).rejects.toThrow('RATE_LIMIT:120');
    });

    it('lança quando supabase retorna error', async () => {
      mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
        error: { message: 'User not found' },
      });

      await expect(authService.recuperarSenha('u@test.com')).rejects.toThrow('User not found');
    });

    it('resolve sem lançar em caso de sucesso', async () => {
      await expect(authService.recuperarSenha('u@test.com')).resolves.toBeUndefined();
    });

    it('registrarAcao com "recuperacao_senha_email_enviado" após sucesso', async () => {
      await authService.recuperarSenha('u@test.com');
      expect(mockAuditoria.registrarAcao).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'recuperacao_senha_email_enviado', resultado: 'sucesso' }),
      );
    });
  });

  // ── atualizarSenha ──
  describe('atualizarSenha()', () => {
    it('lança SENHA_FRACA quando validarSenha retorna valida: false', async () => {
      mockSeguranca.validarSenha.mockReturnValue({
        valida: false, erros: ['Sem especial'], forca: 'fraca',
      });

      await expect(authService.atualizarSenha('fraca123')).rejects.toThrow('SENHA_FRACA:');
    });

    it('lança quando supabase.auth.updateUser retorna error', async () => {
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: null, error: { message: 'Session expired' },
      });

      await expect(authService.atualizarSenha('Senha@123!')).rejects.toThrow('Session expired');
    });

    it('resolve sem lançar em caso de sucesso', async () => {
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: { user: null }, error: null,
      });
      await expect(authService.atualizarSenha('Senha@123!')).resolves.toBeUndefined();
    });

    it('registrarAcao com "senha_atualizada" após sucesso', async () => {
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: { user: null }, error: null,
      });
      await authService.atualizarSenha('Senha@123!');
      expect(mockAuditoria.registrarAcao).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'senha_atualizada', resultado: 'sucesso' }),
      );
    });

    it('chama emailService.senhaRedefinida quando user.email está disponível', async () => {
      const profileFrom = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { nome: 'Teste' } }),
      };
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: { user: { id: 'u1', email: 'u@test.com' } }, error: null,
      });
      mockSupabase.from.mockReturnValue(profileFrom);

      await authService.atualizarSenha('Senha@123!');

      expect(mockEmail.emailService.senhaRedefinida).toHaveBeenCalledWith(
        expect.objectContaining({ para: 'u@test.com' }),
      );
    });
  });

  // ── logout ──
  describe('logout()', () => {
    it('chama supabase.auth.signOut()', async () => {
      await authService.logout();
      expect(mockSupabase.auth.signOut).toHaveBeenCalled();
    });

    it('registrarAcao com "logout" antes de signOut', async () => {
      await authService.logout();
      expect(mockAuditoria.registrarAcao).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'logout', resultado: 'sucesso' }),
      );
    });
  });

  // ── getStoredUser ──
  describe('getStoredUser()', () => {
    it('retorna null quando não há sessão ativa', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
      const user = await authService.getStoredUser();
      expect(user).toBeNull();
    });

    it('retorna User mapeado quando há sessão ativa', async () => {
      const fakeUser = { id: 'u-sess', email: 'sess@test.com', created_at: new Date().toISOString() };
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: fakeUser } },
      });
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { nome: 'Sess', sobrenome: 'User', username: 'sess', tipo_conta: 'pf', verificado: false } }),
      });

      const user = await authService.getStoredUser();
      expect(user?.id).toBe('u-sess');
      expect(user?.nome).toBe('Sess');
    });
  });

  // ── getProfile ──
  describe('getProfile()', () => {
    it('chama supabase.from("profiles").select.eq("id", uid).single()', async () => {
      const singleMock = jest.fn().mockResolvedValue({ data: { nome: 'Test' } });
      const eqMock     = jest.fn().mockReturnValue({ single: singleMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      mockSupabase.from.mockReturnValue({ select: selectMock });

      await authService.getProfile('uid-123');

      expect(mockSupabase.from).toHaveBeenCalledWith('profiles');
      expect(eqMock).toHaveBeenCalledWith('id', 'uid-123');
    });

    it('retorna data do perfil quando encontrado', async () => {
      const fakeProfile = { nome: 'Admin', tipo_conta: 'admin' };
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: fakeProfile }),
      });

      const profile = await authService.getProfile('uid-123');
      expect(profile).toEqual(fakeProfile);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. mapSupabaseUser — helper interno (testado via login)
// ─────────────────────────────────────────────────────────────────────────────
describe('mapSupabaseUser() — via authService.login()', () => {
  let authService: typeof import('@/services/auth')['authService'];
  let mockSupabase: ReturnType<typeof buildSupabaseMock>;

  beforeEach(() => {
    mockSupabase = buildSupabaseMock();
    jest.isolateModules(() => {
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: true,
        supabase: mockSupabase,
      }));
      authService = require('@/services/auth').authService;
    });
    const seg = require('@/services/seguranca');
    seg.rateLimiter.verificar.mockReturnValue(true);
  });

  it('mapeia supaUser.id → User.id', async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'id-mapped', email: 'x@y.com' } }, error: null,
    });
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { nome: 'N', sobrenome: 'S', username: 'u', tipo_conta: 'pf', verificado: false } }),
    });
    const user = await authService.login('x@y.com', 'pw');
    expect(user.id).toBe('id-mapped');
  });

  it('profile.nome/sobrenome/username sobrepõem defaults vazios', async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'u1', email: 'e@e.com' } }, error: null,
    });
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { nome: 'Clara', sobrenome: 'Dias', username: 'clarad', tipo_conta: 'pj', verificado: true },
      }),
    });
    const user = await authService.login('e@e.com', 'pw');
    expect(user.nome).toBe('Clara');
    expect(user.sobrenome).toBe('Dias');
    expect(user.tipo_conta).toBe('pj');
    expect(user.verificado).toBe(true);
  });

  it('profile null → campos ficam com valores vazios/default', async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'u2', email: 'e2@e.com' } }, error: null,
    });
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null }),
    });
    const user = await authService.login('e2@e.com', 'pw');
    expect(user.nome).toBe('');
    expect(user.tipo_conta).toBe('pf');
    expect(user.verificado).toBe(false);
  });
});
