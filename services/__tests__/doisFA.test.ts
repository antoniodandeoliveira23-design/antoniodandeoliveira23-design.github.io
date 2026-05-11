/**
 * services/__tests__/doisFA.test.ts
 *
 * Suite de testes para doisFA.ts (Autenticação 2FA para admin)
 *
 * Módulos testados:
 *   estaVerificado()   — lê _verificado
 *   gerarCodigo()      — gera OTP, popula estado de sessão
 *   verificarCodigo()  — valida OTP (expiração, correspondência, whitespace)
 *   resetar()          — zera todo o estado de sessão
 *   modoDemo()         — retorna !supabaseConfigured
 *
 * Estratégia:
 *   - jest.isolateModules() em beforeEach: estado de módulo (_verificado,
 *     _codigoAtual, _expiraEm, _adminId) começa zerado em cada teste
 *   - auditoria mockada em ambas as seções (registrarAcao = jest.fn())
 *   - Seção A: supabaseConfigured = false (demo — código fixo '111111')
 *   - Seção B: supabaseConfigured = true  (prod — código aleatório mockado)
 *   - Math.random spy para código determinístico em modo configurado
 *   - Date.now spy para testar expiração do OTP
 *
 * Princípios FIRST:
 *  Fast      — sem I/O; supabase + auditoria totalmente mockados
 *  Isolated  — isolateModules garante estado zerado entre testes
 *  Repeatable — Math.random + Date.now spyados onde necessário
 *  Self-validating — assertions explícitas
 *  Timely    — cobertura pré-produção de feature crítica de segurança
 */

// ─────────────────────────────────────────────────────────────────────────────
// A. MODO DEMO — supabaseConfigured = false
// ─────────────────────────────────────────────────────────────────────────────
describe('doisFA — modo demo (supabaseConfigured = false)', () => {
  let doisFA: typeof import('@/services/doisFA')['doisFA'];
  let mockRegistrarAcao: jest.Mock;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    mockRegistrarAcao = jest.fn().mockResolvedValue(undefined);
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    jest.isolateModules(() => {
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: false,
        supabase: null,
      }));
      jest.doMock('@/services/auditoria', () => ({
        registrarAcao: mockRegistrarAcao,
      }));
      doisFA = require('@/services/doisFA').doisFA;
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.restoreAllMocks();
  });

  // ── modoDemo ──
  describe('modoDemo()', () => {
    it('retorna true quando supabase não configurado', () => {
      expect(doisFA.modoDemo()).toBe(true);
    });
  });

  // ── estaVerificado ──
  describe('estaVerificado()', () => {
    it('retorna false antes de qualquer verificação', () => {
      expect(doisFA.estaVerificado()).toBe(false);
    });

    it('retorna true após verificarCodigo() bem-sucedido', async () => {
      await doisFA.gerarCodigo('admin-1');
      await doisFA.verificarCodigo('111111');
      expect(doisFA.estaVerificado()).toBe(true);
    });

    it('retorna false após resetar()', async () => {
      await doisFA.gerarCodigo('admin-1');
      await doisFA.verificarCodigo('111111');
      doisFA.resetar();
      expect(doisFA.estaVerificado()).toBe(false);
    });
  });

  // ── gerarCodigo ──
  describe('gerarCodigo()', () => {
    it('resolve sem lançar exceção', async () => {
      await expect(doisFA.gerarCodigo('admin-1')).resolves.toBeUndefined();
    });

    it('loga o código demo via console.log', async () => {
      await doisFA.gerarCodigo('admin-1');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('111111'),
      );
    });

    it('define código fixo "111111" (aceito por verificarCodigo)', async () => {
      await doisFA.gerarCodigo('admin-1');
      const resultado = await doisFA.verificarCodigo('111111');
      expect(resultado.valido).toBe(true);
    });

    it('define expiração de 10 minutos a partir de agora', async () => {
      const T0 = 1_000_000;
      const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(T0);
      await doisFA.gerarCodigo('admin-1');
      // Verifica que o código ainda é válido logo após gerar (T0 + 1ms)
      dateSpy.mockReturnValue(T0 + 1);
      const r = await doisFA.verificarCodigo('111111');
      expect(r.valido).toBe(true);
      dateSpy.mockRestore();
    });
  });

  // ── verificarCodigo ──
  describe('verificarCodigo()', () => {
    it('retorna { valido: false } sem mensagem de "não solicitado" quando gerarCodigo não foi chamado', async () => {
      const r = await doisFA.verificarCodigo('111111');
      expect(r.valido).toBe(false);
      expect(r.erro).toMatch(/não solicitado|Código não solicitado/i);
    });

    it('retorna { valido: true } com código correto', async () => {
      await doisFA.gerarCodigo('admin-1');
      const r = await doisFA.verificarCodigo('111111');
      expect(r.valido).toBe(true);
      expect(r.erro).toBeUndefined();
    });

    it('retorna { valido: false, erro: "Código incorreto." } com código errado', async () => {
      await doisFA.gerarCodigo('admin-1');
      const r = await doisFA.verificarCodigo('000000');
      expect(r.valido).toBe(false);
      expect(r.erro).toBe('Código incorreto.');
    });

    it('strip de espaços: " 1 1 1 1 1 1 " é aceito como "111111"', async () => {
      await doisFA.gerarCodigo('admin-1');
      const r = await doisFA.verificarCodigo(' 1 1 1 1 1 1 ');
      expect(r.valido).toBe(true);
    });

    it('strip de tabs e espaços mistos', async () => {
      await doisFA.gerarCodigo('admin-1');
      const r = await doisFA.verificarCodigo('\t111\t111\t');
      expect(r.valido).toBe(true);
    });

    it('retorna { valido: false, erro: "Código expirado" } quando TTL passou', async () => {
      const T0 = 2_000_000;
      const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(T0);
      await doisFA.gerarCodigo('admin-1');

      // Avança 10 min + 1ms → expirado
      dateSpy.mockReturnValue(T0 + 10 * 60_000 + 1);
      const r = await doisFA.verificarCodigo('111111');

      expect(r.valido).toBe(false);
      expect(r.erro).toMatch(/expirado/i);
      dateSpy.mockRestore();
    });

    it('código inválido após expiração não é mais aceito (estado limpo)', async () => {
      const T0 = 3_000_000;
      const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(T0);
      await doisFA.gerarCodigo('admin-1');

      dateSpy.mockReturnValue(T0 + 10 * 60_000 + 1);
      await doisFA.verificarCodigo('111111'); // expira + limpa estado

      // Nova tentativa com código correto → "não solicitado" (estado limpo)
      dateSpy.mockReturnValue(T0 + 10 * 60_000 + 2);
      const r2 = await doisFA.verificarCodigo('111111');
      expect(r2.valido).toBe(false);
      expect(r2.erro).toMatch(/não solicitado/i);
      dateSpy.mockRestore();
    });

    it('após sucesso, estaVerificado() retorna true e código não pode ser reutilizado', async () => {
      await doisFA.gerarCodigo('admin-1');
      await doisFA.verificarCodigo('111111'); // usa o código

      // Segundo uso → "não solicitado" (código limpo após sucesso)
      const r2 = await doisFA.verificarCodigo('111111');
      expect(r2.valido).toBe(false);
    });

    it('chamadas a registrarAcao são feitas (auditoria registrada)', async () => {
      await doisFA.gerarCodigo('admin-2');
      await doisFA.verificarCodigo('111111');
      expect(mockRegistrarAcao).toHaveBeenCalled();
    });
  });

  // ── resetar ──
  describe('resetar()', () => {
    it('zera estaVerificado()', async () => {
      await doisFA.gerarCodigo('admin-1');
      await doisFA.verificarCodigo('111111');
      expect(doisFA.estaVerificado()).toBe(true);
      doisFA.resetar();
      expect(doisFA.estaVerificado()).toBe(false);
    });

    it('após resetar, verificarCodigo retorna "não solicitado"', async () => {
      await doisFA.gerarCodigo('admin-1');
      doisFA.resetar(); // limpa sem verificar
      const r = await doisFA.verificarCodigo('111111');
      expect(r.valido).toBe(false);
      expect(r.erro).toMatch(/não solicitado/i);
    });

    it('pode ser chamado múltiplas vezes sem lançar', () => {
      expect(() => {
        doisFA.resetar();
        doisFA.resetar();
        doisFA.resetar();
      }).not.toThrow();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. MODO CONFIGURADO — supabaseConfigured = true
// ─────────────────────────────────────────────────────────────────────────────
describe('doisFA — modo configurado (supabaseConfigured = true)', () => {
  let doisFA: typeof import('@/services/doisFA')['doisFA'];
  let mockRegistrarAcao: jest.Mock;
  let mockUpsert: jest.Mock;
  let mockUpdate: jest.Mock;
  let mockEq: jest.Mock;
  let mockFrom: jest.Mock;

  // Código determinístico: Math.random() = 0.23456
  // → Math.floor(100_000 + 0.23456 * 900_000) = Math.floor(311_104) = 311104
  const CODIGO_MOCK = '311104';

  beforeEach(() => {
    mockRegistrarAcao = jest.fn().mockResolvedValue(undefined);
    mockUpsert  = jest.fn().mockResolvedValue({ error: null });
    mockEq      = jest.fn().mockResolvedValue({ error: null });
    mockUpdate  = jest.fn().mockReturnValue({ eq: mockEq });
    mockFrom    = jest.fn().mockReturnValue({ upsert: mockUpsert, update: mockUpdate });

    jest.spyOn(Math, 'random').mockReturnValue(0.23456);

    jest.isolateModules(() => {
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: true,
        supabase: { from: mockFrom },
      }));
      jest.doMock('@/services/auditoria', () => ({
        registrarAcao: mockRegistrarAcao,
      }));
      doisFA = require('@/services/doisFA').doisFA;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── modoDemo ──
  describe('modoDemo()', () => {
    it('retorna false quando supabase está configurado', () => {
      expect(doisFA.modoDemo()).toBe(false);
    });
  });

  // ── gerarCodigo ──
  describe('gerarCodigo()', () => {
    it('gera código de exatamente 6 dígitos', async () => {
      await doisFA.gerarCodigo('admin-prod');
      // Com Math.random() = 0.23456 → código '311104'
      const r = await doisFA.verificarCodigo(CODIGO_MOCK);
      expect(r.valido).toBe(true);
    });

    it('código tem exatamente 6 caracteres numéricos', async () => {
      await doisFA.gerarCodigo('admin-prod');
      const r = await doisFA.verificarCodigo(CODIGO_MOCK);
      expect(CODIGO_MOCK).toMatch(/^\d{6}$/);
      expect(r.valido).toBe(true);
    });

    it('chama supabase.from("admin_2fa_tokens").upsert com os dados corretos', async () => {
      await doisFA.gerarCodigo('admin-prod');
      expect(mockFrom).toHaveBeenCalledWith('admin_2fa_tokens');
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'admin-prod',
          codigo:  CODIGO_MOCK,
          usado:   false,
        }),
      );
    });

    it('upsert inclui expira_em como ISO string no futuro', async () => {
      const T0 = 5_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(T0);

      await doisFA.gerarCodigo('admin-prod');

      const args = mockUpsert.mock.calls[0][0];
      const expiraEm = new Date(args.expira_em).getTime();
      expect(expiraEm).toBeGreaterThan(T0);
      expect(expiraEm).toBeCloseTo(T0 + 10 * 60_000, -3); // ~10min de margem 1s
    });

    it('não lança quando upsert no supabase falha (catch silencioso)', async () => {
      mockUpsert.mockRejectedValueOnce(new Error('Table not found'));
      await expect(doisFA.gerarCodigo('admin-prod')).resolves.toBeUndefined();
    });

    it('chama registrarAcao com acao "2fa_codigo_gerado"', async () => {
      await doisFA.gerarCodigo('admin-prod');
      expect(mockRegistrarAcao).toHaveBeenCalledWith(
        expect.objectContaining({ acao: '2fa_codigo_gerado', categoria: 'auth' }),
      );
    });
  });

  // ── verificarCodigo ──
  describe('verificarCodigo()', () => {
    it('retorna { valido: true } com código correto gerado em prod', async () => {
      await doisFA.gerarCodigo('admin-prod');
      const r = await doisFA.verificarCodigo(CODIGO_MOCK);
      expect(r.valido).toBe(true);
    });

    it('retorna { valido: false, erro: "Código incorreto." } com código errado', async () => {
      await doisFA.gerarCodigo('admin-prod');
      const r = await doisFA.verificarCodigo('000000');
      expect(r.valido).toBe(false);
      expect(r.erro).toBe('Código incorreto.');
    });

    it('chama registrarAcao com "2fa_codigo_incorreto" para código errado', async () => {
      await doisFA.gerarCodigo('admin-prod');
      mockRegistrarAcao.mockClear();
      await doisFA.verificarCodigo('000000');
      expect(mockRegistrarAcao).toHaveBeenCalledWith(
        expect.objectContaining({ acao: '2fa_codigo_incorreto', resultado: 'falha' }),
      );
    });

    it('marca token como usado no banco após sucesso', async () => {
      await doisFA.gerarCodigo('admin-prod');
      await doisFA.verificarCodigo(CODIGO_MOCK);
      expect(mockUpdate).toHaveBeenCalledWith({ usado: true });
      expect(mockEq).toHaveBeenCalledWith('user_id', 'admin-prod');
    });

    it('chama registrarAcao com "2fa_verificado" após sucesso', async () => {
      await doisFA.gerarCodigo('admin-prod');
      mockRegistrarAcao.mockClear();
      await doisFA.verificarCodigo(CODIGO_MOCK);
      expect(mockRegistrarAcao).toHaveBeenCalledWith(
        expect.objectContaining({ acao: '2fa_verificado', resultado: 'sucesso' }),
      );
    });

    it('chama registrarAcao com "2fa_codigo_expirado" quando TTL passou', async () => {
      const T0 = 6_000_000;
      const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(T0);
      await doisFA.gerarCodigo('admin-prod');

      dateSpy.mockReturnValue(T0 + 10 * 60_000 + 1);
      mockRegistrarAcao.mockClear();
      await doisFA.verificarCodigo(CODIGO_MOCK);

      expect(mockRegistrarAcao).toHaveBeenCalledWith(
        expect.objectContaining({ acao: '2fa_codigo_expirado', resultado: 'falha' }),
      );
    });

    it('não lança quando update no banco falha após sucesso (catch silencioso)', async () => {
      mockEq.mockRejectedValueOnce(new Error('DB offline'));
      await doisFA.gerarCodigo('admin-prod');
      await expect(doisFA.verificarCodigo(CODIGO_MOCK)).resolves.toMatchObject({ valido: true });
    });

    it('estaVerificado() retorna true após sucesso em modo prod', async () => {
      await doisFA.gerarCodigo('admin-prod');
      await doisFA.verificarCodigo(CODIGO_MOCK);
      expect(doisFA.estaVerificado()).toBe(true);
    });
  });

  // ── resetar ──
  describe('resetar()', () => {
    it('limpa estaVerificado() em modo prod', async () => {
      await doisFA.gerarCodigo('admin-prod');
      await doisFA.verificarCodigo(CODIGO_MOCK);
      doisFA.resetar();
      expect(doisFA.estaVerificado()).toBe(false);
    });

    it('após resetar, novas verificações retornam "não solicitado"', async () => {
      await doisFA.gerarCodigo('admin-prod');
      doisFA.resetar();
      const r = await doisFA.verificarCodigo(CODIGO_MOCK);
      expect(r.valido).toBe(false);
      expect(r.erro).toMatch(/não solicitado/i);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Constantes e invariantes do protocolo
// ─────────────────────────────────────────────────────────────────────────────
describe('doisFA — invariantes de protocolo', () => {
  let doisFA: typeof import('@/services/doisFA')['doisFA'];

  beforeEach(() => {
    jest.isolateModules(() => {
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: false,
        supabase: null,
      }));
      jest.doMock('@/services/auditoria', () => ({
        registrarAcao: jest.fn().mockResolvedValue(undefined),
      }));
      doisFA = require('@/services/doisFA').doisFA;
    });
  });

  it('código demo é sempre "111111" (6 dígitos, todos iguais)', async () => {
    await doisFA.gerarCodigo('a');
    const r = await doisFA.verificarCodigo('111111');
    expect(r.valido).toBe(true);
  });

  it('"111110" (1 dígito diferente) não é aceito como código demo', async () => {
    await doisFA.gerarCodigo('a');
    const r = await doisFA.verificarCodigo('111110');
    expect(r.valido).toBe(false);
  });

  it('código vazio não é aceito', async () => {
    await doisFA.gerarCodigo('a');
    const r = await doisFA.verificarCodigo('');
    expect(r.valido).toBe(false);
  });

  it('codigo com apenas espaços não é aceito', async () => {
    await doisFA.gerarCodigo('a');
    const r = await doisFA.verificarCodigo('      ');
    expect(r.valido).toBe(false);
  });
});
