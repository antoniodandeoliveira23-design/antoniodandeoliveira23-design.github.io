/**
 * services/validacao-semantica.ts
 *
 * R1  — Linguagem comercial em eventos (PF/Gov)
 * R1b — Detecção de spam (repetição, caps, links, frases de isca)
 * R1c — Detecção de linguagem ofensiva / discurso de ódio
 *
 * Exporta também `analisar()` — API unificada que retorna um
 * veredicto completo e é integrada com registrarAnomalia().
 */

// ─────────────────────────────────────────────────────────
// R1 — Vocabulário comercial (mantido do original)
// ─────────────────────────────────────────────────────────

const TERMOS_COMERCIAIS = [
  'promoção', 'promocao', 'desconto', 'oferta', 'liquidação', 'liquidacao',
  'black friday', 'cupom', 'cashback', 'frete grátis', 'frete gratis',
  'parcelamento', 'parcele', 'à vista', 'a vista',
  'compre', 'comprar', 'venda', 'vender', 'produto', 'serviço', 'servico',
  'loja', 'estoque', 'encomenda', 'entrega',
  'imperdível', 'imperdivel', 'não perca', 'nao perca', 'aproveite',
  'última chance', 'ultima chance', 'tempo limitado', 'vagas limitadas',
  'exclusivo para clientes', 'só hoje', 'so hoje',
  'r$', 'reais', 'investimento', 'lucro', 'renda extra',
  'ganhe dinheiro', 'trabalhe de casa',
  'orçamento', 'orcamento', 'cotação', 'cotacao',
  'whatsapp comercial', 'ligue agora', 'agende',
];

const PADROES_COMERCIAIS = [
  /\d+[.,]\d{2}\s*(reais|r\$)/i,
  /r\$\s*\d+/i,
  /\d+%\s*(off|desconto|de desconto)/i,
  /de\s+r?\$?\s*\d+.*por\s+r?\$?\s*\d+/i,
  /(compre|leve)\s+\d+.*pague\s+\d+/i,
  /parcela.*de\s+r?\$?\s*\d+/i,
];

// ─────────────────────────────────────────────────────────
// R1b — Vocabulário de spam
// ─────────────────────────────────────────────────────────

const TERMOS_SPAM = [
  'clique aqui', 'acesse agora', 'acesse já', 'acesse ja',
  'ganhe gratis', 'ganhe grátis', 'gratuito agora',
  'dinheiro rápido', 'dinheiro rapido', 'renda passiva',
  'seja seu próprio chefe', 'seja seu proprio chefe',
  'corrente de oração', 'corrente de oracao',
  'encaminhe para', 'compartilhe com',
  'você foi selecionado', 'voce foi selecionado',
  'parabéns você ganhou', 'parabens voce ganhou',
  'não delete', 'nao delete',
  'me chama no zap', 'me chama no whats',
  'chame no privado', 'chame no pv',
  'comprovante em anexo', 'pix aberto',
];

/** Padrões de spam estruturais */
const PADROES_SPAM: { regex: RegExp; descricao: string }[] = [
  { regex: /(.)\1{5,}/g,              descricao: 'Repetição excessiva de caracteres' },
  { regex: /[!?]{3,}/g,               descricao: 'Pontuação excessiva' },
  { regex: /[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ]{8,}/g, descricao: 'Texto todo em maiúsculas' },
  { regex: /https?:\/\/\S+/gi,        descricao: 'Link externo' },
  { regex: /\b\d{2}\s*\d{4,5}[-.\s]?\d{4}\b/g, descricao: 'Número de telefone' },
  { regex: /(\b\w{3,}\b)(?:\W+\1){3,}/gi, descricao: 'Palavra repetida muitas vezes' },
  { regex: /t\.me\/|wa\.me\/|bit\.ly\//gi, descricao: 'Link encurtado ou Telegram/WhatsApp' },
];

// ─────────────────────────────────────────────────────────
// R1c — Vocabulário de conteúdo ofensivo / discurso de ódio
// (termos codificados com substituições para não expor lista)
// ─────────────────────────────────────────────────────────

/**
 * Termos de ameaça/violência explícita — decodificados em runtime.
 * Padrão: ['termo1', 'termo2', ...] — mantido minimalista e focado em PT-BR.
 */
const TERMOS_AMEACA = [
  'vou te matar', 'vou te bater', 'vou te acertar',
  'te mato', 'te bato', 'te arrebento',
  'você vai se arrepender', 'voce vai se arrepender',
  'você vai pagar', 'voce vai pagar',
  'sua família vai sofrer', 'sua familia vai sofrer',
  'vou aparecer na sua casa',
  'te denuncio à polícia',   // não é ameaça de violência, mas intimidação
  'isso não vai ficar assim', 'isso nao vai ficar assim',
];

/**
 * Padrões de linguagem discriminatória / discurso de ódio.
 * Usamos regex para capturar variações sem listar termos explicitamente.
 */
const PADROES_ODIO: { regex: RegExp; nivel: 'leve' | 'moderado' | 'severo'; descricao: string }[] = [
  // Estrutura: "X é [insulto]" ou "morte a X" ou "fora X"
  { regex: /morte\s+(a|ao|à|aos|às)\s+\w+/gi,           nivel: 'severo',   descricao: 'Incitação à violência' },
  { regex: /fora\s+(o|a|os|as)\s+\w+/gi,                nivel: 'leve',     descricao: 'Linguagem de exclusão' },
  { regex: /odeio\s+(o|a|os|as|todos)\s+\w+/gi,         nivel: 'moderado', descricao: 'Discurso de ódio' },
  { regex: /\b(vi[a-z]do|b[i1]ch[a4]|safad[ao])\b/gi,  nivel: 'severo',   descricao: 'Linguagem ofensiva grave' },
  { regex: /\b(retard[ao]|imbecil|idiota)\b/gi,          nivel: 'leve',     descricao: 'Linguagem ofensiva leve' },
  { regex: /\b(racism[ao]|preconceito)\b/gi,             nivel: 'leve',     descricao: 'Referência a discriminação' },
  { regex: /ir\s+se\s+(f[uo]der|lascar)/gi,              nivel: 'moderado', descricao: 'Linguagem vulgar dirigida' },
  { regex: /\b(c[aã]cete|p[ou]rra|merda)\b/gi,           nivel: 'leve',     descricao: 'Palavrão' },
];

// ─────────────────────────────────────────────────────────
// Normalizar texto (remove acentos, lowercase)
// ─────────────────────────────────────────────────────────
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// ─────────────────────────────────────────────────────────
// R1 — detectarConteudoComercial (mantido do original)
// ─────────────────────────────────────────────────────────
export const validacaoSemantica = {

  detectarConteudoComercial(texto: string): boolean {
    const textoN  = normalizar(texto);
    const textoOL = texto.toLowerCase();
    let score = 0;

    for (const termo of TERMOS_COMERCIAIS) {
      const termoN = normalizar(termo);
      if (textoN.includes(termoN) || textoOL.includes(termo)) {
        score++;
      }
    }
    for (const padrao of PADROES_COMERCIAIS) {
      if (padrao.test(textoOL)) score += 2;
    }
    return score >= 2;
  },

  listarTermosEncontrados(texto: string): string[] {
    const textoLower = texto.toLowerCase();
    return TERMOS_COMERCIAIS.filter(t => textoLower.includes(t));
  },

  // ─────────────────────────────────────────────────────
  // R1b — Detecção de spam
  // ─────────────────────────────────────────────────────
  detectarSpam(texto: string): { ehSpam: boolean; score: number; motivos: string[] } {
    const textoN  = normalizar(texto);
    const motivos: string[] = [];
    let score = 0;

    // Termos de spam
    for (const termo of TERMOS_SPAM) {
      if (textoN.includes(normalizar(termo))) {
        motivos.push(`Frase de spam: "${termo}"`);
        score += 2;
      }
    }

    // Padrões estruturais
    for (const { regex, descricao } of PADROES_SPAM) {
      const matches = texto.match(regex);
      if (matches && matches.length > 0) {
        motivos.push(descricao);
        score += matches.length >= 2 ? 2 : 1;
      }
    }

    // Proporção de caps (>60% do texto = spam)
    const letras = texto.replace(/[^a-záéíóúA-ZÁÉÍÓÚ]/g, '');
    if (letras.length > 10) {
      const maiusc = (texto.match(/[A-ZÁÉÍÓÚ]/g) || []).length;
      if (maiusc / letras.length > 0.60) {
        motivos.push('Texto predominantemente em maiúsculas');
        score += 2;
      }
    }

    return {
      ehSpam: score >= 3,
      score,
      motivos: [...new Set(motivos)],
    };
  },

  // ─────────────────────────────────────────────────────
  // R1c — Detecção de linguagem ofensiva / discurso de ódio
  // ─────────────────────────────────────────────────────
  detectarConteudoOfensivo(texto: string): {
    temOdio: boolean;
    nivel: 'nenhum' | 'leve' | 'moderado' | 'severo';
    motivos: string[];
  } {
    const textoN = normalizar(texto);
    const motivos: string[] = [];
    let nivelMax: 'nenhum' | 'leve' | 'moderado' | 'severo' = 'nenhum';

    const nivelNum = { nenhum: 0, leve: 1, moderado: 2, severo: 3 };

    // Ameaças explícitas — sempre severo
    for (const ameaca of TERMOS_AMEACA) {
      if (textoN.includes(normalizar(ameaca))) {
        motivos.push(`Ameaça detectada: "${ameaca}"`);
        nivelMax = 'severo';
      }
    }

    // Padrões de ódio/ofensivos
    for (const { regex, nivel, descricao } of PADROES_ODIO) {
      // Reseta lastIndex para padrões com flag /g
      const r = new RegExp(regex.source, regex.flags.replace('g', ''));
      if (r.test(texto)) {
        motivos.push(descricao);
        if (nivelNum[nivel] > nivelNum[nivelMax]) {
          nivelMax = nivel;
        }
      }
    }

    return {
      temOdio: nivelMax !== 'nenhum',
      nivel: nivelMax,
      motivos: [...new Set(motivos)],
    };
  },

  // ─────────────────────────────────────────────────────
  // API unificada — analisar()
  // Retorna veredicto completo para qualquer contexto
  // ─────────────────────────────────────────────────────
  /**
   * @param texto     Texto a analisar
   * @param contexto  Contexto de uso — altera thresholds
   *   'evento'   : bloqueia conteúdo comercial (PF/Gov) + spam + ódio
   *   'mensagem' : foco em spam + ódio (comercial = leve aviso)
   *   'produto'  : spam + ódio (comercial permitido para PJ)
   */
  analisar(
    texto: string,
    contexto: 'evento' | 'mensagem' | 'produto' = 'mensagem',
  ): ResultadoAnalise {
    const spam       = this.detectarSpam(texto);
    const ofensivo   = this.detectarConteudoOfensivo(texto);
    const comercial  = this.detectarConteudoComercial(texto);
    const termosCom  = comercial ? this.listarTermosEncontrados(texto) : [];

    const alertas: string[] = [];
    let bloqueado = false;
    let motivo: string | undefined;

    // Conteúdo ofensivo — sempre bloqueia (em qualquer contexto)
    if (ofensivo.temOdio) {
      if (ofensivo.nivel === 'severo' || ofensivo.nivel === 'moderado') {
        bloqueado = true;
        motivo = 'Conteúdo ofensivo ou ameaçador detectado.';
      } else {
        alertas.push('Evite linguagem ofensiva ou vulgar.');
      }
      alertas.push(...ofensivo.motivos);
    }

    // Spam — bloqueia se score alto
    if (spam.ehSpam) {
      if (spam.score >= 6) {
        bloqueado = true;
        motivo = motivo ?? 'Conteúdo identificado como spam.';
      } else {
        alertas.push('Mensagem parece conter spam.');
      }
      alertas.push(...spam.motivos);
    }

    // Comercial — bloqueia apenas em contexto de evento para PF/Gov
    if (comercial && contexto === 'evento') {
      bloqueado = true;
      motivo = motivo ?? 'Conteúdo comercial detectado.';
      alertas.push(...termosCom.map(t => `Termo comercial: "${t}"`));
    }

    // Score geral (0–100)
    const score = Math.min(
      100,
      spam.score * 8 +
      (ofensivo.nivel === 'severo' ? 60 : ofensivo.nivel === 'moderado' ? 35 : ofensivo.nivel === 'leve' ? 15 : 0) +
      (comercial && contexto === 'evento' ? 30 : comercial ? 10 : 0),
    );

    return {
      bloqueado,
      motivo,
      alertas: [...new Set(alertas)],
      score,
      spam,
      ofensivo,
      comercial,
      termosComerciais: termosCom,
    };
  },
};

// ─────────────────────────────────────────────────────────
// Tipo de retorno da análise unificada
// ─────────────────────────────────────────────────────────
export interface ResultadoAnalise {
  bloqueado: boolean;
  motivo?: string;
  alertas: string[];
  score: number;                        // 0–100 (risco estimado)
  spam: {
    ehSpam: boolean;
    score: number;
    motivos: string[];
  };
  ofensivo: {
    temOdio: boolean;
    nivel: 'nenhum' | 'leve' | 'moderado' | 'severo';
    motivos: string[];
  };
  comercial: boolean;
  termosComerciais: string[];
}
