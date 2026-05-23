/**
 * services/__tests__/auditoria.test.ts
 *
 * Suite de testes para auditoria.ts
 *
 * Estratégia de isolamento:
 *   - Usa jest.isolateModules() + jest.doMock() em beforeEach para obter
 *     instâncias frescas do módulo em cada grupo de testes, garantindo que
 *     o estado de módulo (_buffer, _loginFalhas) comece limpo.
 *   - Dois contextos testados:
 *       A) supabaseConfigured = false → paths demo / early-return
 *       B) supabaseConfigured = true  → paths Supabase reais (mockado)
 *
 * Princípios FIRST:
 *  Fast      — sem I/O real; supabase totalmente mockado
 *  Isolated  — isolateModules() garante estado limpo por describe
 *  Repeatable — mocks determinísticos
 *  Self-validating — assertions explícitas
 *  Timely    — cobertura pré-produção
 */

import type {
  RegistrarAcaoParams,
  AuditEntry,
  AnomaliaEntry,
  AccessEntry,
  CategoriaAudit,
  SeveridadeAudit,
  ResultadoAudit,
} from '@/services/auditoria';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de mock Supabase
// ─────────────────────────────────────────────────────────────────────────────

/** Cria um builder encadeável que resolve com o valor fornecido ao ser awaited. */
function makeBuilder(resolvedWith: { data?: any; error?: any; count?: number }) {
  // O builder é um PromiseLike para que `await query` funcione
  const promise = Promise.resolve(resolvedWith);
  const builder: any = {
    select: jest.fn().mockReturnThis(),
    order:  jest.fn().mockReturnThis(),
    limit:  jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockResolvedValue(resolvedWith),
    // PromiseLike
    then:  promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
  // Garantir que os métodos de chain também retornem o builder
  builder.select.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.update.mockReturnValue(builder);
  return builder;
}

/** Constrói supabase mockado com from() configurável por tabela. */
function buildMockSupabase(overrides: Record<string, any> = {}) {
  const getUser = jest.fn().mockResolvedValue({
    data: { user: { id: 'mock-user-id' } },
  });

  const fromImpl = jest.fn((tabela: string) => {
    if (overrides[tabela]) return overrides[tabela];
    return makeBuilder({ data: [], error: null });
  });

  return {
    auth: { getUser },
    from: fromImpl,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A. MODO DEMO — supabaseConfigured = false
// ─────────────────────────────────────────────────────────────────────────────
describe('auditoria.ts — modo demo (supabaseConfigured = false)', () => {
  // Módulo carregado com supabase desconfigurado
  let mod: typeof import('@/services/auditoria');

  beforeEach(() => {
    jest.isolateModules(() => {
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: false,
        supabase: null,
      }));
      mod = require('@/services/auditoria');
    });
  });

  // ── registrarAcao ──
  describe('registrarAcao()', () => {
    it('resolve sem lançar exceção quando não configurado', async () => {
      await expect(
        mod.registrarAcao({ acao: 'login', categoria: 'auth' }),
      ).resolves.toBeUndefined();
    });

    it('aceita todos os parâmetros opcionais sem falhar', async () => {
      const params: RegistrarAcaoParams = {
        acao: 'evento_criado',
        categoria: 'evento',
        severidade: 'aviso',
        tabela: 'eventos',
        registroId: 'evt-1',
        detalhes: { nome: 'Teste' },
        resultado: 'sucesso',
      };
      await expect(mod.registrarAcao(params)).resolves.toBeUndefined();
    });
  });

  // ── registrarAcesso ──
  describe('registrarAcesso()', () => {
    it('resolve sem lançar exceção para todos os tipos de evento', async () => {
      const eventos = ['login', 'logout', 'login_falha', 'cadastro', 'token_renovado'] as const;
      for (const evento of eventos) {
        await expect(mod.registrarAcesso(evento, 'user-1')).resolves.toBeUndefined();
      }
    });

    it('aceita userId undefined', async () => {
      await expect(mod.registrarAcesso('login')).resolves.toBeUndefined();
    });
  });

  // ── registrarAnomalia ──
  describe('registrarAnomalia()', () => {
    it('resolve sem lançar exceção quando não configurado', async () => {
      await expect(
        mod.registrarAnomalia({ tipo: 'velocidade', descricao: 'Teste de velocidade' }),
      ).resolves.toBeUndefined();
    });
  });

  // ── listarAuditRecente ──
  describe('listarAuditRecente()', () => {
    it('retorna array não vazio de AuditEntry (dados demo)', async () => {
      const resultado = await mod.listarAuditRecente();
      expect(Array.isArray(resultado)).toBe(true);
      expect(resultado.length).toBeGreaterThan(0);
    });

    it('cada entrada demo tem as propriedades obrigatórias', async () => {
      const resultado = await mod.listarAuditRecente();
      for (const entry of resultado) {
        expect(typeof entry.id).toBe('string');
        expect(typeof entry.acao).toBe('string');
        expect(['auth', 'evento', 'moderacao', 'pagamento', 'denuncia', 'admin', 'seguranca'])
          .toContain(entry.categoria);
        expect(['info', 'aviso', 'critico']).toContain(entry.severidade);
        expect(['sucesso', 'falha', 'bloqueado']).toContain(entry.resultado);
        expect(typeof entry.created_at).toBe('string');
      }
    });

    it('aceita parâmetro de limite sem lançar exceção', async () => {
      await expect(mod.listarAuditRecente(10)).resolves.toBeInstanceOf(Array);
    });
  });

  // ── listarAcessosRecentes ──
  describe('listarAcessosRecentes()', () => {
    it('retorna array vazio quando não configurado', async () => {
      const resultado = await mod.listarAcessosRecentes();
      expect(resultado).toEqual([]);
    });

    it('aceita parâmetro de limite sem lançar exceção', async () => {
      await expect(mod.listarAcessosRecentes(10)).resolves.toEqual([]);
    });
  });

  // ── listarAnomalias ──
  describe('listarAnomalias()', () => {
    it('retorna array não vazio de AnomaliaEntry (dados demo)', async () => {
      const resultado = await mod.listarAnomalias();
      expect(Array.isArray(resultado)).toBe(true);
      expect(resultado.length).toBeGreaterThan(0);
    });

    it('cada entrada demo tem as propriedades obrigatórias', async () => {
      const resultado = await mod.listarAnomalias();
      for (const entry of resultado) {
        expect(typeof entry.id).toBe('string');
        expect(typeof entry.tipo).toBe('string');
        expect(typeof entry.descricao).toBe('string');
        expect(typeof entry.resolvido).toBe('boolean');
        expect(typeof entry.created_at).toBe('string');
      }
    });

    it('dados demo têm resolvido: false (anomalias ativas)', async () => {
      const resultado = await mod.listarAnomalias(true);
      resultado.forEach(entry => expect(entry.resolvido).toBe(false));
    });

    it('aceita apenasAtivas = false sem lançar exceção', async () => {
      await expect(mod.listarAnomalias(false)).resolves.toBeInstanceOf(Array);
    });
  });

  // ── contarAnomaliasPendentes ──
  describe('contarAnomaliasPendentes()', () => {
    it('retorna 2 (valor demo fixo)', async () => {
      const count = await mod.contarAnomaliasPendentes();
      expect(count).toBe(2);
    });
  });

  // ── resolverAnomalia ──
  describe('resolverAnomalia()', () => {
    it('resolve sem lançar exceção quando não configurado', async () => {
      await expect(mod.resolverAnomalia('any-id')).resolves.toBeUndefined();
    });
  });

  // ── trackLoginFalha ──
  describe('trackLoginFalha()', () => {
    it('não lança exceção para qualquer email', () => {
      expect(() => mod.trackLoginFalha('user@example.com')).not.toThrow();
    });

    it('pode ser chamado múltiplas vezes sem lançar', () => {
      expect(() => {
        for (let i = 0; i < 10; i++) {
          mod.trackLoginFalha('spam@test.com');
        }
      }).not.toThrow();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. MODO CONFIGURADO — supabaseConfigured = true + supabase mockado
// ─────────────────────────────────────────────────────────────────────────────
describe('auditoria.ts — modo configurado (supabaseConfigured = true)', () => {
  let mod: typeof import('@/services/auditoria');
  let mockSupabase: ReturnType<typeof buildMockSupabase>;

  beforeEach(() => {
    mockSupabase = buildMockSupabase();

    jest.isolateModules(() => {
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: true,
        supabase: mockSupabase,
      }));
      mod = require('@/services/auditoria');
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── registrarAcao — buffer + flush ──
  describe('registrarAcao() — buffer e flush', () => {
    it('chama supabase.from("audit_log").insert após 300ms', async () => {
      jest.useFakeTimers();

      await mod.registrarAcao({ acao: 'evento_criado', categoria: 'evento' });

      // Antes do flush, insert ainda não foi chamado
      expect(mockSupabase.from).not.toHaveBeenCalledWith('audit_log');

      // Avança o timer
      jest.advanceTimersByTime(300);
      await Promise.resolve(); // drena microtasks

      expect(mockSupabase.from).toHaveBeenCalledWith('audit_log');
    });

    it('múltiplas chamadas antes do flush são agrupadas em lote', async () => {
      jest.useFakeTimers();

      await mod.registrarAcao({ acao: 'a1', categoria: 'auth' });
      await mod.registrarAcao({ acao: 'a2', categoria: 'evento' });
      await mod.registrarAcao({ acao: 'a3', categoria: 'seguranca' });

      jest.advanceTimersByTime(300);
      await Promise.resolve();

      // insert deve ser chamado uma única vez com os 3 registros agrupados
      expect(mockSupabase.from).toHaveBeenCalledWith('audit_log');

      // Localiza o builder retornado para a chamada 'audit_log'
      const auditCallIdx = mockSupabase.from.mock.calls.findIndex(
        (call: any[]) => call[0] === 'audit_log',
      );
      expect(auditCallIdx).toBeGreaterThanOrEqual(0);

      const auditBuilder = mockSupabase.from.mock.results[auditCallIdx].value;
      const insertArg = auditBuilder.insert.mock.calls[0]?.[0];

      // O lote deve ter exatamente 3 entradas com as ações corretas
      expect(Array.isArray(insertArg)).toBe(true);
      expect(insertArg).toHaveLength(3);
      expect(insertArg).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ acao: 'a1' }),
          expect.objectContaining({ acao: 'a2' }),
          expect.objectContaining({ acao: 'a3' }),
        ]),
      );
    });

    it('não lança exceção mesmo se supabase.from lançar', async () => {
      jest.useFakeTimers();
      mockSupabase.from.mockImplementationOnce(() => {
        throw new Error('Conexão perdida');
      });

      // registrarAcao nunca deve rejeitar — "nunca lança"
      await expect(
        mod.registrarAcao({ acao: 'test', categoria: 'auth' }),
      ).resolves.toBeUndefined();

      // Timers: mesmo que flush falhe, não lança no chamador
      expect(() => jest.advanceTimersByTime(300)).not.toThrow();
    });
  });

  // ── registrarAcesso ──
  describe('registrarAcesso()', () => {
    it('chama supabase.from("access_log").insert com os campos corretos', async () => {
      const insertMock = jest.fn().mockResolvedValue({ error: null });
      mockSupabase.from.mockReturnValue({ insert: insertMock });

      await mod.registrarAcesso('login', 'user-abc');

      expect(mockSupabase.from).toHaveBeenCalledWith('access_log');
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-abc', evento: 'login' })
      );
    });

    it('envia user_id null quando userId não fornecido', async () => {
      const insertMock = jest.fn().mockResolvedValue({ error: null });
      mockSupabase.from.mockReturnValue({ insert: insertMock });

      await mod.registrarAcesso('logout');

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: null })
      );
    });

    it('não lança mesmo se supabase.from lançar', async () => {
      mockSupabase.from.mockImplementationOnce(() => { throw new Error('Erro'); });
      await expect(mod.registrarAcesso('login_falha')).resolves.toBeUndefined();
    });
  });

  // ── registrarAnomalia ──
  describe('registrarAnomalia()', () => {
    it('chama supabase.from("anomalia_log").insert com os campos corretos', async () => {
      const insertMock = jest.fn().mockResolvedValue({ error: null });
      mockSupabase.from.mockReturnValue({ insert: insertMock });

      await mod.registrarAnomalia({
        userId: 'u-1',
        tipo: 'velocidade',
        descricao: 'Eventos rápidos',
        detalhes: { eventos: 6 },
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('anomalia_log');
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'u-1',
          tipo: 'velocidade',
          descricao: 'Eventos rápidos',
          detalhes: { eventos: 6 },
          resolvido: false,
        })
      );
    });

    it('envia user_id null quando userId não fornecido', async () => {
      const insertMock = jest.fn().mockResolvedValue({ error: null });
      mockSupabase.from.mockReturnValue({ insert: insertMock });

      await mod.registrarAnomalia({ tipo: 'conteudo_suspeito', descricao: 'Spam' });

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: null })
      );
    });

    it('envia detalhes: {} quando não fornecido', async () => {
      const insertMock = jest.fn().mockResolvedValue({ error: null });
      mockSupabase.from.mockReturnValue({ insert: insertMock });

      await mod.registrarAnomalia({ tipo: 'ip_duplicado', descricao: 'IP duplicado' });

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ detalhes: {} })
      );
    });

    it('não lança se supabase.from lançar', async () => {
      mockSupabase.from.mockImplementationOnce(() => { throw new Error('Erro de rede'); });
      await expect(
        mod.registrarAnomalia({ tipo: 'multiplas_denuncias', descricao: 'Teste' }),
      ).resolves.toBeUndefined();
    });
  });

  // ── trackLoginFalha ──
  describe('trackLoginFalha()', () => {
    it('NÃO chama supabase nas primeiras 4 tentativas', async () => {
      for (let i = 0; i < 4; i++) {
        mod.trackLoginFalha('track-test-a@agora.test');
      }
      // Nenhuma chamada ao banco nas 4 primeiras
      expect(mockSupabase.from).not.toHaveBeenCalledWith('anomalia_log');
    });

    it('chama supabase.from("anomalia_log") na 5ª tentativa', async () => {
      const insertMock = jest.fn().mockResolvedValue({ error: null });
      mockSupabase.from.mockReturnValue({ insert: insertMock });

      for (let i = 0; i < 5; i++) {
        mod.trackLoginFalha('track-test-b@agora.test');
      }

      expect(mockSupabase.from).toHaveBeenCalledWith('anomalia_log');
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: 'login_falha_repetida',
          resolvido: false,
        })
      );
    });

    it('reseta contador após 5ª tentativa — próximas 4 não disparam', async () => {
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      // 5 tentativas → dispara + reseta
      for (let i = 0; i < 5; i++) mod.trackLoginFalha('track-test-c@agora.test');

      const chamadas1 = mockSupabase.from.mock.calls.length;

      // 4 tentativas adicionais → NÃO deve disparar novamente
      for (let i = 0; i < 4; i++) mod.trackLoginFalha('track-test-c@agora.test');

      expect(mockSupabase.from.mock.calls.length).toBe(chamadas1); // sem chamadas extras
    });

    it('emails de usuários diferentes não interferem entre si', async () => {
      // 4 tentativas para usuário A + 4 para usuário B → nenhum dispara
      for (let i = 0; i < 4; i++) mod.trackLoginFalha('usuario-a@agora.test');
      for (let i = 0; i < 4; i++) mod.trackLoginFalha('usuario-b@agora.test');

      expect(mockSupabase.from).not.toHaveBeenCalledWith('anomalia_log');
    });

    it('normaliza email para lowercase (maiúsculas contam para o mesmo contador)', async () => {
      const insertMock = jest.fn().mockResolvedValue({ error: null });
      mockSupabase.from.mockReturnValue({ insert: insertMock });

      // 3 chamadas em uppercase + 2 em lowercase → mesmo email → dispara na 5ª
      for (let i = 0; i < 3; i++) mod.trackLoginFalha('TRACK-CASE@AGORA.TEST');
      for (let i = 0; i < 2; i++) mod.trackLoginFalha('track-case@agora.test');

      expect(mockSupabase.from).toHaveBeenCalledWith('anomalia_log');
    });

    it('inclui detalhes com email_hash e contagem de tentativas', async () => {
      const insertMock = jest.fn().mockResolvedValue({ error: null });
      mockSupabase.from.mockReturnValue({ insert: insertMock });

      for (let i = 0; i < 5; i++) mod.trackLoginFalha('track-details@agora.test');

      const insertArgs = insertMock.mock.calls[0][0];
      expect(insertArgs.detalhes).toMatchObject({
        email_hash: expect.stringContaining('***'),
        tentativas: expect.any(Number),
      });
      // tentativas deve ser 5 (é registrada antes do reset)
      expect(insertArgs.detalhes.tentativas).toBe(5);
    });
  });

  // ── listarAuditRecente ──
  describe('listarAuditRecente()', () => {
    it('retorna os dados do banco quando configurado', async () => {
      const fakeData: Partial<AuditEntry>[] = [
        { id: '1', acao: 'login', categoria: 'auth', severidade: 'info', resultado: 'sucesso', created_at: new Date().toISOString() },
      ];
      const builder = makeBuilder({ data: fakeData, error: null });
      mockSupabase.from.mockReturnValue(builder);

      const resultado = await mod.listarAuditRecente(10);
      expect(resultado).toEqual(fakeData);
    });

    it('chama with limit correto', async () => {
      const limitMock = jest.fn().mockResolvedValue({ data: [], error: null });
      const orderMock = jest.fn().mockReturnValue({ limit: limitMock });
      const selectMock = jest.fn().mockReturnValue({ order: orderMock });
      mockSupabase.from.mockReturnValue({ select: selectMock });

      await mod.listarAuditRecente(25);

      expect(limitMock).toHaveBeenCalledWith(25);
    });

    it('lança Error quando supabase retorna error', async () => {
      const builder = makeBuilder({ data: null, error: { message: 'Permission denied' } });
      mockSupabase.from.mockReturnValue(builder);

      await expect(mod.listarAuditRecente()).rejects.toThrow('Permission denied');
    });

    it('retorna array vazio quando data é null sem error', async () => {
      const builder = makeBuilder({ data: null, error: null });
      mockSupabase.from.mockReturnValue(builder);

      const resultado = await mod.listarAuditRecente();
      expect(resultado).toEqual([]);
    });
  });

  // ── listarAnomalias ──
  describe('listarAnomalias()', () => {
    it('lança Error quando supabase retorna error', async () => {
      const builder = makeBuilder({ data: null, error: { message: 'Acesso negado' } });
      mockSupabase.from.mockReturnValue(builder);

      await expect(mod.listarAnomalias()).rejects.toThrow('Acesso negado');
    });

    it('retorna array vazio quando data é null sem error', async () => {
      const builder = makeBuilder({ data: null, error: null });
      mockSupabase.from.mockReturnValue(builder);

      const resultado = await mod.listarAnomalias();
      expect(resultado).toEqual([]);
    });
  });

  // ── resolverAnomalia ──
  describe('resolverAnomalia()', () => {
    it('lança Error quando update retorna error', async () => {
      const eqMock = jest.fn().mockResolvedValue({ error: { message: 'ID não encontrado' } });
      const updateMock = jest.fn().mockReturnValue({ eq: eqMock });
      mockSupabase.from.mockReturnValue({ update: updateMock });

      await expect(mod.resolverAnomalia('id-inexistente')).rejects.toThrow('ID não encontrado');
    });

    it('chama update.eq com o ID correto', async () => {
      jest.useFakeTimers();

      const eqMock = jest.fn().mockResolvedValue({ error: null });
      const updateMock = jest.fn().mockReturnValue({ eq: eqMock });
      // Segunda chamada de from (para registrarAcao/flush) usa builder padrão
      mockSupabase.from
        .mockReturnValueOnce({ update: updateMock })
        .mockReturnValue(makeBuilder({ data: null, error: null }));

      await mod.resolverAnomalia('anom-xyz');

      expect(updateMock).toHaveBeenCalledWith({ resolvido: true });
      expect(eqMock).toHaveBeenCalledWith('id', 'anom-xyz');
    });
  });

  // ── contarAnomaliasPendentes ──
  describe('contarAnomaliasPendentes()', () => {
    it('retorna o count do supabase quando configurado', async () => {
      const eqMock = jest.fn().mockResolvedValue({ count: 7, error: null });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      mockSupabase.from.mockReturnValue({ select: selectMock });

      const resultado = await mod.contarAnomaliasPendentes();
      expect(resultado).toBe(7);
    });

    it('retorna 0 quando count é null', async () => {
      const eqMock = jest.fn().mockResolvedValue({ count: null, error: null });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      mockSupabase.from.mockReturnValue({ select: selectMock });

      const resultado = await mod.contarAnomaliasPendentes();
      expect(resultado).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Tipos exportados — validação de forma (compile-time + runtime guards)
// ─────────────────────────────────────────────────────────────────────────────
describe('tipos exportados', () => {
  it('CategoriaAudit cobre todos os 7 valores esperados', () => {
    const valores: CategoriaAudit[] = [
      'auth', 'evento', 'moderacao', 'pagamento', 'denuncia', 'admin', 'seguranca',
    ];
    expect(valores.length).toBe(7);
  });

  it('SeveridadeAudit cobre os 3 níveis', () => {
    const valores: SeveridadeAudit[] = ['info', 'aviso', 'critico'];
    expect(valores.length).toBe(3);
  });

  it('ResultadoAudit cobre os 3 resultados', () => {
    const valores: ResultadoAudit[] = ['sucesso', 'falha', 'bloqueado'];
    expect(valores.length).toBe(3);
  });
});
