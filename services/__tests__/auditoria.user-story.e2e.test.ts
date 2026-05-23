/**
 * services/__tests__/auditoria.user-story.e2e.test.ts
 *
 * Auditoria de user story — verifica a trilha de auditoria completa
 * para cada situação crítica do fluxo de autenticação:
 *
 *  US-1  Email cadastrado com sucesso
 *  US-2  Email não cadastrado (tentativa de login)
 *  US-3  Senha incorreta
 *  US-4  Email não encontrado (recuperação de senha)
 *
 * Estratégia:
 *  - auth.ts e auditoria.ts são carregados com isolateModules para
 *    garantir estado limpo a cada describe.
 *  - seguranca.ts é REAL (rateLimiter, validarSenha, sanitizador).
 *  - Supabase é mockado apenas para I/O externo.
 *  - auditoria.ts é REAL: as chamadas registrarAcao / registrarAcesso /
 *    registrarAnomalia / trackLoginFalha são verificadas via spyOn,
 *    garantindo que a trilha esteja correta sem depender de timers.
 *
 * Tabela de mapeamento esperada por situação:
 *
 *  Situação                │ registrarAcesso   │ registrarAcao (acao)      │ anomalia
 *  ────────────────────────┼───────────────────┼───────────────────────────┼─────────────────────
 *  Email cadastrado OK     │ 'cadastro'        │ 'cadastro'                │ —
 *  Email não cadastrado    │ 'login_falha'     │ 'login_falha'             │ após 5 falhas
 *  Senha incorreta         │ 'login_falha'     │ 'login_falha'             │ após 5 falhas
 *  Email não encontrado    │ —                 │ 'recuperacao_senha_falha' │ —
 *  (recuperação de senha)  │                   │                           │
 */

// ── Mocks de módulo (hoistados) ───────────────────────────────────────────────

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn(), openAuthSessionAsync: jest.fn() }));
jest.mock('expo-linking',     () => ({ createURL: jest.fn().mockReturnValue('agora://auth/callback') }));

jest.mock('@/services/email', () => ({
  emailService: { boasVindas: jest.fn(), senhaRedefinida: jest.fn() },
}));

// ── Tipagem dos módulos carregados ────────────────────────────────────────────

type AuthMod     = typeof import('@/services/auth');
type AuditoriaMod = typeof import('@/services/auditoria');

// ── Helpers ───────────────────────────────────────────────────────────────────

let _emailCounter = 0;
const uid = () => `us-user-${++_emailCounter}`;
const email = (n?: number) => `us_${n ?? _emailCounter}@agora.test`;

const VALID_REGISTER = {
  nome:       'Antônio',
  sobrenome:  'Oliveira',
  username:   'antonioo',
  email:      'antonio@agora.test',
  senha:      'Senha@123!',
  tipo_conta: 'pf' as const,
};

/** Supabase mínimo para o fluxo de registro bem-sucedido */
function buildRegisterOkMock(userId: string, userEmail: string) {
  return {
    auth: {
      signUp: jest.fn().mockResolvedValue({
        data: { user: { id: userId, email: userEmail, created_at: new Date().toISOString() } },
        error: null,
      }),
      getUser:  jest.fn().mockResolvedValue({ data: { user: { id: userId } } }),
      signInWithPassword: jest.fn(),
      signOut:  jest.fn().mockResolvedValue({}),
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      resetPasswordForEmail: jest.fn().mockResolvedValue({ error: null }),
      updateUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { nome: 'Antônio', tipo_conta: 'pf', verificado: false, username: 'antonioo', sobrenome: 'Oliveira' } }),
      insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      update: jest.fn().mockReturnThis(),
    }),
  };
}

/** Supabase mínimo para falha de login.
 *  anomaliaInsert fica exposto para que os testes possam inspecionar
 *  o que foi gravado em anomalia_log (trackLoginFalha → registrarAnomalia
 *  chama supabase internamente, fora do alcance do spyOn). */
function buildLoginFailMock(motivo: string) {
  const anomaliaInsert = jest.fn().mockResolvedValue({ data: null, error: null });
  const defaultBuilder = () => ({
    select: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null }),
    insert: jest.fn().mockResolvedValue({ data: null, error: null }),
    update: jest.fn().mockReturnThis(),
  });

  const mock = {
    auth: {
      signInWithPassword: jest.fn().mockResolvedValue({
        data: null,
        error: { message: motivo },
      }),
      getUser:  jest.fn().mockResolvedValue({ data: { user: null } }),
      signUp:   jest.fn(),
      signOut:  jest.fn().mockResolvedValue({}),
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      resetPasswordForEmail: jest.fn().mockResolvedValue({ error: null }),
      updateUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    from: jest.fn().mockImplementation((table: string) =>
      table === 'anomalia_log'
        ? { insert: anomaliaInsert }
        : defaultBuilder(),
    ),
    _anomaliaInsert: anomaliaInsert, // exposto para asserções
  };
  return mock;
}

/** Supabase mínimo para recuperação de senha com falha */
function buildRecoveryFailMock() {
  return {
    auth: {
      resetPasswordForEmail: jest.fn().mockResolvedValue({
        error: { message: 'User not found' },
      }),
      getUser:  jest.fn().mockResolvedValue({ data: { user: null } }),
      signInWithPassword: jest.fn(),
      signUp:   jest.fn(),
      signOut:  jest.fn().mockResolvedValue({}),
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      updateUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null }),
      insert: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  };
}

/**
 * Carrega auth + auditoria com isolamento de módulo e retorna
 * spies sobre as funções de auditoria reais.
 */
function loadIsolated(supabaseMock: any): {
  auth:      AuthMod['authService'];
  auditoria: AuditoriaMod;
  spyAcao:   any;
  spyAcesso: any;
  spyAnomalia: any;
} {
  let authService!:  AuthMod['authService'];
  let auditoriaMod!: AuditoriaMod;

  jest.isolateModules(() => {
    jest.doMock('@/services/supabase', () => ({
      supabaseConfigured: true,
      supabase: supabaseMock,
    }));
    authService  = require('@/services/auth').authService;
    auditoriaMod = require('@/services/auditoria');
  });

  const spyAcao     = jest.spyOn(auditoriaMod, 'registrarAcao');
  const spyAcesso   = jest.spyOn(auditoriaMod, 'registrarAcesso');
  const spyAnomalia = jest.spyOn(auditoriaMod, 'registrarAnomalia');

  return { auth: authService, auditoria: auditoriaMod, spyAcao, spyAcesso, spyAnomalia };
}

// ═════════════════════════════════════════════════════════════════════════════
// US-1 — EMAIL CADASTRADO COM SUCESSO
// ═════════════════════════════════════════════════════════════════════════════

describe('US-1 — Email cadastrado com sucesso', () => {
  const userId    = uid();
  const userEmail = email();
  let supabase: any;
  let auth: AuthMod['authService'];
  let spyAcao:   any;
  let spyAcesso: any;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllTimers();
    sessionStorage.clear();
    jest.clearAllMocks();
    supabase = buildRegisterOkMock(userId, userEmail);
    ({ auth, spyAcao, spyAcesso } = loadIsolated(supabase));

    // auth.register() contém `await new Promise(r => setTimeout(r, 500))`
    // (espera pelo trigger do banco). Com fake timers esse timer nunca dispara.
    // Envolve register para avançar os timers concorrentemente à execução real.
    const originalRegister = auth.register.bind(auth);
    (auth as any).register = async (...args: Parameters<typeof auth.register>) => {
      const [, result] = await Promise.all([
        jest.runAllTimersAsync(),
        originalRegister(...args),
      ]);
      return result;
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('US-1.1 — registrarAcesso é chamado com evento "cadastro" e userId correto', async () => {
    await auth.register({ ...VALID_REGISTER, email: userEmail });
    expect(spyAcesso).toHaveBeenCalledWith('cadastro', userId);
  });

  it('US-1.2 — registrarAcao é chamado com acao:"cadastro" e resultado:"sucesso"', async () => {
    await auth.register({ ...VALID_REGISTER, email: userEmail });
    expect(spyAcao).toHaveBeenCalledWith(
      expect.objectContaining({
        acao:      'cadastro',
        categoria: 'auth',
        resultado: 'sucesso',
      }),
    );
  });

  it('US-1.3 — tipo_conta está presente nos detalhes do audit', async () => {
    await auth.register({ ...VALID_REGISTER, email: userEmail, tipo_conta: 'pj', cnpj: '12345678000190' });
    expect(spyAcao).toHaveBeenCalledWith(
      expect.objectContaining({
        detalhes: expect.objectContaining({ tipo_conta: 'pj' }),
      }),
    );
  });

  it('US-1.4 — severidade é "info" (não gera alerta)', async () => {
    await auth.register({ ...VALID_REGISTER, email: userEmail });
    const chamada = spyAcao.mock.calls.find(
      ([p]: any[]) => p.acao === 'cadastro',
    );
    expect(chamada?.[0].severidade).toBe('info');
  });

  it('US-1.5 — NÃO gera registro de login_falha', async () => {
    await auth.register({ ...VALID_REGISTER, email: userEmail });
    const acaoChamadas = spyAcao.mock.calls.map(([p]: any[]) => p.acao);
    expect(acaoChamadas).not.toContain('login_falha');
  });

  it('US-1.6 — NÃO gera registro de cadastro_falha', async () => {
    await auth.register({ ...VALID_REGISTER, email: userEmail });
    const acaoChamadas = spyAcao.mock.calls.map(([p]: any[]) => p.acao);
    expect(acaoChamadas).not.toContain('cadastro_falha');
  });

  it('US-1.7 — falha no signUp gera "cadastro_falha" com resultado:"falha"', async () => {
    supabase.auth.signUp.mockResolvedValue({
      data: null,
      error: { message: 'Email already registered' },
    });

    try { await auth.register({ ...VALID_REGISTER, email: userEmail }); } catch {}

    expect(spyAcao).toHaveBeenCalledWith(
      expect.objectContaining({
        acao:      'cadastro_falha',
        resultado: 'falha',
        severidade: 'aviso',
      }),
    );
  });

  it('US-1.8 — falha no signUp registra motivo do erro nos detalhes', async () => {
    supabase.auth.signUp.mockResolvedValue({
      data: null,
      error: { message: 'Email already registered' },
    });

    try { await auth.register({ ...VALID_REGISTER, email: userEmail }); } catch {}

    expect(spyAcao).toHaveBeenCalledWith(
      expect.objectContaining({
        detalhes: expect.objectContaining({ motivo: 'Email already registered' }),
      }),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// US-2 — EMAIL NÃO CADASTRADO (login com e-mail desconhecido)
// ═════════════════════════════════════════════════════════════════════════════

describe('US-2 — Email não cadastrado (tentativa de login)', () => {
  const userEmail = `us2_${Date.now()}@agora.test`;
  let supabase: any;
  let auth: AuthMod['authService'];
  let spyAcao:   any;
  let spyAcesso: any;

  beforeEach(() => {
    sessionStorage.clear();
    jest.clearAllMocks();
    supabase = buildLoginFailMock('Invalid login credentials');
    ({ auth, spyAcao, spyAcesso } = loadIsolated(supabase));
  });

  afterEach(() => jest.restoreAllMocks());

  it('US-2.1 — registrarAcesso é chamado com "login_falha" (sem userId)', async () => {
    try { await auth.login(userEmail, 'qualquerSenha'); } catch {}
    expect(spyAcesso).toHaveBeenCalledWith('login_falha');
  });

  it('US-2.2 — registrarAcesso de "login_falha" não recebe userId', async () => {
    try { await auth.login(userEmail, 'qualquerSenha'); } catch {}
    const chamada = spyAcesso.mock.calls.find(([ev]: any[]) => ev === 'login_falha');
    expect(chamada).toHaveLength(1); // somente o evento, sem userId
  });

  it('US-2.3 — registrarAcao chamado com acao:"login_falha" e resultado:"falha"', async () => {
    try { await auth.login(userEmail, 'qualquerSenha'); } catch {}
    expect(spyAcao).toHaveBeenCalledWith(
      expect.objectContaining({
        acao:      'login_falha',
        categoria: 'auth',
        resultado: 'falha',
        severidade: 'aviso',
      }),
    );
  });

  it('US-2.4 — detalhes contêm email_hash mascarado (3 chars + ***)', async () => {
    try { await auth.login(userEmail, 'qualquerSenha'); } catch {}
    const chamada = spyAcao.mock.calls.find(([p]: any[]) => p.acao === 'login_falha');
    const emailHash = chamada?.[0].detalhes?.email_hash as string;

    expect(emailHash).toBeDefined();
    expect(emailHash).toMatch(/^.{3}\*{3}$/);
  });

  it('US-2.5 — detalhes contêm o motivo retornado pelo Supabase', async () => {
    try { await auth.login(userEmail, 'qualquerSenha'); } catch {}
    expect(spyAcao).toHaveBeenCalledWith(
      expect.objectContaining({
        detalhes: expect.objectContaining({ motivo: 'Invalid login credentials' }),
      }),
    );
  });

  it('US-2.6 — NÃO gera registro de login bem-sucedido', async () => {
    try { await auth.login(userEmail, 'qualquerSenha'); } catch {}
    const acoes = spyAcao.mock.calls.map(([p]: any[]) => p.acao);
    expect(acoes).not.toContain('login');
  });

  it('US-2.7 — 5 falhas consecutivas gravam anomalia "login_falha_repetida" em anomalia_log', async () => {
    for (let i = 0; i < 5; i++) {
      try { await auth.login(userEmail, 'errada'); } catch {}
    }
    // trackLoginFalha chama registrarAnomalia internamente (referência direta,
    // não pelo export), então verificamos o efeito no banco: anomalia_log.insert
    expect(supabase._anomaliaInsert).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'login_falha_repetida' }),
    );
  });

  it('US-2.8 — anomalia gravada em anomalia_log inclui email_hash mascarado e contagem de tentativas', async () => {
    for (let i = 0; i < 5; i++) {
      try { await auth.login(userEmail, 'errada'); } catch {}
    }
    const args = supabase._anomaliaInsert.mock.calls.find(
      ([p]: any[]) => p.tipo === 'login_falha_repetida',
    );
    expect(args?.[0].detalhes?.email_hash).toMatch(/^.{3}\*{3}$/);
    expect(args?.[0].detalhes?.tentativas).toBeGreaterThanOrEqual(5);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// US-3 — SENHA INCORRETA
// ═════════════════════════════════════════════════════════════════════════════

describe('US-3 — Senha incorreta', () => {
  // Supabase retorna o mesmo erro para "senha errada" e "email desconhecido"
  // (por segurança, a mensagem é idêntica). O que muda é o contexto semântico.
  const userEmail = `us3_${Date.now()}@agora.test`;
  let supabase: any;
  let auth: AuthMod['authService'];
  let spyAcao:   any;
  let spyAcesso: any;

  beforeEach(() => {
    sessionStorage.clear();
    jest.clearAllMocks();
    supabase = buildLoginFailMock('Invalid login credentials');
    ({ auth, spyAcao, spyAcesso } = loadIsolated(supabase));
  });

  afterEach(() => jest.restoreAllMocks());

  it('US-3.1 — registrarAcesso chamado com "login_falha"', async () => {
    try { await auth.login(userEmail, 'SenhaErrada!'); } catch {}
    expect(spyAcesso).toHaveBeenCalledWith('login_falha');
  });

  it('US-3.2 — registrarAcao chamado com acao:"login_falha" severidade:"aviso"', async () => {
    try { await auth.login(userEmail, 'SenhaErrada!'); } catch {}
    expect(spyAcao).toHaveBeenCalledWith(
      expect.objectContaining({
        acao:      'login_falha',
        severidade: 'aviso',
        resultado: 'falha',
      }),
    );
  });

  it('US-3.3 — o erro propagado ao chamador é o motivo do Supabase', async () => {
    await expect(auth.login(userEmail, 'SenhaErrada!')).rejects.toThrow(
      'Invalid login credentials',
    );
  });

  it('US-3.4 — 4 falhas ainda NÃO gravam em anomalia_log (limiar é 5)', async () => {
    for (let i = 0; i < 4; i++) {
      try { await auth.login(userEmail, 'errada'); } catch {}
    }
    expect(supabase._anomaliaInsert).not.toHaveBeenCalled();
  });

  it('US-3.5 — 5ª falha grava "login_falha_repetida" em anomalia_log', async () => {
    for (let i = 0; i < 5; i++) {
      try { await auth.login(userEmail, 'errada'); } catch {}
    }
    expect(supabase._anomaliaInsert).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'login_falha_repetida' }),
    );
  });

  it('US-3.6 — audit de falha nunca inclui a senha tentada nos detalhes', async () => {
    try { await auth.login(userEmail, 'MinhaSenh@123'); } catch {}
    const chamada = spyAcao.mock.calls.find(([p]: any[]) => p.acao === 'login_falha');
    const detalhesStr = JSON.stringify(chamada?.[0].detalhes ?? {});
    expect(detalhesStr).not.toContain('MinhaSenh@123');
  });

  it('US-3.7 — contador de falhas acumula mesmo após login bem-sucedido (sem reset automático)', async () => {
    // Comportamento documentado: _loginFalhas em auditoria.ts é um contador
    // acumulativo por e-mail. Um login bem-sucedido NÃO o zera — apenas
    // atingir o limiar (5) faz o reset, após registrar a anomalia.
    // Isso garante que sequências "3 erros → sucesso → 2 erros" ainda disparem.

    supabase.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' },
    });
    // 4 falhas — contador em 4, sem anomalia
    for (let i = 0; i < 4; i++) {
      try { await auth.login(userEmail, 'errada'); } catch {}
    }
    expect(supabase._anomaliaInsert).not.toHaveBeenCalled();

    // Login bem-sucedido — contador permanece em 4
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'uid-ok', email: userEmail, created_at: '' } },
      error: null,
    });
    await auth.login(userEmail, 'Senha@Correta1');

    // A 5ª falha (acumulada) dispara anomalia — confirma que não houve reset
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' },
    });
    try { await auth.login(userEmail, 'errada'); } catch {}

    expect(supabase._anomaliaInsert).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'login_falha_repetida' }),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// US-4 — EMAIL NÃO ENCONTRADO (recuperação de senha)
// ═════════════════════════════════════════════════════════════════════════════

describe('US-4 — Email não encontrado (recuperação de senha)', () => {
  const userEmail = `us4_${Date.now()}@agora.test`;
  let supabase: any;
  let auth: AuthMod['authService'];
  let spyAcao:   any;
  let spyAcesso: any;

  beforeEach(() => {
    sessionStorage.clear();
    jest.clearAllMocks();
    supabase = buildRecoveryFailMock();
    ({ auth, spyAcao, spyAcesso } = loadIsolated(supabase));
  });

  afterEach(() => jest.restoreAllMocks());

  it('US-4.1 — registrarAcao chamado com acao:"recuperacao_senha_falha"', async () => {
    try { await auth.recuperarSenha(userEmail); } catch {}
    expect(spyAcao).toHaveBeenCalledWith(
      expect.objectContaining({
        acao:      'recuperacao_senha_falha',
        categoria: 'auth',
        resultado: 'falha',
        severidade: 'aviso',
      }),
    );
  });

  it('US-4.2 — detalhes contêm email_hash mascarado', async () => {
    try { await auth.recuperarSenha(userEmail); } catch {}
    const chamada = spyAcao.mock.calls.find(
      ([p]: any[]) => p.acao === 'recuperacao_senha_falha',
    );
    const emailHash = chamada?.[0].detalhes?.email_hash as string;
    expect(emailHash).toBeDefined();
    expect(emailHash).toMatch(/^.{3}\*{3}$/);
  });

  it('US-4.3 — detalhes contêm o motivo do erro', async () => {
    try { await auth.recuperarSenha(userEmail); } catch {}
    expect(spyAcao).toHaveBeenCalledWith(
      expect.objectContaining({
        detalhes: expect.objectContaining({ motivo: 'User not found' }),
      }),
    );
  });

  it('US-4.4 — NÃO gera registrarAcesso (recuperação não é um acesso autenticado)', async () => {
    try { await auth.recuperarSenha(userEmail); } catch {}
    expect(spyAcesso).not.toHaveBeenCalled();
  });

  it('US-4.5 — o erro é propagado ao chamador', async () => {
    await expect(auth.recuperarSenha(userEmail)).rejects.toThrow('User not found');
  });

  it('US-4.6 — sucesso gera "recuperacao_senha_email_enviado" com resultado:"sucesso"', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    await auth.recuperarSenha(userEmail);
    expect(spyAcao).toHaveBeenCalledWith(
      expect.objectContaining({
        acao:      'recuperacao_senha_email_enviado',
        resultado: 'sucesso',
        severidade: 'info',
      }),
    );
  });

  it('US-4.7 — NÃO gera "login_falha" na recuperação de senha', async () => {
    try { await auth.recuperarSenha(userEmail); } catch {}
    const acoes = spyAcao.mock.calls.map(([p]: any[]) => p.acao);
    expect(acoes).not.toContain('login_falha');
  });
});
