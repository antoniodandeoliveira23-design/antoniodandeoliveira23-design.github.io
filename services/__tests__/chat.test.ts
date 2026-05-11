/**
 * services/__tests__/chat.test.ts
 *
 * Cobertura de chatService: formatarHora, listarConversas, criarOuObterConversa,
 * listarMensagens, enviarMensagem, marcarLidas, contarNaoLidas, subscribe*, unsubscribe.
 */

// ── Helpers ────────────────────────────────────────────────────────────────

function makeBuilder(resolved: unknown) {
  const p = Promise.resolve(resolved);
  const b: any = { then: p.then.bind(p), catch: p.catch.bind(p) };
  ['select','eq','order','limit','update','insert','range','single',
   'neq','in','contains'].forEach(m => { b[m] = () => b; });
  return b;
}

// ── Mock state ─────────────────────────────────────────────────────────────

let mockAnalisar: jest.Mock;
let mockRegistrarAcao: jest.Mock;
let mockRegistrarAnomalia: jest.Mock;
let mockEmailNovaMensagem: jest.Mock;
let mockFrom: jest.Mock;
let mockFunctionsInvoke: jest.Mock;
let mockChannel: jest.Mock;
let mockRemoveChannel: jest.Mock;
let mockChannelInstance: any;

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/services/supabase', () => ({
  get supabaseConfigured() { return (global as any).__supabaseConfigured ?? false; },
  get supabase() {
    return {
      from:          (...a: unknown[]) => mockFrom(...a),
      channel:       (...a: unknown[]) => mockChannel(...a),
      removeChannel: (...a: unknown[]) => mockRemoveChannel(...a),
      functions:     { invoke: (...a: unknown[]) => mockFunctionsInvoke(...a) },
    };
  },
}));

jest.mock('@/services/validacao-semantica', () => ({
  get validacaoSemantica() {
    return { analisar: mockAnalisar };
  },
}));

jest.mock('@/services/auditoria', () => ({
  get registrarAcao()    { return mockRegistrarAcao; },
  get registrarAnomalia(){ return mockRegistrarAnomalia; },
}));

jest.mock('@/services/email', () => ({
  get emailService() {
    return { novaMensagem: mockEmailNovaMensagem };
  },
}));

// ── beforeEach ─────────────────────────────────────────────────────────────

beforeEach(() => {
  mockAnalisar         = jest.fn().mockReturnValue({ bloqueado: false, score: 0 });
  mockRegistrarAcao    = jest.fn().mockResolvedValue(undefined);
  mockRegistrarAnomalia = jest.fn().mockResolvedValue(undefined);
  mockEmailNovaMensagem = jest.fn();
  mockFrom             = jest.fn();
  mockFunctionsInvoke  = jest.fn().mockResolvedValue({ data: null, error: null });
  mockRemoveChannel    = jest.fn().mockResolvedValue(undefined);
  mockChannelInstance  = { on: jest.fn().mockReturnThis(), subscribe: jest.fn().mockReturnThis() };
  mockChannel          = jest.fn().mockReturnValue(mockChannelInstance);
});

// ── formatarHora ───────────────────────────────────────────────────────────

describe('chatService.formatarHora()', () => {
  let chatService: typeof import('@/services/chat')['chatService'];

  beforeEach(() => {
    (global as any).__supabaseConfigured = false;
    jest.isolateModules(() => { chatService = require('@/services/chat').chatService; });
  });

  it('retorna HH:MM para mensagem de hoje', () => {
    const agora = new Date(Date.now() - 30 * 60_000).toISOString();
    const result = chatService.formatarHora(agora);
    // Formato HH:MM contém dois ':' ou um ':'
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it('retorna "Ontem" para mensagem de ontem (~25h atrás)', () => {
    const ontem = new Date(Date.now() - 25 * 3600_000).toISOString();
    const result = chatService.formatarHora(ontem);
    expect(result).toBe('Ontem');
  });

  it('retorna abreviação do dia da semana para 3 dias atrás', () => {
    const tresDias = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const result = chatService.formatarHora(tresDias);
    // Deve ser nome curto do dia (seg., ter., etc.)
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe('Ontem');
  });

  it('retorna DD/MM para mensagem de mais de 7 dias atrás', () => {
    const antigo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const result = chatService.formatarHora(antigo);
    expect(result).toMatch(/^\d{2}\/\d{2}$/);
  });
});

// ── DEMO ───────────────────────────────────────────────────────────────────

describe('chatService — modo demo (supabaseConfigured = false)', () => {
  let chatService: typeof import('@/services/chat')['chatService'];

  beforeEach(() => {
    (global as any).__supabaseConfigured = false;
    jest.isolateModules(() => { chatService = require('@/services/chat').chatService; });
  });

  // listarConversas
  describe('listarConversas()', () => {
    it('retorna 3 conversas para usuário "demo"', async () => {
      const convs = await chatService.listarConversas('demo');
      expect(convs).toHaveLength(3);
    });

    it('inclui contagem de mensagens não lidas', async () => {
      const convs = await chatService.listarConversas('demo');
      const c1 = convs.find(c => c.id === 'c1');
      expect(c1?.naoLidas).toBe(1); // m3 está lida=false e autor é demo-pj
    });

    it('ordena por atualizado_em desc (mais recente primeiro)', async () => {
      const convs = await chatService.listarConversas('demo');
      for (let i = 1; i < convs.length; i++) {
        expect(new Date(convs[i - 1].atualizado_em).getTime())
          .toBeGreaterThanOrEqual(new Date(convs[i].atualizado_em).getTime());
      }
    });
  });

  // criarOuObterConversa
  describe('criarOuObterConversa()', () => {
    it('retorna id de conversa existente sem criar nova', async () => {
      const id = await chatService.criarOuObterConversa('demo', 'demo-pj');
      expect(id).toBe('c1');
    });

    it('cria nova conversa quando não existe entre os participantes', async () => {
      const id = await chatService.criarOuObterConversa('demo', 'novo-user');
      expect(typeof id).toBe('string');
      expect(id.startsWith('c-')).toBe(true);
    });

    it('nova conversa aparece em listarConversas', async () => {
      await chatService.criarOuObterConversa('demo', 'novo-user-2');
      const convs = await chatService.listarConversas('demo');
      expect(convs.length).toBeGreaterThan(3);
    });
  });

  // listarMensagens
  describe('listarMensagens()', () => {
    it('retorna mensagens da conversa c1', async () => {
      const msgs = await chatService.listarMensagens('c1');
      expect(msgs.length).toBeGreaterThan(0);
      msgs.forEach(m => expect(m.conversa_id).toBe('c1'));
    });

    it('retorna array vazio para conversa inexistente', async () => {
      const msgs = await chatService.listarMensagens('nao-existe');
      expect(msgs).toEqual([]);
    });
  });

  // enviarMensagem
  describe('enviarMensagem()', () => {
    it('lança quando validação semântica bloqueia mensagem', async () => {
      mockAnalisar.mockReturnValue({ bloqueado: true, motivo: 'SPAM', score: 0.9 });
      await expect(chatService.enviarMensagem('c1', 'Compre agora!', 'demo')).rejects.toThrow('SPAM');
      expect(mockRegistrarAnomalia).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'conteudo_suspeito' }));
    });

    it('retorna MensagemComAutor após envio bem-sucedido', async () => {
      const msg = await chatService.enviarMensagem('c1', 'Olá!', 'demo');
      expect(msg.texto).toBe('Olá!');
      expect(msg.autor_id).toBe('demo');
    });

    it('trim no texto antes de enviar', async () => {
      const msg = await chatService.enviarMensagem('c1', '  Texto com espaços  ', 'demo');
      expect(msg.texto).toBe('Texto com espaços');
    });

    it('adiciona mensagem ao histórico da conversa', async () => {
      await chatService.enviarMensagem('c1', 'Nova msg', 'demo');
      const msgs = await chatService.listarMensagens('c1');
      expect(msgs.some(m => m.texto === 'Nova msg')).toBe(true);
    });
  });

  // marcarLidas
  describe('marcarLidas()', () => {
    it('marca mensagens de outros como lidas', async () => {
      // c1 tem m3 não lida de demo-pj
      await chatService.marcarLidas('c1', 'demo');
      const msgs = await chatService.listarMensagens('c1');
      const naoLidasDeOutros = msgs.filter(m => !m.lida && m.autor_id !== 'demo');
      expect(naoLidasDeOutros).toHaveLength(0);
    });

    it('resolve sem lançar para conversa inexistente', async () => {
      await expect(chatService.marcarLidas('nao-existe', 'demo')).resolves.toBeUndefined();
    });
  });

  // contarNaoLidas
  describe('contarNaoLidas()', () => {
    it('retorna contagem correta de não lidas para "demo"', async () => {
      const total = await chatService.contarNaoLidas('demo');
      expect(typeof total).toBe('number');
      expect(total).toBeGreaterThanOrEqual(1); // m3 não lida
    });
  });

  // subscribeConversa / subscribeConversas
  describe('subscribe*()', () => {
    it('subscribeConversa() retorna null em modo demo', () => {
      const ch = chatService.subscribeConversa('c1', jest.fn());
      expect(ch).toBeNull();
    });

    it('subscribeConversas() retorna null em modo demo', () => {
      const ch = chatService.subscribeConversas('demo', ['c1'], jest.fn());
      expect(ch).toBeNull();
    });
  });

  // unsubscribe
  describe('unsubscribe()', () => {
    it('resolve sem lançar quando channel é null', async () => {
      await expect(chatService.unsubscribe(null)).resolves.toBeUndefined();
    });
  });
});

// ── CONFIGURADO ────────────────────────────────────────────────────────────

describe('chatService — modo configurado (supabaseConfigured = true)', () => {
  let chatService: typeof import('@/services/chat')['chatService'];

  beforeEach(() => {
    (global as any).__supabaseConfigured = true;
    jest.isolateModules(() => { chatService = require('@/services/chat').chatService; });
  });

  // listarConversas
  describe('listarConversas()', () => {
    it('busca conversas e perfis e conta não lidas', async () => {
      const conversasData = [{ id: 'c1', participante_ids: ['usr-test', 'other'], ultima_mensagem: 'Hi', atualizado_em: new Date().toISOString() }];
      mockFrom.mockImplementation((table: string) => {
        if (table === 'conversas') return makeBuilder({ data: conversasData, error: null });
        if (table === 'profiles')  return makeBuilder({ data: { id: 'other', nome: 'Outro', sobrenome: '', avatar_url: null, username: 'other' }, error: null });
        if (table === 'mensagens') return makeBuilder({ count: 2, error: null });
        return makeBuilder({ data: null, error: null });
      });

      const res = await chatService.listarConversas('usr-test');
      expect(res).toHaveLength(1);
      expect(res[0].naoLidas).toBe(2);
    });

    it('lança quando supabase retorna error', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'DB error' } }));
      await expect(chatService.listarConversas('usr-test')).rejects.toThrow('DB error');
    });
  });

  // criarOuObterConversa
  describe('criarOuObterConversa()', () => {
    it('retorna id de conversa existente (2 participantes)', async () => {
      const existente = { id: 'c-existing', participante_ids: ['usr-test', 'other'] };
      mockFrom.mockReturnValue(makeBuilder({ data: [existente], error: null }));
      const id = await chatService.criarOuObterConversa('usr-test', 'other');
      expect(id).toBe('c-existing');
    });

    it('cria nova quando não existe e retorna id', async () => {
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: [], error: null }))  // contains query
        .mockReturnValueOnce(makeBuilder({ data: { id: 'c-new' }, error: null })); // insert
      const id = await chatService.criarOuObterConversa('usr-test', 'other');
      expect(id).toBe('c-new');
    });

    it('lança quando insert retorna error', async () => {
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: [], error: null }))
        .mockReturnValueOnce(makeBuilder({ data: null, error: { message: 'insert fail' } }));
      await expect(chatService.criarOuObterConversa('usr-test', 'other')).rejects.toThrow('insert fail');
    });
  });

  // listarMensagens
  describe('listarMensagens()', () => {
    it('retorna mensagens em ordem cronológica (reverse)', async () => {
      const msgs = [
        { id: 'm2', conversa_id: 'c1', autor_id: 'a', texto: 'B', lida: true, criado_em: '2026-01-02' },
        { id: 'm1', conversa_id: 'c1', autor_id: 'b', texto: 'A', lida: true, criado_em: '2026-01-01' },
      ];
      mockFrom.mockReturnValue(makeBuilder({ data: msgs, error: null }));
      const res = await chatService.listarMensagens('c1');
      // reversed: m1 first, m2 second
      expect(res[0].id).toBe('m1');
      expect(res[1].id).toBe('m2');
    });

    it('lança quando supabase retorna error', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'msgs fail' } }));
      await expect(chatService.listarMensagens('c1')).rejects.toThrow('msgs fail');
    });
  });

  // enviarMensagem
  describe('enviarMensagem()', () => {
    it('lança quando análise semântica bloqueia', async () => {
      mockAnalisar.mockReturnValue({ bloqueado: true, motivo: 'OFENSIVO', score: 1 });
      await expect(chatService.enviarMensagem('c1', 'palavrão', 'usr')).rejects.toThrow('OFENSIVO');
    });

    it('retorna mensagem inserida em caso de sucesso', async () => {
      const novaMensagem = { id: 'm-new', conversa_id: 'c1', autor_id: 'usr', texto: 'Oi', lida: false, criado_em: new Date().toISOString() };
      // 1ª call: insert.select.single → mensagem
      // Fire-and-forget: chamadas subsequentes retornam null para curto-circuitar guard (!conv)
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: novaMensagem, error: null }))
        .mockReturnValue(makeBuilder({ data: null, error: null }));
      const res = await chatService.enviarMensagem('c1', 'Oi', 'usr');
      expect(res.id).toBe('m-new');
      // Aguarda microtasks do fire-and-forget para garantir que não há exceções
      await new Promise(r => setTimeout(r, 0));
    });

    it('lança e registra falha quando insert retorna error', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'insert fail' } }));
      await expect(chatService.enviarMensagem('c1', 'Oi', 'usr')).rejects.toThrow('insert fail');
      expect(mockRegistrarAcao).toHaveBeenCalledWith(expect.objectContaining({ acao: 'mensagem_falha' }));
    });
  });

  // marcarLidas
  describe('marcarLidas()', () => {
    it('chama from("mensagens").update.eq.neq.eq e resolve', async () => {
      mockFrom.mockReturnValue(makeBuilder({ error: null }));
      await chatService.marcarLidas('c1', 'usr-test');
      expect(mockFrom).toHaveBeenCalledWith('mensagens');
    });
  });

  // contarNaoLidas
  describe('contarNaoLidas()', () => {
    it('retorna 0 quando não há conversas', async () => {
      mockFrom.mockReturnValue(makeBuilder({ data: [], error: null }));
      expect(await chatService.contarNaoLidas('usr-test')).toBe(0);
    });

    it('retorna count do banco quando há conversas', async () => {
      mockFrom
        .mockReturnValueOnce(makeBuilder({ data: [{ id: 'c1' }, { id: 'c2' }], error: null }))
        .mockReturnValueOnce(makeBuilder({ count: 5, error: null }));
      expect(await chatService.contarNaoLidas('usr-test')).toBe(5);
    });
  });

  // subscribeConversa
  describe('subscribeConversa()', () => {
    it('chama supabase.channel e retorna canal', () => {
      const ch = chatService.subscribeConversa('c1', jest.fn());
      expect(mockChannel).toHaveBeenCalledWith('chat:c1');
      expect(mockChannelInstance.on).toHaveBeenCalled();
      expect(mockChannelInstance.subscribe).toHaveBeenCalled();
      expect(ch).toBe(mockChannelInstance);
    });
  });

  // subscribeConversas
  describe('subscribeConversas()', () => {
    it('retorna null quando conversaIds está vazio', () => {
      const ch = chatService.subscribeConversas('usr', [], jest.fn());
      expect(ch).toBeNull();
    });

    it('chama supabase.channel e retorna canal quando há ids', () => {
      const ch = chatService.subscribeConversas('usr', ['c1', 'c2'], jest.fn());
      expect(mockChannel).toHaveBeenCalledWith('user-chat:usr');
      expect(ch).toBe(mockChannelInstance);
    });
  });

  // unsubscribe
  describe('unsubscribe()', () => {
    it('chama supabase.removeChannel quando canal é fornecido', async () => {
      const fakeChannel = {} as any;
      await chatService.unsubscribe(fakeChannel);
      expect(mockRemoveChannel).toHaveBeenCalledWith(fakeChannel);
    });
  });
});

// ── Tipos exportados ──────────────────────────────────────────────────────

describe('tipos exportados', () => {
  it('chatService está disponível', () => {
    const mod = require('@/services/chat');
    expect(mod.chatService).toBeDefined();
  });
});
