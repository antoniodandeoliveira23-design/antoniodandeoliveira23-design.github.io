/**
 * services/__tests__/seguranca.test.ts
 *
 * Testes unitários completos — services/seguranca.ts
 *
 * Cobertura:
 *   storageSeguro   → set, get, remove, limparTudo
 *   sanitizador     → texto, objeto, url
 *   rateLimiter     → verificar, tempoRestante, resetar
 *   validarSenha    → todos os critérios + força + erros
 *   sessionGuard    → iniciar, parar, reset de timer por atividade
 *   formatarCNPJ    → máscara progressiva + truncamento
 *   validarCNPJ     → dígitos verificadores + casos inválidos
 *   CSP_POLICY      → diretivas de segurança obrigatórias
 *
 * FIRST:
 *   Fast        — zero I/O externo; timers controlados via jest.useFakeTimers()
 *   Isolated    — beforeEach reseta sessionStorage, rateLimiter e sessionGuard
 *   Repeatable  — Date.now() fixado via fakeTimers onde relevante
 *   Self-valid  — toda assertion é explícita; nenhum teste passa sem falhar se a lógica mudar
 *   Timely      — escritos junto à primeira auditoria do módulo
 */

import {
  storageSeguro,
  sanitizador,
  rateLimiter,
  validarSenha,
  sessionGuard,
  formatarCNPJ,
  validarCNPJ,
  CSP_POLICY,
  type ResultadoSenha,
  type ResultadoCNPJ,
} from '../seguranca';

// ─────────────────────────────────────────────────────────────────
// CNPJ real válido usado nos testes (dígitos verificadores corretos)
// Verificação: 11.222.333/0001-81
// ─────────────────────────────────────────────────────────────────
const CNPJ_VALIDO_FORMATADO  = '11.222.333/0001-81';
const CNPJ_VALIDO_NUMEROS    = '11222333000181';
const CNPJ_INVALIDO_NUMEROS  = '11222333000180'; // último dígito errado (0 em vez de 1)
const CNPJ_TODOS_IGUAIS      = '00000000000000';
const CNPJ_CURTO             = '1122233300018';  // 13 dígitos

// ─────────────────────────────────────────────────────────────────
// Chaves de teste para rateLimiter — namespace exclusivo por grupo
// Evita contaminação entre describes sem depender de resetar()
// ─────────────────────────────────────────────────────────────────
const RL = {
  verificar:    'rl-verificar@agora.test',
  tempo:        'rl-tempo@agora.test',
  resetar:      'rl-resetar@agora.test',
  isolamento:   'rl-isolamento@agora.test',
  outraChave:   'rl-outra@agora.test',
};

// ─────────────────────────────────────────────────────────────────
// SETUP GLOBAL
// ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  sessionStorage.clear();
  sessionGuard.parar();

  // Reseta todas as chaves de teste do rateLimiter
  const acoes = ['login', 'cadastro', 'criar_evento', 'denuncia', 'recuperar_senha'];
  const chaves = Object.values(RL);
  acoes.forEach(acao => chaves.forEach(chave => rateLimiter.resetar(acao, chave)));
});

afterEach(() => {
  sessionGuard.parar();
  jest.useRealTimers();
});

// ═════════════════════════════════════════════════════════════════
// 1. storageSeguro
// ═════════════════════════════════════════════════════════════════

describe('storageSeguro', () => {

  // ── .set() ──────────────────────────────────────────────────

  describe('.set()', () => {
    it('persiste valor com chave agoraDemoLoggedIn', () => {
      storageSeguro.set('agoraDemoLoggedIn', 'true');
      expect(sessionStorage.getItem('agoraDemoLoggedIn')).toBe('true');
    });

    it('persiste valor com chave agoraDemoTipo', () => {
      storageSeguro.set('agoraDemoTipo', 'pj');
      expect(sessionStorage.getItem('agoraDemoTipo')).toBe('pj');
    });

    it('sobrescreve valor existente com nova chamada', () => {
      storageSeguro.set('agoraDemoTipo', 'pf');
      storageSeguro.set('agoraDemoTipo', 'gov');
      expect(sessionStorage.getItem('agoraDemoTipo')).toBe('gov');
    });

    it('não lança exceção quando sessionStorage está cheio (simulado)', () => {
      const original = sessionStorage.setItem.bind(sessionStorage);
      jest.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
        throw new DOMException('QuotaExceededError');
      });
      expect(() => storageSeguro.set('agoraDemoLoggedIn', 'true')).not.toThrow();
      jest.restoreAllMocks();
    });
  });

  // ── .get() ──────────────────────────────────────────────────

  describe('.get()', () => {
    it('retorna null para chave não definida', () => {
      expect(storageSeguro.get('agoraDemoLoggedIn')).toBeNull();
    });

    it('retorna o valor armazenado após set()', () => {
      storageSeguro.set('agoraDemoLoggedIn', 'true');
      expect(storageSeguro.get('agoraDemoLoggedIn')).toBe('true');
    });

    it('retorna null quando sessionStorage lança exceção', () => {
      jest.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
        throw new Error('SecurityError');
      });
      expect(storageSeguro.get('agoraDemoLoggedIn')).toBeNull();
      jest.restoreAllMocks();
    });
  });

  // ── .remove() ───────────────────────────────────────────────

  describe('.remove()', () => {
    it('remove chave existente — get() passa a retornar null', () => {
      storageSeguro.set('agoraDemoLoggedIn', 'true');
      storageSeguro.remove('agoraDemoLoggedIn');
      expect(storageSeguro.get('agoraDemoLoggedIn')).toBeNull();
    });

    it('não lança exceção ao remover chave inexistente', () => {
      expect(() => storageSeguro.remove('agoraDemoLoggedIn')).not.toThrow();
    });

    it('remove apenas a chave especificada, não as demais', () => {
      storageSeguro.set('agoraDemoLoggedIn', 'true');
      storageSeguro.set('agoraDemoTipo', 'pf');
      storageSeguro.remove('agoraDemoLoggedIn');
      expect(storageSeguro.get('agoraDemoTipo')).toBe('pf');
    });
  });

  // ── .limparTudo() ────────────────────────────────────────────

  describe('.limparTudo()', () => {
    it('remove todas as chaves de sessão', () => {
      storageSeguro.set('agoraDemoLoggedIn', 'true');
      storageSeguro.set('agoraDemoTipo', 'admin');
      storageSeguro.limparTudo();
      expect(storageSeguro.get('agoraDemoLoggedIn')).toBeNull();
      expect(storageSeguro.get('agoraDemoTipo')).toBeNull();
    });

    it('não lança exceção quando sessionStorage está vazio', () => {
      expect(() => storageSeguro.limparTudo()).not.toThrow();
    });
  });
});

// ═════════════════════════════════════════════════════════════════
// 2. sanitizador
// ═════════════════════════════════════════════════════════════════

describe('sanitizador', () => {

  // ── .texto() ────────────────────────────────────────────────

  describe('.texto()', () => {
    it('retorna string vazia para valor vazio', () => {
      expect(sanitizador.texto('')).toBe('');
    });

    it('retorna string vazia para valor não-string (null runtime)', () => {
      // @ts-expect-error — testando segurança em runtime
      expect(sanitizador.texto(null)).toBe('');
    });

    it('retorna string vazia para valor não-string (number runtime)', () => {
      // @ts-expect-error
      expect(sanitizador.texto(42)).toBe('');
    });

    it('remove tag <script>...</script> completa', () => {
      expect(sanitizador.texto('<script>alert("xss")</script>')).toBe('');
    });

    it('remove tag <script> com atributos e conteúdo multiline', () => {
      expect(sanitizador.texto('<script type="text/javascript">\nalert(1)\n</script>')).toBe('');
    });

    it('remove tag <iframe>...</iframe>', () => {
      expect(sanitizador.texto('<iframe src="https://evil.com"></iframe>')).toBe('');
    });

    it('remove protocolo javascript:', () => {
      const resultado = sanitizador.texto('javascript:alert(1)');
      expect(resultado).not.toContain('javascript:');
    });

    it('remove atributo onclick="..."', () => {
      const resultado = sanitizador.texto('<button onclick="evil()">Clique</button>');
      expect(resultado).not.toContain('onclick');
      expect(resultado).not.toContain('<button');
    });

    it('remove atributo onload="..."', () => {
      const resultado = sanitizador.texto('<img src=x onload="alert(1)">');
      expect(resultado).not.toContain('onload');
    });

    it('remove qualquer tag HTML genérica', () => {
      expect(sanitizador.texto('<b>negrito</b>')).toBe('negrito');
    });

    it('remove tag HTML com atributos', () => {
      expect(sanitizador.texto('<a href="https://evil.com">link</a>')).toBe('link');
    });

    it('preserva texto simples sem HTML', () => {
      expect(sanitizador.texto('Festival de Música em Vilhena')).toBe('Festival de Música em Vilhena');
    });

    it('remove espaços extras nas bordas (trim)', () => {
      expect(sanitizador.texto('  texto com espaços  ')).toBe('texto com espaços');
    });

    it('remove &lt;script encoded', () => {
      const resultado = sanitizador.texto('&lt;script>alert(1)');
      expect(resultado).not.toContain('&lt;script');
    });

    it('preserva texto com números e caracteres especiais não-HTML', () => {
      expect(sanitizador.texto('Ingresso R$ 50,00 — 100% confirmado!')).toBe(
        'Ingresso R$ 50,00 — 100% confirmado!'
      );
    });
  });

  // ── .objeto() ───────────────────────────────────────────────

  describe('.objeto()', () => {
    it('sanitiza campos string dentro do objeto', () => {
      const resultado = sanitizador.objeto({ nome: '<script>evil</script>', bio: 'texto normal' });
      expect(resultado.nome).toBe('');
      expect(resultado.bio).toBe('texto normal');
    });

    it('preserva campos numéricos sem alteração', () => {
      const resultado = sanitizador.objeto({ nome: 'João', idade: 30 });
      expect(resultado.idade).toBe(30);
    });

    it('preserva campos booleanos sem alteração', () => {
      const resultado = sanitizador.objeto({ ativo: true, nome: 'Maria' });
      expect(resultado.ativo).toBe(true);
    });

    it('preserva campos null sem alteração', () => {
      const resultado = sanitizador.objeto({ avatar: null, nome: 'Ana' });
      expect(resultado.avatar).toBeNull();
    });

    it('sanitiza objetos aninhados recursivamente', () => {
      const entrada = { usuario: { nome: '<b>hacker</b>', email: 'ok@test.com' } };
      const resultado = sanitizador.objeto(entrada);
      expect(resultado.usuario.nome).toBe('hacker');
      expect(resultado.usuario.email).toBe('ok@test.com');
    });

    it('NÃO muta o objeto original', () => {
      const original = { nome: '<script>evil</script>' };
      const snapshot = original.nome;
      sanitizador.objeto(original);
      expect(original.nome).toBe(snapshot); // original intacto
    });

    it('retorna novo objeto, não o mesmo por referência', () => {
      const original = { nome: 'João' };
      const resultado = sanitizador.objeto(original);
      expect(resultado).not.toBe(original); // referências diferentes
    });
  });

  // ── .url() ──────────────────────────────────────────────────

  describe('.url()', () => {
    it('retorna string vazia para valor vazio', () => {
      expect(sanitizador.url('')).toBe('');
    });

    it('retorna string vazia para protocolo javascript:', () => {
      expect(sanitizador.url('javascript:alert(1)')).toBe('');
    });

    it('retorna string vazia para protocolo ftp:', () => {
      expect(sanitizador.url('ftp://files.evil.com')).toBe('');
    });

    it('retorna string vazia para URL inválida', () => {
      expect(sanitizador.url('nao-e-uma-url')).toBe('');
    });

    it('retorna URL completa para protocolo http:', () => {
      const url = 'http://agora.app/evento/123';
      expect(sanitizador.url(url)).toBe(url);
    });

    it('retorna URL completa para protocolo https:', () => {
      const url = 'https://agora-vilhena.vercel.app/evento/123';
      expect(sanitizador.url(url)).toBe(url);
    });

    it('retorna string vazia para protocolo data: (bypass de XSS)', () => {
      expect(sanitizador.url('data:text/html,<script>alert(1)</script>')).toBe('');
    });
  });
});

// ═════════════════════════════════════════════════════════════════
// 3. rateLimiter
// ═════════════════════════════════════════════════════════════════

describe('rateLimiter', () => {

  beforeEach(() => {
    jest.useFakeTimers();
  });

  // ── .verificar() ────────────────────────────────────────────

  describe('.verificar()', () => {
    it('permite ação desconhecida (não presente em CONFIGS)', () => {
      expect(rateLimiter.verificar('acao_inexistente', RL.verificar)).toBe(true);
    });

    it('permite primeira tentativa de login', () => {
      expect(rateLimiter.verificar('login', RL.verificar)).toBe(true);
    });

    it('permite até maxTentativas (5) para login', () => {
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.verificar('login', RL.verificar)).toBe(true);
      }
    });

    it('bloqueia na tentativa maxTentativas + 1 (6ª tentativa de login)', () => {
      for (let i = 0; i < 5; i++) rateLimiter.verificar('login', RL.verificar);
      expect(rateLimiter.verificar('login', RL.verificar)).toBe(false);
    });

    it('permanece bloqueado durante o período de bloqueio (15min para login)', () => {
      for (let i = 0; i <= 5; i++) rateLimiter.verificar('login', RL.verificar);
      // Avança 14min 59s — ainda dentro do bloqueio
      jest.advanceTimersByTime(14 * 60 * 1000 + 59_000);
      expect(rateLimiter.verificar('login', RL.verificar)).toBe(false);
    });

    it('libera acesso após bloqueio expirar (bloqueioMs = 15min)', () => {
      for (let i = 0; i <= 5; i++) rateLimiter.verificar('login', RL.verificar);
      // Avança 15min + 1ms — bloqueio expirou E janela também (5min < 15min)
      jest.advanceTimersByTime(15 * 60 * 1000 + 1);
      expect(rateLimiter.verificar('login', RL.verificar)).toBe(true);
    });

    it('reseta contagem quando janela de tempo (janelaMs) expira sem bloqueio', () => {
      // 3 tentativas — dentro do limite de 5
      for (let i = 0; i < 3; i++) rateLimiter.verificar('login', RL.verificar);
      // Avança além da janela (5min + 1ms)
      jest.advanceTimersByTime(5 * 60 * 1000 + 1);
      // Contagem reinicia: as próximas 5 devem passar
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.verificar('login', RL.verificar)).toBe(true);
      }
    });

    it('chaves diferentes não interferem entre si', () => {
      // Bloqueia a chave principal
      for (let i = 0; i <= 5; i++) rateLimiter.verificar('login', RL.verificar);
      // Chave diferente continua livre
      expect(rateLimiter.verificar('login', RL.outraChave)).toBe(true);
    });

    it('ações diferentes não interferem entre si (login vs cadastro)', () => {
      // Bloqueia login
      for (let i = 0; i <= 5; i++) rateLimiter.verificar('login', RL.verificar);
      // Cadastro usa CONFIGS.cadastro — limpo
      expect(rateLimiter.verificar('cadastro', RL.verificar)).toBe(true);
    });

    it('respeita maxTentativas específico por ação (cadastro = 3)', () => {
      for (let i = 0; i < 3; i++) rateLimiter.verificar('cadastro', RL.verificar);
      // 4ª tentativa excede o limite de 3
      expect(rateLimiter.verificar('cadastro', RL.verificar)).toBe(false);
    });
  });

  // ── .tempoRestante() ────────────────────────────────────────

  describe('.tempoRestante()', () => {
    it('retorna 0 quando não há estado de bloqueio', () => {
      expect(rateLimiter.tempoRestante('login', RL.tempo)).toBe(0);
    });

    it('retorna 0 após tentativas dentro do limite (sem bloqueio)', () => {
      for (let i = 0; i < 3; i++) rateLimiter.verificar('login', RL.tempo);
      expect(rateLimiter.tempoRestante('login', RL.tempo)).toBe(0);
    });

    it('retorna 900 segundos (15min) imediatamente após bloquear', () => {
      for (let i = 0; i <= 5; i++) rateLimiter.verificar('login', RL.tempo);
      // Com fakeTimers, Date.now() não avançou → bloqueadoAte - agora = 900_000ms
      expect(rateLimiter.tempoRestante('login', RL.tempo)).toBe(900);
    });

    it('decrementa corretamente após avançar 5 minutos', () => {
      for (let i = 0; i <= 5; i++) rateLimiter.verificar('login', RL.tempo);
      jest.advanceTimersByTime(5 * 60 * 1000); // avança 5min
      // Restam 10min = 600 segundos
      expect(rateLimiter.tempoRestante('login', RL.tempo)).toBe(600);
    });

    it('retorna 0 após o bloqueio expirar completamente', () => {
      for (let i = 0; i <= 5; i++) rateLimiter.verificar('login', RL.tempo);
      jest.advanceTimersByTime(15 * 60 * 1000 + 1);
      expect(rateLimiter.tempoRestante('login', RL.tempo)).toBe(0);
    });
  });

  // ── .resetar() ──────────────────────────────────────────────

  describe('.resetar()', () => {
    it('após resetar, verificar() retorna true mesmo após bloqueio', () => {
      for (let i = 0; i <= 5; i++) rateLimiter.verificar('login', RL.resetar);
      rateLimiter.resetar('login', RL.resetar);
      expect(rateLimiter.verificar('login', RL.resetar)).toBe(true);
    });

    it('após resetar, tempoRestante() retorna 0', () => {
      for (let i = 0; i <= 5; i++) rateLimiter.verificar('login', RL.resetar);
      rateLimiter.resetar('login', RL.resetar);
      expect(rateLimiter.tempoRestante('login', RL.resetar)).toBe(0);
    });

    it('resetar uma chave não afeta outra chave da mesma ação', () => {
      for (let i = 0; i <= 5; i++) {
        rateLimiter.verificar('login', RL.resetar);
        rateLimiter.verificar('login', RL.isolamento);
      }
      rateLimiter.resetar('login', RL.resetar);
      // RL.resetar liberado; RL.isolamento ainda bloqueado
      expect(rateLimiter.verificar('login', RL.resetar)).toBe(true);
      expect(rateLimiter.verificar('login', RL.isolamento)).toBe(false);
    });

    it('não lança exceção ao resetar chave inexistente', () => {
      expect(() => rateLimiter.resetar('login', 'nunca-usado@test.com')).not.toThrow();
    });
  });
});

// ═════════════════════════════════════════════════════════════════
// 4. validarSenha
// ═════════════════════════════════════════════════════════════════

describe('validarSenha()', () => {

  // ── Rejeições ───────────────────────────────────────────────

  it('rejeita senha com menos de 8 caracteres', () => {
    const r = validarSenha('Ab1!');
    expect(r.valida).toBe(false);
    expect(r.erros).toContain('Mínimo 8 caracteres');
  });

  it('rejeita senha sem letra maiúscula', () => {
    const r = validarSenha('agora@2026!');
    expect(r.valida).toBe(false);
    expect(r.erros).toContain('Pelo menos 1 letra maiúscula');
  });

  it('rejeita senha sem letra minúscula', () => {
    const r = validarSenha('AGORA@2026!');
    expect(r.valida).toBe(false);
    expect(r.erros).toContain('Pelo menos 1 letra minúscula');
  });

  it('rejeita senha sem número', () => {
    const r = validarSenha('Agora@Evento!');
    expect(r.valida).toBe(false);
    expect(r.erros).toContain('Pelo menos 1 número');
  });

  it('rejeita senha sem caractere especial', () => {
    const r = validarSenha('Agora2026App');
    expect(r.valida).toBe(false);
    expect(r.erros).toContain('Pelo menos 1 caractere especial (!@#$...)');
  });

  it('rejeita senha comum "12345678"', () => {
    const r = validarSenha('12345678');
    expect(r.valida).toBe(false);
    expect(r.erros).toContain('Senha muito comum — escolha outra');
    expect(r.pontuacao).toBe(0);
  });

  it('rejeita senha comum "password"', () => {
    const r = validarSenha('password');
    expect(r.valida).toBe(false);
    expect(r.erros).toContain('Senha muito comum — escolha outra');
  });

  it('rejeita senha comum case-insensitive ("PASSWORD")', () => {
    const r = validarSenha('PASSWORD');
    // "PASSWORD" em minúsculas é "password" — comum
    expect(r.valida).toBe(false);
  });

  it('acumula múltiplos erros quando vários critérios falham', () => {
    const r = validarSenha('abc'); // curta, sem maiúscula, sem número, sem especial
    expect(r.erros.length).toBeGreaterThanOrEqual(3);
    expect(r.valida).toBe(false);
  });

  // ── Aprovações ──────────────────────────────────────────────

  it('aprova senha forte com todos os critérios satisfeitos', () => {
    const r = validarSenha('Agora@2026!');
    expect(r.valida).toBe(true);
    expect(r.erros).toHaveLength(0);
  });

  it('aprova senha com caractere especial diferente (@)', () => {
    const r = validarSenha('Vilhena#2026');
    expect(r.valida).toBe(true);
  });

  // ── Força (forca) ────────────────────────────────────────────

  it('retorna forca "fraca" quando pontuacao <= 1', () => {
    const r = validarSenha('abcdefgh'); // sem maiúscula, número ou especial
    expect(r.forca).toBe('fraca');
  });

  it('retorna forca "muito_forte" para senha longa com todos os critérios', () => {
    const r = validarSenha('Agora@Vilhena2026!'); // >=12 chars + todos critérios
    expect(r.forca).toBe('muito_forte');
    expect(r.pontuacao).toBe(5);
  });

  it('retorna pontuacao 0 para senha comum independente do comprimento', () => {
    const r = validarSenha('senha123'); // está na lista senhasFracas
    expect(r.pontuacao).toBe(0);
  });

  it('retorna erros como array vazio para senha válida', () => {
    const r = validarSenha('Agora@2026!');
    expect(Array.isArray(r.erros)).toBe(true);
    expect(r.erros).toHaveLength(0);
  });

  it('retorna objeto com todas as propriedades esperadas', () => {
    const r: ResultadoSenha = validarSenha('Agora@2026!');
    expect(r).toHaveProperty('valida');
    expect(r).toHaveProperty('forca');
    expect(r).toHaveProperty('erros');
    expect(r).toHaveProperty('pontuacao');
  });
});

// ═════════════════════════════════════════════════════════════════
// 5. sessionGuard
// ═════════════════════════════════════════════════════════════════

describe('sessionGuard', () => {
  const TIMEOUT_MS = 30 * 60 * 1000; // 1_800_000 ms
  let mockLogout: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    mockLogout = jest.fn();
  });

  // ── .iniciar() ──────────────────────────────────────────────

  describe('.iniciar()', () => {
    it('NÃO chama logout antes dos 30 minutos de inatividade', () => {
      sessionGuard.iniciar(mockLogout);
      jest.advanceTimersByTime(TIMEOUT_MS - 1);
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('chama logout exatamente após 30 minutos de inatividade', () => {
      sessionGuard.iniciar(mockLogout);
      jest.advanceTimersByTime(TIMEOUT_MS);
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });

    it('registra listeners para os 4 eventos de atividade do usuário', () => {
      const spy = jest.spyOn(window, 'addEventListener');
      sessionGuard.iniciar(mockLogout);
      const eventos = spy.mock.calls.map(c => c[0]);
      expect(eventos).toContain('mousedown');
      expect(eventos).toContain('keydown');
      expect(eventos).toContain('touchstart');
      expect(eventos).toContain('scroll');
      spy.mockRestore();
    });

    it('registra listeners com flag passive: true (performance)', () => {
      const spy = jest.spyOn(window, 'addEventListener');
      sessionGuard.iniciar(mockLogout);
      const chamadaMousedown = spy.mock.calls.find(c => c[0] === 'mousedown');
      expect(chamadaMousedown?.[2]).toMatchObject({ passive: true });
      spy.mockRestore();
    });

    it('chama iniciar() duas vezes não acumula listeners (chama parar() internamente)', () => {
      const removeSpy = jest.spyOn(window, 'removeEventListener');
      sessionGuard.iniciar(mockLogout);
      sessionGuard.iniciar(mockLogout);
      // parar() foi chamado antes de registrar novos listeners
      expect(removeSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('keydown',   expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('touchstart',expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('scroll',    expect.any(Function));
      removeSpy.mockRestore();
    });

    it('reseta o timer quando usuário dispara evento mousedown', () => {
      sessionGuard.iniciar(mockLogout);
      // Avança 25 minutos (faltam 5min para logout)
      jest.advanceTimersByTime(25 * 60 * 1000);
      // Simula atividade do usuário → timer reinicia
      window.dispatchEvent(new Event('mousedown'));
      // Avança mais 29min59s — não deve ter disparado (30min desde a atividade)
      jest.advanceTimersByTime(29 * 60 * 1000 + 59_000);
      expect(mockLogout).not.toHaveBeenCalled();
      // Avança o segundo restante → 30min desde a última atividade
      jest.advanceTimersByTime(1000);
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });

  // ── .parar() ────────────────────────────────────────────────

  describe('.parar()', () => {
    it('cancela o timer — logout NÃO é chamado após parar()', () => {
      sessionGuard.iniciar(mockLogout);
      sessionGuard.parar();
      jest.advanceTimersByTime(TIMEOUT_MS + 1);
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('remove os 4 event listeners ao parar', () => {
      const spy = jest.spyOn(window, 'removeEventListener');
      sessionGuard.iniciar(mockLogout);
      sessionGuard.parar();
      const eventosRemovidos = spy.mock.calls.map(c => c[0]);
      expect(eventosRemovidos).toContain('mousedown');
      expect(eventosRemovidos).toContain('keydown');
      expect(eventosRemovidos).toContain('touchstart');
      expect(eventosRemovidos).toContain('scroll');
      spy.mockRestore();
    });

    it('não lança exceção ao chamar parar() sem ter iniciado', () => {
      expect(() => sessionGuard.parar()).not.toThrow();
    });

    it('chamar parar() duas vezes não lança exceção', () => {
      sessionGuard.iniciar(mockLogout);
      sessionGuard.parar();
      expect(() => sessionGuard.parar()).not.toThrow();
    });
  });
});

// ═════════════════════════════════════════════════════════════════
// 6. formatarCNPJ
// ═════════════════════════════════════════════════════════════════

describe('formatarCNPJ()', () => {
  it('formata CNPJ completo de 14 dígitos corretamente', () => {
    expect(formatarCNPJ('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('formata CNPJ já formatado sem duplicar pontuação', () => {
    expect(formatarCNPJ('11.222.333/0001-81')).toBe('11.222.333/0001-81');
  });

  it('formata os primeiros 2 dígitos sem separador', () => {
    expect(formatarCNPJ('11')).toBe('11');
  });

  it('adiciona primeiro ponto após 2 dígitos', () => {
    expect(formatarCNPJ('112')).toBe('11.2');
  });

  it('formata bloco de 5 dígitos corretamente', () => {
    expect(formatarCNPJ('11222')).toBe('11.222');
  });

  it('adiciona segundo ponto após 5 dígitos', () => {
    expect(formatarCNPJ('112223')).toBe('11.222.3');
  });

  it('adiciona barra após 8 dígitos', () => {
    expect(formatarCNPJ('112223330')).toBe('11.222.333/0');
  });

  it('adiciona hífen após 12 dígitos', () => {
    expect(formatarCNPJ('112223330001')).toBe('11.222.333/0001');
  });

  it('trunca entrada com mais de 14 dígitos', () => {
    expect(formatarCNPJ('112223330001819999')).toBe('11.222.333/0001-81');
  });

  it('ignora caracteres não-numéricos na entrada', () => {
    expect(formatarCNPJ('11.222.333/0001-81')).toBe('11.222.333/0001-81');
  });
});

// ═════════════════════════════════════════════════════════════════
// 7. validarCNPJ
// ═════════════════════════════════════════════════════════════════

describe('validarCNPJ()', () => {
  it('retorna valido: false e erro para string vazia', () => {
    const r: ResultadoCNPJ = validarCNPJ('');
    expect(r.valido).toBe(false);
    expect(r.erro).toBeDefined();
  });

  it('retorna valido: false para CNPJ com menos de 14 dígitos', () => {
    const r = validarCNPJ(CNPJ_CURTO);
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/14 dígitos/i);
  });

  it('retorna valido: false para CNPJ com todos os dígitos iguais', () => {
    const r = validarCNPJ(CNPJ_TODOS_IGUAIS);
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/inválido/i);
  });

  it('retorna valido: false quando 1º dígito verificador está errado', () => {
    // CNPJ_INVALIDO_NUMEROS tem o 2º dígito verificador errado
    const r = validarCNPJ(CNPJ_INVALIDO_NUMEROS);
    expect(r.valido).toBe(false);
  });

  it('retorna valido: true para CNPJ correto (somente números)', () => {
    const r = validarCNPJ(CNPJ_VALIDO_NUMEROS);
    expect(r.valido).toBe(true);
    expect(r.erro).toBeUndefined();
  });

  it('retorna valido: true para CNPJ formatado com pontuação', () => {
    const r = validarCNPJ(CNPJ_VALIDO_FORMATADO);
    expect(r.valido).toBe(true);
  });

  it('retorna campo formatado com máscara correta para CNPJ válido', () => {
    const r = validarCNPJ(CNPJ_VALIDO_NUMEROS);
    expect(r.formatado).toBe(CNPJ_VALIDO_FORMATADO);
  });

  it('retorna campo formatado mesmo para CNPJ inválido', () => {
    const r = validarCNPJ(CNPJ_INVALIDO_NUMEROS);
    expect(r.formatado).toBe('11.222.333/0001-80');
  });

  it('retorna objeto com propriedades valido e formatado sempre presentes', () => {
    const r = validarCNPJ(CNPJ_VALIDO_NUMEROS);
    expect(r).toHaveProperty('valido');
    expect(r).toHaveProperty('formatado');
  });

  it('ignora espaços e hifens extras na entrada', () => {
    // Entrada com espaço extra — replace(/\D/g) remove tudo
    const r = validarCNPJ(' 11.222.333/0001-81 ');
    expect(r.valido).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════
// 8. CSP_POLICY
// ═════════════════════════════════════════════════════════════════

describe('CSP_POLICY', () => {
  it('é uma string não vazia', () => {
    expect(typeof CSP_POLICY).toBe('string');
    expect(CSP_POLICY.length).toBeGreaterThan(0);
  });

  it('contém diretiva default-src', () => {
    expect(CSP_POLICY).toContain("default-src 'self'");
  });

  it('proíbe clickjacking via frame-ancestors none', () => {
    expect(CSP_POLICY).toContain("frame-ancestors 'none'");
  });

  it('permite conexões ao Supabase (connect-src)', () => {
    expect(CSP_POLICY).toContain('supabase.co');
  });

  it('NÃO contém unsafe-eval (execução de código arbitrário)', () => {
    expect(CSP_POLICY).not.toContain('unsafe-eval');
  });
});
