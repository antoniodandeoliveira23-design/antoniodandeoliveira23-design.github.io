/**
 * services/seguranca.ts
 * Implementa A02, A03, A04, A05, A07
 * — Storage seguro (sem dados sensíveis em sessionStorage)
 * — Sanitização XSS
 * — Rate limiter client-side
 * — Validação de senha forte
 * — Session timeout
 */

// ═══════════════════════════════════════════════════════
// A02 — STORAGE SEGURO
// Nunca armazena dados sensíveis em texto plano
// ═══════════════════════════════════════════════════════

const CHAVES_SEGURAS = ['agoraDemoLoggedIn', 'agoraDemoTipo'] as const;
type ChaveSegura = (typeof CHAVES_SEGURAS)[number];

export const storageSeguro = {
  /** Salva APENAS chaves permitidas — rejeita silenciosamente qualquer outro dado */
  set(chave: ChaveSegura, valor: string): void {
    if (!CHAVES_SEGURAS.includes(chave)) return;
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(chave, valor);
    } catch {
      // storage cheio ou bloqueado — ignora
    }
  },

  get(chave: ChaveSegura): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return sessionStorage.getItem(chave);
    } catch {
      return null;
    }
  },

  remove(chave: ChaveSegura): void {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.removeItem(chave);
    } catch {
      // ignora
    }
  },

  /** Limpa TODO o sessionStorage de uma vez (logout) */
  limparTudo(): void {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.clear();
    } catch {
      // ignora
    }
  },
};

// ═══════════════════════════════════════════════════════
// A03 — SANITIZAÇÃO XSS
// Remove tags HTML/script de qualquer string antes de
// renderizar ou enviar ao banco
// ═══════════════════════════════════════════════════════

const PADROES_XSS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi,
  /javascript\s*:/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi, // onclick=, onload=, etc.
  /on\w+\s*=\s*[^\s>]*/gi,
  /<[^>]*>/g,                      // qualquer tag HTML restante
  /&lt;script/gi,
  /&gt;/gi,
];

export const sanitizador = {
  /** Remove qualquer HTML/script da string */
  texto(valor: string): string {
    if (!valor || typeof valor !== 'string') return '';
    let limpo = valor;
    for (const padrao of PADROES_XSS) {
      limpo = limpo.replace(padrao, '');
    }
    return limpo.trim();
  },

  /** Sanitiza objeto inteiro recursivamente */
  objeto<T extends Record<string, any>>(obj: T): T {
    const resultado: any = {};
    for (const [chave, valor] of Object.entries(obj)) {
      if (typeof valor === 'string') {
        resultado[chave] = sanitizador.texto(valor);
      } else if (typeof valor === 'object' && valor !== null) {
        resultado[chave] = sanitizador.objeto(valor);
      } else {
        resultado[chave] = valor;
      }
    }
    return resultado as T;
  },

  /** Valida URL — aceita apenas http/https */
  url(valor: string): string {
    if (!valor) return '';
    try {
      const url = new URL(valor);
      if (!['http:', 'https:'].includes(url.protocol)) return '';
      return url.toString();
    } catch {
      return '';
    }
  },
};

// ═══════════════════════════════════════════════════════
// A04 — RATE LIMITER CLIENT-SIDE
// Bloqueia ações repetidas em janelas de tempo
// ═══════════════════════════════════════════════════════

interface RateLimitConfig {
  maxTentativas: number;
  janelaMs: number;       // janela de tempo em ms
  bloqueioMs: number;     // tempo de bloqueio após exceder
}

const _tentativas: Map<string, { count: number; inicio: number; bloqueadoAte?: number }> = new Map();

const CONFIGS: Record<string, RateLimitConfig> = {
  login:          { maxTentativas: 5,  janelaMs: 5 * 60_000,  bloqueioMs: 15 * 60_000 },
  cadastro:       { maxTentativas: 3,  janelaMs: 60_000,      bloqueioMs: 5 * 60_000  },
  criar_evento:   { maxTentativas: 10, janelaMs: 60 * 60_000, bloqueioMs: 30 * 60_000 },
  denuncia:       { maxTentativas: 5,  janelaMs: 10 * 60_000, bloqueioMs: 60 * 60_000 },
  recuperar_senha:{ maxTentativas: 3,  janelaMs: 10 * 60_000, bloqueioMs: 30 * 60_000 },
};

export const rateLimiter = {
  /**
   * Verifica se a ação está permitida para a chave (userId ou IP)
   * @returns true se permitido, false se bloqueado
   */
  verificar(acao: string, chave: string = 'global'): boolean {
    const config = CONFIGS[acao];
    if (!config) return true; // ação desconhecida — permite

    const id = `${acao}:${chave}`;
    const agora = Date.now();
    const estado = _tentativas.get(id);

    // Ainda bloqueado?
    if (estado?.bloqueadoAte && agora < estado.bloqueadoAte) {
      return false;
    }

    // Janela expirou — reseta
    if (!estado || agora - estado.inicio > config.janelaMs) {
      _tentativas.set(id, { count: 1, inicio: agora });
      return true;
    }

    // Incrementa e verifica limite
    estado.count++;
    if (estado.count > config.maxTentativas) {
      estado.bloqueadoAte = agora + config.bloqueioMs;
      return false;
    }

    return true;
  },

  /** Retorna tempo restante de bloqueio em segundos (0 = não bloqueado) */
  tempoRestante(acao: string, chave: string = 'global'): number {
    const id = `${acao}:${chave}`;
    const estado = _tentativas.get(id);
    if (!estado?.bloqueadoAte) return 0;
    const restante = estado.bloqueadoAte - Date.now();
    return restante > 0 ? Math.ceil(restante / 1000) : 0;
  },

  /** Reseta contagem (após sucesso, ex: login bem-sucedido) */
  resetar(acao: string, chave: string = 'global'): void {
    _tentativas.delete(`${acao}:${chave}`);
  },
};

// ═══════════════════════════════════════════════════════
// A05 / A07 — VALIDAÇÃO DE SENHA FORTE
// ═══════════════════════════════════════════════════════

export interface ResultadoSenha {
  valida: boolean;
  forca: 'fraca' | 'media' | 'forte' | 'muito_forte';
  erros: string[];
  pontuacao: number; // 0-4
}

export function validarSenha(senha: string): ResultadoSenha {
  const erros: string[] = [];
  let pontuacao = 0;

  if (senha.length < 8)       erros.push('Mínimo 8 caracteres');
  else if (senha.length >= 12) pontuacao++;

  if (!/[A-Z]/.test(senha))   erros.push('Pelo menos 1 letra maiúscula');
  else pontuacao++;

  if (!/[a-z]/.test(senha))   erros.push('Pelo menos 1 letra minúscula');
  else pontuacao++;

  if (!/[0-9]/.test(senha))   erros.push('Pelo menos 1 número');
  else pontuacao++;

  if (!/[^A-Za-z0-9]/.test(senha)) erros.push('Pelo menos 1 caractere especial (!@#$...)');
  else pontuacao++;

  const senhasFracas = ['12345678','password','qwerty123','agora123','senha123'];
  if (senhasFracas.includes(senha.toLowerCase())) {
    erros.push('Senha muito comum — escolha outra');
    pontuacao = 0;
  }

  const forca: ResultadoSenha['forca'] =
    pontuacao <= 1 ? 'fraca'
    : pontuacao === 2 ? 'media'
    : pontuacao === 3 ? 'forte'
    : 'muito_forte';

  return { valida: erros.length === 0, forca, erros, pontuacao };
}

// ═══════════════════════════════════════════════════════
// A07 — SESSION TIMEOUT
// Desloga automaticamente após inatividade
// ═══════════════════════════════════════════════════════

const TIMEOUT_INATIVIDADE_MS = 30 * 60_000; // 30 minutos
let _timerTimeout: ReturnType<typeof setTimeout> | null = null;
let _callbackLogout: (() => void) | null = null;

// Fix: armazena referência da função handler para poder removê-la depois
// Sem isso, cada chamada a iniciar() vaza 4 listeners permanentemente
let _guardHandler: (() => void) | null = null;
const _GUARD_EVENTOS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;

export const sessionGuard = {
  /** Inicializa o guard — chamar após login bem-sucedido */
  iniciar(onLogout: () => void): void {
    if (typeof window === 'undefined') return;

    // Remove listeners anteriores antes de registrar novos (evita acúmulo)
    this.parar();

    _callbackLogout = onLogout;
    this._resetarTimer();

    // Armazena referência nomeada — única função, reutilizada em todos os eventos
    _guardHandler = () => this._resetarTimer();
    _GUARD_EVENTOS.forEach((ev) =>
      window.addEventListener(ev, _guardHandler!, { passive: true }),
    );
  },

  _resetarTimer(): void {
    if (_timerTimeout) clearTimeout(_timerTimeout);
    _timerTimeout = setTimeout(() => {
      if (_callbackLogout) _callbackLogout();
    }, TIMEOUT_INATIVIDADE_MS);
  },

  /** Para o guard e remove todos os event listeners — chamar no logout */
  parar(): void {
    if (_timerTimeout) {
      clearTimeout(_timerTimeout);
      _timerTimeout = null;
    }
    _callbackLogout = null;

    // Remove listeners usando a referência salva (fix do memory leak)
    if (_guardHandler) {
      _GUARD_EVENTOS.forEach((ev) =>
        window.removeEventListener(ev, _guardHandler!),
      );
      _guardHandler = null;
    }
  },
};

// ═══════════════════════════════════════════════════════
// A05 — CSP (Content Security Policy) via meta tag
// Injetar no _layout.tsx da aplicação
// ═══════════════════════════════════════════════════════

export const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",       // unsafe-inline necessário para Expo/Metro
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",              // permite imagens externas via https
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.asaas.com",
  "font-src 'self' data:",
  "frame-ancestors 'none'",                   // previne clickjacking
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

// ═══════════════════════════════════════════════════════
// CNPJ — Validação com dígitos verificadores + formatação
// ═══════════════════════════════════════════════════════

export interface ResultadoCNPJ {
  valido: boolean;
  formatado: string;  // "##.###.###/####-##"
  erro?: string;
}

/**
 * Aplica máscara de CNPJ em tempo real (para usar no onChangeText).
 * Trunca em 18 caracteres formatados (= 14 dígitos).
 */
export function formatarCNPJ(valor: string): string {
  const n = valor.replace(/\D/g, '').substring(0, 14);
  return n
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

/**
 * Valida CNPJ completo: formato, dígitos repetidos e dígitos verificadores.
 * Aceita com ou sem formatação (pontos, barras, hífens).
 */
export function validarCNPJ(cnpj: string): ResultadoCNPJ {
  const numeros = cnpj.replace(/\D/g, '');
  const formatado = formatarCNPJ(numeros);

  if (!numeros) {
    return { valido: false, formatado, erro: 'Informe o CNPJ.' };
  }
  if (numeros.length !== 14) {
    return { valido: false, formatado, erro: 'CNPJ deve ter 14 dígitos.' };
  }
  // Todos os dígitos iguais (ex: 00000000000000) — inválido
  if (/^(\d)\1{13}$/.test(numeros)) {
    return { valido: false, formatado, erro: 'CNPJ inválido.' };
  }

  // ── Cálculo do 1º dígito verificador ──────────────────
  let soma = 0;
  let peso = 5;
  for (let i = 0; i < 12; i++) {
    soma += parseInt(numeros[i]) * peso;
    peso = peso === 2 ? 9 : peso - 1;
  }
  const d1 = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (parseInt(numeros[12]) !== d1) {
    return { valido: false, formatado, erro: 'CNPJ inválido.' };
  }

  // ── Cálculo do 2º dígito verificador ──────────────────
  soma = 0;
  peso = 6;
  for (let i = 0; i < 13; i++) {
    soma += parseInt(numeros[i]) * peso;
    peso = peso === 2 ? 9 : peso - 1;
  }
  const d2 = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (parseInt(numeros[13]) !== d2) {
    return { valido: false, formatado, erro: 'CNPJ inválido.' };
  }

  return { valido: true, formatado };
}
