/**
 * services/__tests__/email.test.ts
 *
 * Suite de testes para email.ts
 *
 * Módulo testado: emailService (boasVindas, eventoPendente, eventoAprovado,
 *   eventoRejeitado, pagamentoConfirmado, alertaDenuncia, novaMensagem, senhaRedefinida)
 * Comportamento interno: invocar() + fmtData() (testados indiretamente via métodos)
 *
 * Estratégia de isolamento:
 *   - jest.isolateModules() + jest.doMock() em beforeEach
 *   - Seção A: supabaseConfigured = false  → paths demo (console.log, sem invoke)
 *   - Seção B: supabaseConfigured = true   → paths reais (verifica invoke + payload)
 *
 * Princípios FIRST:
 *  Fast      — sem I/O real; supabase.functions.invoke totalmente mockado
 *  Isolated  — isolateModules garante estado limpo por describe
 *  Repeatable — sem Date.now() nas assertions críticas (testado por includes)
 *  Self-validating — assertions explícitas em cada it()
 *  Timely    — cobertura pré-produção
 */

// ─────────────────────────────────────────────────────────────────────────────
// A. MODO DEMO — supabaseConfigured = false
// ─────────────────────────────────────────────────────────────────────────────
describe('emailService — modo demo (supabaseConfigured = false)', () => {
  let emailService: typeof import('@/services/email')['emailService'];
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    jest.isolateModules(() => {
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: false,
        supabase: null,
      }));
      emailService = require('@/services/email').emailService;
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('boasVindas()', () => {
    it('resolve sem lançar exceção', async () => {
      await expect(
        emailService.boasVindas({ para: 'user@test.com', nome: 'Ana' }),
      ).resolves.toBeUndefined();
    });

    it('chama console.log com tipo boas_vindas', async () => {
      await emailService.boasVindas({ para: 'user@test.com', nome: 'Ana' });
      // boasVindas não passa dados → 3º argumento é undefined
      // Verifica apenas que o log foi chamado com o tipo correto no 1º argumento
      expect(consoleSpy).toHaveBeenCalled();
      const primeiroArg: string = consoleSpy.mock.calls[0][0];
      expect(primeiroArg).toContain('boas_vindas');
    });
  });

  describe('eventoPendente()', () => {
    it('resolve sem lançar exceção', async () => {
      await expect(
        emailService.eventoPendente({ usuarioId: 'u1', eventoNome: 'Show' }),
      ).resolves.toBeUndefined();
    });

    it('chama console.log com tipo evento_pendente', async () => {
      await emailService.eventoPendente({ usuarioId: 'u1', eventoNome: 'Show' });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('evento_pendente'),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('eventoAprovado()', () => {
    it('resolve sem lançar exceção', async () => {
      await expect(
        emailService.eventoAprovado({ usuarioId: 'u1', eventoNome: 'Feira' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('eventoRejeitado()', () => {
    it('resolve sem lançar exceção', async () => {
      await expect(
        emailService.eventoRejeitado({ usuarioId: 'u1', eventoNome: 'Palestra', motivo: 'Conteúdo inadequado' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('pagamentoConfirmado()', () => {
    it('resolve sem lançar exceção', async () => {
      await expect(
        emailService.pagamentoConfirmado({
          usuarioId: 'u1', planoNome: 'Pro', valor: 'R$ 49,90', validade: '2026-01-01',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('alertaDenuncia()', () => {
    it('resolve sem lançar exceção', async () => {
      await expect(
        emailService.alertaDenuncia({
          adminEmail: 'admin@agora.app', tipo: 'spam', motivo: 'Publicidade', alvoId: 'ev-1',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('novaMensagem()', () => {
    it('resolve sem lançar exceção', async () => {
      await expect(
        emailService.novaMensagem({ usuarioId: 'u1', remetenteNome: 'João', preview: 'Olá!' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('senhaRedefinida()', () => {
    it('resolve sem lançar exceção', async () => {
      await expect(
        emailService.senhaRedefinida({ para: 'user@test.com', nome: 'Maria' }),
      ).resolves.toBeUndefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. MODO CONFIGURADO — supabaseConfigured = true + supabase.functions mockado
// ─────────────────────────────────────────────────────────────────────────────
describe('emailService — modo configurado (supabaseConfigured = true)', () => {
  let emailService: typeof import('@/services/email')['emailService'];
  let mockInvoke: jest.Mock;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    mockInvoke = jest.fn().mockResolvedValue({ error: null });
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    jest.isolateModules(() => {
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: true,
        supabase: {
          functions: { invoke: mockInvoke },
        },
      }));
      emailService = require('@/services/email').emailService;
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  // ── invocar() — comportamento comum a todos os métodos ──
  describe('invocar() — comportamento comum', () => {
    it('chama supabase.functions.invoke com o nome correto da Edge Function', async () => {
      await emailService.boasVindas({ para: 'a@b.com', nome: 'A' });
      expect(mockInvoke).toHaveBeenCalledWith(
        'email-transacional',
        expect.objectContaining({ body: expect.any(Object) }),
      );
    });

    it('falha silenciosa quando invoke retorna error (não lança)', async () => {
      mockInvoke.mockResolvedValueOnce({ error: { message: 'SMTP indisponível' } });
      await expect(
        emailService.boasVindas({ para: 'a@b.com', nome: 'A' }),
      ).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('boas_vindas'),
        'SMTP indisponível',
      );
    });

    it('falha silenciosa quando invoke lança exceção (não lança)', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Timeout de rede'));
      await expect(
        emailService.boasVindas({ para: 'a@b.com', nome: 'A' }),
      ).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('boas_vindas'),
        expect.any(Error),
      );
    });
  });

  // ── boasVindas ──
  describe('boasVindas()', () => {
    it('envia payload com tipo boas_vindas, para e nome', async () => {
      await emailService.boasVindas({ para: 'novo@agora.app', nome: 'Carlos' });
      expect(mockInvoke).toHaveBeenCalledWith('email-transacional', {
        body: expect.objectContaining({
          tipo: 'boas_vindas',
          para: 'novo@agora.app',
          nome: 'Carlos',
        }),
      });
    });

    it('não inclui usuario_id (email direto, sem busca de perfil)', async () => {
      await emailService.boasVindas({ para: 'novo@agora.app', nome: 'Carlos' });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.usuario_id).toBeUndefined();
    });
  });

  // ── eventoPendente ──
  describe('eventoPendente()', () => {
    it('envia tipo evento_pendente com usuario_id e dados corretos', async () => {
      await emailService.eventoPendente({
        usuarioId:  'u-pending',
        eventoNome: 'Feira do Livro',
        local:      'Centro Cultural',
        dataInicio: '2025-06-01T10:00:00.000Z',
      });

      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.tipo).toBe('evento_pendente');
      expect(body.usuario_id).toBe('u-pending');
      expect(body.dados.evento_nome).toBe('Feira do Livro');
      expect(body.dados.local).toBe('Centro Cultural');
      // data_inicio deve ser string formatada (não o ISO original)
      expect(typeof body.dados.data_inicio).toBe('string');
      expect(body.dados.data_inicio).not.toBe('2025-06-01T10:00:00.000Z');
    });

    it('envia local: "" quando local não fornecido', async () => {
      await emailService.eventoPendente({ usuarioId: 'u1', eventoNome: 'Show' });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.dados.local).toBe('');
    });

    it('envia data_inicio: "" quando dataInicio não fornecido', async () => {
      await emailService.eventoPendente({ usuarioId: 'u1', eventoNome: 'Show' });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.dados.data_inicio).toBe('');
    });

    it('inclui idempotency_key baseado em usuarioId + 20 chars do nome', async () => {
      const nome = 'Evento Muito Longo para Truncar';
      await emailService.eventoPendente({ usuarioId: 'u-idem', eventoNome: nome });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.idempotency_key).toBe(`pendente-u-idem-${nome.slice(0, 20)}`);
    });
  });

  // ── eventoAprovado ──
  describe('eventoAprovado()', () => {
    it('envia tipo evento_aprovado com usuario_id e dados corretos', async () => {
      await emailService.eventoAprovado({
        usuarioId: 'u-aprov', eventoNome: 'Palestra Tech', local: 'Auditório',
      });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.tipo).toBe('evento_aprovado');
      expect(body.usuario_id).toBe('u-aprov');
      expect(body.dados.evento_nome).toBe('Palestra Tech');
    });

    it('idempotency_key tem prefixo "aprovado-"', async () => {
      await emailService.eventoAprovado({ usuarioId: 'u1', eventoNome: 'Evento' });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.idempotency_key).toMatch(/^aprovado-/);
    });
  });

  // ── eventoRejeitado ──
  describe('eventoRejeitado()', () => {
    it('envia tipo evento_rejeitado com motivo no dados', async () => {
      await emailService.eventoRejeitado({
        usuarioId: 'u-rej', eventoNome: 'Sorteio', motivo: 'Conteúdo comercial não permitido',
      });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.tipo).toBe('evento_rejeitado');
      expect(body.dados.motivo).toBe('Conteúdo comercial não permitido');
      expect(body.dados.evento_nome).toBe('Sorteio');
    });

    it('idempotency_key tem prefixo "rejeitado-"', async () => {
      await emailService.eventoRejeitado({ usuarioId: 'u1', eventoNome: 'E', motivo: 'M' });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.idempotency_key).toMatch(/^rejeitado-/);
    });
  });

  // ── pagamentoConfirmado ──
  describe('pagamentoConfirmado()', () => {
    it('envia tipo pagamento_confirmado com todos os dados obrigatórios', async () => {
      await emailService.pagamentoConfirmado({
        usuarioId: 'u-pag', planoNome: 'Pro', valor: 'R$ 49,90',
        validade: '2026-01-01', metodo: 'PIX', idExterno: 'pix-abc123',
      });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.tipo).toBe('pagamento_confirmado');
      expect(body.usuario_id).toBe('u-pag');
      expect(body.dados.plano_nome).toBe('Pro');
      expect(body.dados.valor).toBe('R$ 49,90');
      expect(body.dados.validade).toBe('2026-01-01');
      expect(body.dados.metodo).toBe('PIX');
      expect(body.dados.id_externo).toBe('pix-abc123');
    });

    it('envia metodo: "" quando não fornecido', async () => {
      await emailService.pagamentoConfirmado({
        usuarioId: 'u1', planoNome: 'Basic', valor: 'R$ 0', validade: '2025-12-01',
      });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.dados.metodo).toBe('');
    });

    it('envia id_externo: "" quando idExterno não fornecido', async () => {
      await emailService.pagamentoConfirmado({
        usuarioId: 'u1', planoNome: 'Basic', valor: 'R$ 0', validade: '2025-12-01',
      });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.dados.id_externo).toBe('');
    });

    it('idempotency_key contém idExterno quando fornecido', async () => {
      await emailService.pagamentoConfirmado({
        usuarioId: 'u1', planoNome: 'Pro', valor: 'R$ 49', validade: '2026',
        idExterno: 'ext-999',
      });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.idempotency_key).toMatch(/ext-999/);
    });

    it('idempotency_key contém usuarioId quando idExterno não fornecido', async () => {
      await emailService.pagamentoConfirmado({
        usuarioId: 'u-sem-ext', planoNome: 'Pro', valor: 'R$ 49', validade: '2026',
      });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.idempotency_key).toMatch(/u-sem-ext/);
    });
  });

  // ── alertaDenuncia ──
  describe('alertaDenuncia()', () => {
    it('envia tipo alerta_denuncia para o adminEmail', async () => {
      await emailService.alertaDenuncia({
        adminEmail: 'admin@agora.app',
        tipo: 'spam',
        motivo: 'Publicidade excessiva',
        alvoId: 'ev-123',
      });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.tipo).toBe('alerta_denuncia');
      expect(body.para).toBe('admin@agora.app');
      expect(body.dados.tipo).toBe('spam');
      expect(body.dados.motivo).toBe('Publicidade excessiva');
      expect(body.dados.alvo_id).toBe('ev-123');
    });

    it('envia nome: "Administrador" quando adminNome não fornecido', async () => {
      await emailService.alertaDenuncia({
        adminEmail: 'admin@agora.app', tipo: 'spam', motivo: 'M', alvoId: 'id-1',
      });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.nome).toBe('Administrador');
    });

    it('usa adminNome quando fornecido', async () => {
      await emailService.alertaDenuncia({
        adminEmail: 'admin@agora.app', adminNome: 'Gestor AGORA',
        tipo: 'violencia', motivo: 'M', alvoId: 'id-2',
      });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.nome).toBe('Gestor AGORA');
    });
  });

  // ── novaMensagem ──
  describe('novaMensagem()', () => {
    it('envia tipo nova_mensagem com remetente_nome e preview', async () => {
      await emailService.novaMensagem({
        usuarioId: 'u-msg', remetenteNome: 'Pedro', preview: 'Olá, tudo bem?',
      });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.tipo).toBe('nova_mensagem');
      expect(body.usuario_id).toBe('u-msg');
      expect(body.dados.remetente_nome).toBe('Pedro');
      expect(body.dados.preview).toBe('Olá, tudo bem?');
    });

    it('trunca preview para 120 caracteres', async () => {
      const preview = 'A'.repeat(200);
      await emailService.novaMensagem({ usuarioId: 'u1', remetenteNome: 'X', preview });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.dados.preview.length).toBe(120);
      expect(body.dados.preview).toBe('A'.repeat(120));
    });

    it('preview com menos de 120 chars não é truncado', async () => {
      const preview = 'Mensagem curta';
      await emailService.novaMensagem({ usuarioId: 'u1', remetenteNome: 'X', preview });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.dados.preview).toBe(preview);
    });

    it('idempotency_key contém usuarioId', async () => {
      await emailService.novaMensagem({ usuarioId: 'u-idem', remetenteNome: 'Y', preview: 'z' });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.idempotency_key).toMatch(/u-idem/);
    });
  });

  // ── senhaRedefinida ──
  describe('senhaRedefinida()', () => {
    it('envia tipo senha_redefinida com para e nome', async () => {
      await emailService.senhaRedefinida({ para: 'sec@agora.app', nome: 'Mariana' });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.tipo).toBe('senha_redefinida');
      expect(body.para).toBe('sec@agora.app');
      expect(body.nome).toBe('Mariana');
    });

    it('inclui idempotency_key com o email do destinatário', async () => {
      await emailService.senhaRedefinida({ para: 'seguranca@teste.com', nome: 'A' });
      const body = mockInvoke.mock.calls[0][1].body;
      expect(body.idempotency_key).toMatch(/seguranca@teste\.com/);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. fmtData() — testada indiretamente via eventoPendente/eventoAprovado
// ─────────────────────────────────────────────────────────────────────────────
describe('fmtData() — formatação de data (via eventoPendente)', () => {
  let emailService: typeof import('@/services/email')['emailService'];
  let mockInvoke: jest.Mock;

  beforeEach(() => {
    mockInvoke = jest.fn().mockResolvedValue({ error: null });
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    jest.isolateModules(() => {
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: true,
        supabase: { functions: { invoke: mockInvoke } },
      }));
      emailService = require('@/services/email').emailService;
    });
  });

  it('string vazia quando dataInicio é undefined', async () => {
    await emailService.eventoPendente({ usuarioId: 'u1', eventoNome: 'E' });
    const body = mockInvoke.mock.calls[0][1].body;
    expect(body.dados.data_inicio).toBe('');
  });

  it('data ISO válida é convertida para string não-vazia', async () => {
    await emailService.eventoPendente({
      usuarioId: 'u1', eventoNome: 'E',
      dataInicio: '2025-07-20T20:00:00.000Z',
    });
    const body = mockInvoke.mock.calls[0][1].body;
    expect(body.dados.data_inicio).not.toBe('');
    expect(body.dados.data_inicio).not.toBe('2025-07-20T20:00:00.000Z');
  });

  it('data ISO inválida retorna uma string (não lança exceção)', async () => {
    // V8 não lança em toLocaleString com Invalid Date — retorna 'Invalid Date'
    // O catch protege ambientes que lançam. Em ambos os casos: resultado é string.
    const invalida = 'nao-e-uma-data';
    await emailService.eventoPendente({
      usuarioId: 'u1', eventoNome: 'E', dataInicio: invalida,
    });
    const body = mockInvoke.mock.calls[0][1].body;
    expect(typeof body.dados.data_inicio).toBe('string');
    expect(body.dados.data_inicio.length).toBeGreaterThan(0);
  });
});
