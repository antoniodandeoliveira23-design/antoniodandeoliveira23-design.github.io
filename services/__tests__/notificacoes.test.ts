/**
 * services/__tests__/notificacoes.test.ts
 *
 * Suite de testes para notificacoes.ts
 *
 * Módulos testados:
 *   tempoRelativo()        — função pura (Date.now mockado)
 *   buscarNotificacoes()   — demo fallback + supabase real
 *   contarNaoLidas()       — demo count + supabase real
 *   marcarComoLida()       — supabase update.eq
 *   marcarTodasComoLidas() — supabase update.eq.eq
 *   criarNotificacao()     — supabase insert + defaults
 *   desativarPushTokens()  — supabase update.eq
 *   registrarPushToken()   — early return em web/unconfigured
 *
 * Princípios FIRST:
 *  Fast      — sem I/O real; Date.now fixo; supabase mockado
 *  Isolated  — jest.isolateModules() + Date.now spy restaurado em afterEach
 *  Repeatable — NOW fixo garante tempoRelativo determinístico
 *  Self-validating — assertions explícitas
 *  Timely    — cobertura pré-produção
 */

import { tempoRelativo } from '@/services/notificacoes';
import type { Notificacao, TipoNotificacao } from '@/services/notificacoes';

// ─────────────────────────────────────────────────────────────────────────────
// A. tempoRelativo() — função pura, testada com Date.now fixo
// ─────────────────────────────────────────────────────────────────────────────
describe('tempoRelativo()', () => {
  // Ancora: 2025-06-15 12:00:00 UTC
  const NOW = new Date('2025-06-15T12:00:00.000Z').getTime();
  let dateSpy: jest.SpyInstance;

  beforeEach(() => {
    dateSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    dateSpy.mockRestore();
  });

  it('retorna "agora" quando diferença < 1 minuto (30s)', () => {
    const iso = new Date(NOW - 30_000).toISOString();
    expect(tempoRelativo(iso)).toBe('agora');
  });

  it('retorna "agora" quando diff é 0 (mesmo instante)', () => {
    const iso = new Date(NOW).toISOString();
    expect(tempoRelativo(iso)).toBe('agora');
  });

  it('retorna "1min atrás" quando diff = 1 minuto exato', () => {
    const iso = new Date(NOW - 60_000).toISOString();
    expect(tempoRelativo(iso)).toBe('1min atrás');
  });

  it('retorna "59min atrás" no limite superior dos minutos', () => {
    const iso = new Date(NOW - 59 * 60_000).toISOString();
    expect(tempoRelativo(iso)).toBe('59min atrás');
  });

  it('retorna "1h atrás" quando diff = 1 hora exata', () => {
    const iso = new Date(NOW - 3_600_000).toISOString();
    expect(tempoRelativo(iso)).toBe('1h atrás');
  });

  it('retorna "23h atrás" no limite superior das horas', () => {
    const iso = new Date(NOW - 23 * 3_600_000).toISOString();
    expect(tempoRelativo(iso)).toBe('23h atrás');
  });

  it('retorna "1d atrás" quando diff = 1 dia exato', () => {
    const iso = new Date(NOW - 86_400_000).toISOString();
    expect(tempoRelativo(iso)).toBe('1d atrás');
  });

  it('retorna "6d atrás" no limite superior dos dias (< 7)', () => {
    const iso = new Date(NOW - 6 * 86_400_000).toISOString();
    expect(tempoRelativo(iso)).toBe('6d atrás');
  });

  it('retorna data formatada pt-BR quando diff >= 7 dias', () => {
    const iso = new Date(NOW - 7 * 86_400_000).toISOString();
    const resultado = tempoRelativo(iso);
    // Deve ser string no formato brasileiro (dd/mm/aaaa ou similar)
    expect(typeof resultado).toBe('string');
    expect(resultado).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('retorna data formatada para data muito antiga (1 ano)', () => {
    const iso = new Date(NOW - 365 * 86_400_000).toISOString();
    const resultado = tempoRelativo(iso);
    expect(resultado).not.toBe('agora');
    expect(resultado).not.toMatch(/atrás/);
    expect(typeof resultado).toBe('string');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: cria builder Supabase encadeável e awaitable
// ─────────────────────────────────────────────────────────────────────────────
function makeBuilder(resolved: { data?: any; error?: any; count?: number }) {
  const promise = Promise.resolve(resolved);
  const b: any = {
    select: jest.fn().mockReturnThis(),
    order:  jest.fn().mockReturnThis(),
    limit:  jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockResolvedValue(resolved),
    insert: jest.fn().mockResolvedValue(resolved),
    then:   promise.then.bind(promise),
    catch:  promise.catch.bind(promise),
  };
  b.select.mockReturnValue(b);
  b.order.mockReturnValue(b);
  b.limit.mockReturnValue(b);
  b.eq.mockReturnValue(b);
  b.update.mockReturnValue(b);
  return b;
}

// ─────────────────────────────────────────────────────────────────────────────
// B. MODO DEMO — supabaseConfigured = false
// ─────────────────────────────────────────────────────────────────────────────
describe('notificacoes — modo demo (supabaseConfigured = false)', () => {
  let mod: typeof import('@/services/notificacoes');

  beforeEach(() => {
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: false,
        supabase: null,
      }));
      mod = require('@/services/notificacoes');
    });
  });

  // ── buscarNotificacoes ──
  describe('buscarNotificacoes()', () => {
    it('retorna DEMO_NOTIFICACOES quando não configurado', async () => {
      const resultado = await mod.buscarNotificacoes('qualquer-user');
      expect(Array.isArray(resultado)).toBe(true);
      expect(resultado.length).toBeGreaterThan(0);
    });

    it('cada item demo tem as propriedades obrigatórias de Notificacao', async () => {
      const resultado = await mod.buscarNotificacoes('u1');
      for (const n of resultado) {
        expect(typeof n.id).toBe('string');
        expect(typeof n.usuario_id).toBe('string');
        expect(typeof n.tipo).toBe('string');
        expect(typeof n.titulo).toBe('string');
        expect(typeof n.mensagem).toBe('string');
        expect(typeof n.lida).toBe('boolean');
        expect(typeof n.criado_em).toBe('string');
      }
    });

    it('demo contém notificações lidas e não lidas', async () => {
      const resultado = await mod.buscarNotificacoes('u1');
      const lidas    = resultado.filter(n =>  n.lida);
      const naoLidas = resultado.filter(n => !n.lida);
      expect(lidas.length).toBeGreaterThan(0);
      expect(naoLidas.length).toBeGreaterThan(0);
    });
  });

  // ── contarNaoLidas ──
  describe('contarNaoLidas()', () => {
    it('retorna contagem de não-lidas dos dados demo', async () => {
      const count = await mod.contarNaoLidas('u1');
      // DEMO_NOTIFICACOES tem 2 não-lidas (ids 1 e 2)
      expect(count).toBe(2);
    });

    it('retorna número inteiro >= 0', async () => {
      const count = await mod.contarNaoLidas('u1');
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  // ── marcarComoLida ──
  describe('marcarComoLida()', () => {
    it('resolve sem lançar quando não configurado', async () => {
      await expect(mod.marcarComoLida('notif-1')).resolves.toBeUndefined();
    });
  });

  // ── marcarTodasComoLidas ──
  describe('marcarTodasComoLidas()', () => {
    it('resolve sem lançar quando não configurado', async () => {
      await expect(mod.marcarTodasComoLidas('u1')).resolves.toBeUndefined();
    });
  });

  // ── criarNotificacao ──
  describe('criarNotificacao()', () => {
    it('resolve sem lançar quando não configurado', async () => {
      await expect(
        mod.criarNotificacao({
          usuarioId: 'u1',
          tipo: 'sistema',
          titulo: 'Teste',
          mensagem: 'Mensagem de teste',
        }),
      ).resolves.toBeUndefined();
    });
  });

  // ── desativarPushTokens ──
  describe('desativarPushTokens()', () => {
    it('resolve sem lançar quando não configurado', async () => {
      await expect(mod.desativarPushTokens('u1')).resolves.toBeUndefined();
    });
  });

  // ── registrarPushToken — retorno em Platform.OS === 'web' ──
  describe('registrarPushToken()', () => {
    it('resolve sem lançar quando não configurado', async () => {
      await expect(mod.registrarPushToken('u1')).resolves.toBeUndefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. MODO CONFIGURADO — supabaseConfigured = true + supabase mockado
// ─────────────────────────────────────────────────────────────────────────────
describe('notificacoes — modo configurado (supabaseConfigured = true)', () => {
  let mod: typeof import('@/services/notificacoes');
  let mockFrom: jest.Mock;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    mockFrom = jest.fn().mockReturnValue(makeBuilder({ data: [], error: null }));
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: true,
        supabase: { from: mockFrom },
      }));
      mod = require('@/services/notificacoes');
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  // ── buscarNotificacoes ──
  describe('buscarNotificacoes()', () => {
    it('chama supabase.from("notificacoes") com usuarioId correto', async () => {
      const builder = makeBuilder({ data: [], error: null });
      mockFrom.mockReturnValue(builder);

      await mod.buscarNotificacoes('user-abc');

      expect(mockFrom).toHaveBeenCalledWith('notificacoes');
      expect(builder.eq).toHaveBeenCalledWith('usuario_id', 'user-abc');
    });

    it('retorna os dados do banco quando configurado', async () => {
      const fakeData: Partial<Notificacao>[] = [
        { id: 'n1', tipo: 'sistema', titulo: 'T', mensagem: 'M', lida: false, criado_em: new Date().toISOString() },
      ];
      mockFrom.mockReturnValue(makeBuilder({ data: fakeData, error: null }));

      const resultado = await mod.buscarNotificacoes('u1');
      expect(resultado).toEqual(fakeData);
    });

    it('faz fallback para DEMO_NOTIFICACOES quando supabase retorna error', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'Falha' } }));

      const resultado = await mod.buscarNotificacoes('u1');
      expect(Array.isArray(resultado)).toBe(true);
      expect(resultado.length).toBeGreaterThan(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('buscar'),
        'Falha',
      );
    });

    it('retorna [] quando data é null sem error', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: null, error: null }));
      const resultado = await mod.buscarNotificacoes('u1');
      expect(resultado).toEqual([]);
    });
  });

  // ── contarNaoLidas ──
  describe('contarNaoLidas()', () => {
    it('retorna o count do supabase quando configurado', async () => {
      const eqFinal = jest.fn().mockResolvedValue({ count: 5, error: null });
      const eq1 = jest.fn().mockReturnValue({ eq: eqFinal });
      const selectMock = jest.fn().mockReturnValue({ eq: eq1 });
      mockFrom.mockReturnValue({ select: selectMock });

      const resultado = await mod.contarNaoLidas('user-x');
      expect(resultado).toBe(5);
    });

    it('retorna 0 quando count é null', async () => {
      const eqFinal = jest.fn().mockResolvedValue({ count: null, error: null });
      const eq1 = jest.fn().mockReturnValue({ eq: eqFinal });
      const selectMock = jest.fn().mockReturnValue({ eq: eq1 });
      mockFrom.mockReturnValue({ select: selectMock });

      const resultado = await mod.contarNaoLidas('u1');
      expect(resultado).toBe(0);
    });

    it('retorna 0 quando supabase retorna error', async () => {
      const eqFinal = jest.fn().mockResolvedValue({ count: null, error: { message: 'Erro' } });
      const eq1 = jest.fn().mockReturnValue({ eq: eqFinal });
      const selectMock = jest.fn().mockReturnValue({ eq: eq1 });
      mockFrom.mockReturnValue({ select: selectMock });

      const resultado = await mod.contarNaoLidas('u1');
      expect(resultado).toBe(0);
    });
  });

  // ── marcarComoLida ──
  describe('marcarComoLida()', () => {
    it('chama from("notificacoes").update({ lida: true }).eq("id", id)', async () => {
      const eqMock = jest.fn().mockResolvedValue({ error: null });
      const updateMock = jest.fn().mockReturnValue({ eq: eqMock });
      mockFrom.mockReturnValue({ update: updateMock });

      await mod.marcarComoLida('notif-xyz');

      expect(mockFrom).toHaveBeenCalledWith('notificacoes');
      expect(updateMock).toHaveBeenCalledWith({ lida: true });
      expect(eqMock).toHaveBeenCalledWith('id', 'notif-xyz');
    });

    it('propaga rejeição quando supabase falha (sem try/catch interno)', async () => {
      // marcarComoLida não tem try/catch — a rejeição do supabase é propagada
      // Comportamento documentado: o chamador deve tratar o erro se necessário
      const eqMock = jest.fn().mockRejectedValue(new Error('DB down'));
      const updateMock = jest.fn().mockReturnValue({ eq: eqMock });
      mockFrom.mockReturnValue({ update: updateMock });

      await expect(mod.marcarComoLida('id')).rejects.toThrow('DB down');
    });
  });

  // ── marcarTodasComoLidas ──
  describe('marcarTodasComoLidas()', () => {
    it('chama from("notificacoes").update.eq("usuario_id").eq("lida", false)', async () => {
      const eq2 = jest.fn().mockResolvedValue({ error: null });
      const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
      const updateMock = jest.fn().mockReturnValue({ eq: eq1 });
      mockFrom.mockReturnValue({ update: updateMock });

      await mod.marcarTodasComoLidas('user-todas');

      expect(updateMock).toHaveBeenCalledWith({ lida: true });
      expect(eq1).toHaveBeenCalledWith('usuario_id', 'user-todas');
      expect(eq2).toHaveBeenCalledWith('lida', false);
    });
  });

  // ── criarNotificacao ──
  describe('criarNotificacao()', () => {
    it('chama from("notificacoes").insert com payload correto', async () => {
      const insertMock = jest.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ insert: insertMock });

      await mod.criarNotificacao({
        usuarioId: 'u-create',
        tipo: 'inscricao_confirmada',
        titulo: 'Inscrição confirmada!',
        mensagem: 'Você está inscrito no evento X.',
        dados: { evento_id: 'ev-1' },
      });

      expect(mockFrom).toHaveBeenCalledWith('notificacoes');
      expect(insertMock).toHaveBeenCalledWith({
        usuario_id: 'u-create',
        tipo: 'inscricao_confirmada',
        titulo: 'Inscrição confirmada!',
        mensagem: 'Você está inscrito no evento X.',
        dados: { evento_id: 'ev-1' },
      });
    });

    it('envia dados: {} quando dados não fornecido', async () => {
      const insertMock = jest.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ insert: insertMock });

      await mod.criarNotificacao({
        usuarioId: 'u1', tipo: 'sistema', titulo: 'T', mensagem: 'M',
      });

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ dados: {} }),
      );
    });

    it('loga warning quando supabase retorna error (não lança)', async () => {
      const insertMock = jest.fn().mockResolvedValue({ error: { message: 'FK violation' } });
      mockFrom.mockReturnValue({ insert: insertMock });

      await expect(
        mod.criarNotificacao({ usuarioId: 'u1', tipo: 'alerta_admin', titulo: 'T', mensagem: 'M' }),
      ).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('criar'),
        'FK violation',
      );
    });
  });

  // ── desativarPushTokens ──
  describe('desativarPushTokens()', () => {
    it('chama from("push_tokens").update({ ativo: false }).eq("usuario_id", uid)', async () => {
      const eqMock = jest.fn().mockResolvedValue({ error: null });
      const updateMock = jest.fn().mockReturnValue({ eq: eqMock });
      mockFrom.mockReturnValue({ update: updateMock });

      await mod.desativarPushTokens('u-logout');

      expect(mockFrom).toHaveBeenCalledWith('push_tokens');
      expect(updateMock).toHaveBeenCalledWith({ ativo: false });
      expect(eqMock).toHaveBeenCalledWith('usuario_id', 'u-logout');
    });

    it('não lança quando supabase lança exceção (catch interno)', async () => {
      mockFrom.mockImplementationOnce(() => { throw new Error('Sem conexão'); });
      await expect(mod.desativarPushTokens('u1')).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  // ── registrarPushToken — Platform.OS = 'web' → retorno imediato ──
  describe('registrarPushToken()', () => {
    it('resolve sem lançar (qualquer plataforma/configuração)', async () => {
      await expect(mod.registrarPushToken('u1')).resolves.toBeUndefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Tipos exportados
// ─────────────────────────────────────────────────────────────────────────────
describe('tipos exportados', () => {
  it('TipoNotificacao cobre os 8 valores esperados', () => {
    const valores: TipoNotificacao[] = [
      'nova_mensagem',
      'evento_aprovado',
      'evento_rejeitado',
      'pagamento_confirmado',
      'evento_favorito_atualizado',
      'inscricao_confirmada',
      'sistema',
      'alerta_admin',
    ];
    expect(valores.length).toBe(8);
  });

  it('interface Notificacao tem todas as propriedades obrigatórias', () => {
    const n: Notificacao = {
      id: 'id-1',
      usuario_id: 'u-1',
      tipo: 'sistema',
      titulo: 'Título',
      mensagem: 'Mensagem',
      dados: { chave: 'valor' },
      lida: false,
      criado_em: new Date().toISOString(),
    };
    expect(n.id).toBeDefined();
    expect(n.usuario_id).toBeDefined();
    expect(n.tipo).toBeDefined();
    expect(n.dados).toBeDefined();
  });
});
