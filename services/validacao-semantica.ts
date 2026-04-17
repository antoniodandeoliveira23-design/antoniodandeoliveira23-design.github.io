/**
 * R1 - Validação Semântica
 * Detecta automaticamente linguagem comercial em textos.
 * Se um usuário PF tentar publicar conteúdo comercial,
 * o sistema bloqueia (R2) e exibe modal educativo.
 */

const TERMOS_COMERCIAIS = [
  // Preços e promoções
  'promoção', 'promocao', 'desconto', 'oferta', 'liquidação', 'liquidacao',
  'black friday', 'cupom', 'cashback', 'frete grátis', 'frete gratis',
  'parcelamento', 'parcele', 'à vista', 'a vista',
  // Vendas
  'compre', 'comprar', 'venda', 'vender', 'produto', 'serviço', 'servico',
  'loja', 'estoque', 'encomenda', 'entrega',
  // Marketing
  'imperdível', 'imperdivel', 'não perca', 'nao perca', 'aproveite',
  'última chance', 'ultima chance', 'tempo limitado', 'vagas limitadas',
  'exclusivo para clientes', 'só hoje', 'so hoje',
  // Financeiro
  'r$', 'reais', 'investimento', 'lucro', 'renda extra',
  'ganhe dinheiro', 'trabalhe de casa',
  // Contato comercial
  'orçamento', 'orcamento', 'cotação', 'cotacao',
  'whatsapp comercial', 'ligue agora', 'agende',
];

const PADROES_COMERCIAIS = [
  /\d+[.,]\d{2}\s*(reais|r\$)/i,          // "49,90 reais" ou "49.90 R$"
  /r\$\s*\d+/i,                            // "R$ 49"
  /\d+%\s*(off|desconto|de desconto)/i,    // "30% off"
  /de\s+r?\$?\s*\d+.*por\s+r?\$?\s*\d+/i, // "de R$100 por R$50"
  /(compre|leve)\s+\d+.*pague\s+\d+/i,    // "compre 2 pague 1"
  /parcela.*de\s+r?\$?\s*\d+/i,           // "parcelas de R$29"
];

export const validacaoSemantica = {
  /**
   * Analisa texto e retorna se contém linguagem comercial.
   * Score >= 2 = conteúdo comercial detectado.
   */
  detectarConteudoComercial(texto: string): boolean {
    const textoLower = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const textoOriginalLower = texto.toLowerCase();
    let score = 0;

    // Verificar termos comerciais
    for (const termo of TERMOS_COMERCIAIS) {
      const termoNorm = termo.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (textoLower.includes(termoNorm) || textoOriginalLower.includes(termo)) {
        score++;
      }
    }

    // Verificar padrões com regex
    for (const padrao of PADROES_COMERCIAIS) {
      if (padrao.test(textoOriginalLower)) {
        score += 2; // padrão regex tem peso maior
      }
    }

    // Threshold: 2+ termos/padrões = comercial
    return score >= 2;
  },

  /**
   * Retorna lista de termos comerciais encontrados (para exibir no modal educativo).
   */
  listarTermosEncontrados(texto: string): string[] {
    const textoLower = texto.toLowerCase();
    const encontrados: string[] = [];

    for (const termo of TERMOS_COMERCIAIS) {
      if (textoLower.includes(termo)) {
        encontrados.push(termo);
      }
    }

    return encontrados;
  },
};
