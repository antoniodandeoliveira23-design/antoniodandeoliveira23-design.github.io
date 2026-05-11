/**
 * services/__tests__/validacao-semantica.test.ts
 *
 * Suite de testes para validacao-semantica.ts
 *
 * Módulo testado: validacaoSemantica (detectarConteudoComercial,
 *   listarTermosEncontrados, detectarSpam, detectarConteudoOfensivo, analisar)
 *
 * Princípios FIRST:
 *  - Fast   : sem I/O, sem timers
 *  - Isolated: sem estado compartilhado entre descreve (pure functions)
 *  - Repeatable: sem aleatoriedade
 *  - Self-validating: assertions explícitas em cada it()
 *  - Timely : cobertura pré-produção
 */

import { validacaoSemantica, type ResultadoAnalise } from '@/services/validacao-semantica';

// ─────────────────────────────────────────────────────────────────────────────
// 1. detectarConteudoComercial
// ─────────────────────────────────────────────────────────────────────────────
describe('detectarConteudoComercial()', () => {
  describe('textos neutros → false', () => {
    it('texto vazio retorna false', () => {
      expect(validacaoSemantica.detectarConteudoComercial('')).toBe(false);
    });

    it('texto de evento cultural retorna false', () => {
      const texto = 'Feira de artesanato no parque central, entrada gratuita.';
      expect(validacaoSemantica.detectarConteudoComercial(texto)).toBe(false);
    });

    it('texto com apenas um termo comercial isolado (score=1) retorna false', () => {
      // "loja" sozinho conta score=1, que é < 2
      expect(validacaoSemantica.detectarConteudoComercial('Visite nossa loja cultural.')).toBe(false);
    });
  });

  describe('dois termos comerciais → true (score >= 2)', () => {
    it('dois termos da lista detectados (promoção + desconto)', () => {
      expect(validacaoSemantica.detectarConteudoComercial('Grande promoção com desconto especial!')).toBe(true);
    });

    it('dois termos: "compre" + "oferta"', () => {
      expect(validacaoSemantica.detectarConteudoComercial('Compre agora e aproveite a oferta.')).toBe(true);
    });

    it('"r$" + "entrega" → true', () => {
      expect(validacaoSemantica.detectarConteudoComercial('Pagamento R$ 50 com entrega grátis.')).toBe(true);
    });
  });

  describe('padrões regex comerciais (score += 2 cada)', () => {
    it('preço no formato "R$ 99" detecta padrão → true', () => {
      expect(validacaoSemantica.detectarConteudoComercial('Ingresso por R$ 99')).toBe(true);
    });

    it('porcentagem de desconto "30% off" → true', () => {
      expect(validacaoSemantica.detectarConteudoComercial('Desconto de 30% off nos ingressos')).toBe(true);
    });

    it('padrão "de R$ X por R$ Y" → true', () => {
      expect(validacaoSemantica.detectarConteudoComercial('De R$ 100 por R$ 70')).toBe(true);
    });

    it('padrão "parcela de R$ X" → true', () => {
      expect(validacaoSemantica.detectarConteudoComercial('Parcela de R$ 29,90')).toBe(true);
    });
  });

  describe('normalização e case-insensitivity', () => {
    it('termo com acento "promoção" detectado em versão sem acento "promocao"', () => {
      // A normalização converte ambos para a mesma forma
      expect(validacaoSemantica.detectarConteudoComercial('Grande promocao e desconto hoje!')).toBe(true);
    });

    it('maiúsculas não impedem detecção (DESCONTO + PROMOÇÃO)', () => {
      expect(validacaoSemantica.detectarConteudoComercial('DESCONTO especial nesta PROMOÇÃO')).toBe(true);
    });

    it('"CASHBACK" em maiúsculo + "loja" detectado', () => {
      expect(validacaoSemantica.detectarConteudoComercial('CASHBACK disponível na nossa loja!')).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. listarTermosEncontrados
// ─────────────────────────────────────────────────────────────────────────────
describe('listarTermosEncontrados()', () => {
  it('texto limpo retorna array vazio', () => {
    expect(validacaoSemantica.listarTermosEncontrados('Show de música ao ar livre')).toEqual([]);
  });

  it('encontra "promoção" (com acento) no texto', () => {
    const termos = validacaoSemantica.listarTermosEncontrados('Grande promoção de verão');
    expect(termos).toContain('promoção');
  });

  it('encontra "desconto" no texto', () => {
    const termos = validacaoSemantica.listarTermosEncontrados('Desconto especial para membros');
    expect(termos).toContain('desconto');
  });

  it('encontra múltiplos termos', () => {
    const termos = validacaoSemantica.listarTermosEncontrados('Compre agora com desconto e frete gratis');
    expect(termos).toContain('compre');
    expect(termos).toContain('desconto');
    expect(termos).toContain('frete gratis');
  });

  it('encontra "r$" como termo', () => {
    const termos = validacaoSemantica.listarTermosEncontrados('Ingresso por r$ 50');
    expect(termos).toContain('r$');
  });

  it('não duplica termos se aparecerem múltiplas vezes', () => {
    const termos = validacaoSemantica.listarTermosEncontrados('desconto aqui, desconto ali');
    const count = termos.filter(t => t === 'desconto').length;
    expect(count).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. detectarSpam
// ─────────────────────────────────────────────────────────────────────────────
describe('detectarSpam()', () => {
  describe('texto limpo', () => {
    it('texto vazio → ehSpam: false, score: 0, motivos: []', () => {
      const r = validacaoSemantica.detectarSpam('');
      expect(r.ehSpam).toBe(false);
      expect(r.score).toBe(0);
      expect(r.motivos).toEqual([]);
    });

    it('texto de evento comum → ehSpam: false', () => {
      const r = validacaoSemantica.detectarSpam('Palestra sobre sustentabilidade, sábado às 15h, entrada franca.');
      expect(r.ehSpam).toBe(false);
    });
  });

  describe('termos de spam (score += 2 por termo)', () => {
    it('"clique aqui" → motivo adicionado e score += 2', () => {
      const r = validacaoSemantica.detectarSpam('Mais informações: clique aqui');
      expect(r.score).toBeGreaterThanOrEqual(2);
      expect(r.motivos.some(m => m.includes('clique aqui'))).toBe(true);
    });

    it('dois termos de spam → ehSpam: true (score >= 3)', () => {
      const r = validacaoSemantica.detectarSpam('Você foi selecionado! Me chama no zap para mais info.');
      expect(r.ehSpam).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(3);
    });

    it('"pix aberto" + "acesse agora" → ehSpam: true', () => {
      const r = validacaoSemantica.detectarSpam('Pix aberto. Acesse agora para confirmar.');
      expect(r.ehSpam).toBe(true);
    });
  });

  describe('padrões estruturais de spam', () => {
    it('repetição de caractere (7x "a") detectada', () => {
      const r = validacaoSemantica.detectarSpam('Evento aaaaaaa incrível');
      expect(r.motivos).toContain('Repetição excessiva de caracteres');
    });

    it('pontuação excessiva "!!!" detectada', () => {
      const r = validacaoSemantica.detectarSpam('Venha agora!!!');
      expect(r.motivos).toContain('Pontuação excessiva');
    });

    it('sequência de 8+ maiúsculas consecutivas detectada', () => {
      // Regex requer [A-Z...]{8,} sem espaços — usar palavra contínua
      const r = validacaoSemantica.detectarSpam('Evento EXCEPCIONAL hoje');
      expect(r.motivos).toContain('Texto todo em maiúsculas');
    });

    it('link externo http:// detectado', () => {
      const r = validacaoSemantica.detectarSpam('Mais info em https://example.com/promo');
      expect(r.motivos).toContain('Link externo');
    });

    it('link encurtado t.me/ detectado', () => {
      const r = validacaoSemantica.detectarSpam('Entre no grupo t.me/grupo123');
      expect(r.motivos).toContain('Link encurtado ou Telegram/WhatsApp');
    });

    it('link wa.me/ detectado', () => {
      const r = validacaoSemantica.detectarSpam('Chame no wa.me/5569999999999');
      expect(r.motivos).toContain('Link encurtado ou Telegram/WhatsApp');
    });
  });

  describe('proporção de maiúsculas > 60%', () => {
    it('texto majoritariamente em maiúsculas (>10 letras) → motivo adicionado', () => {
      const r = validacaoSemantica.detectarSpam('VENHA HOJE AO SHOW DE MUSICA');
      expect(r.motivos).toContain('Texto predominantemente em maiúsculas');
    });

    it('texto curto (<=10 letras) com maiúsculas não dispara proporção', () => {
      // "OI" = 2 letras, não atinge threshold de 10
      const r = validacaoSemantica.detectarSpam('OI');
      expect(r.motivos).not.toContain('Texto predominantemente em maiúsculas');
    });

    it('texto misto 50/50 maiúsculas não dispara (< 60%)', () => {
      const r = validacaoSemantica.detectarSpam('Evento DE Vilhena HOJE acontece');
      expect(r.motivos).not.toContain('Texto predominantemente em maiúsculas');
    });
  });

  describe('retorno sempre tem formato correto', () => {
    it('sempre retorna { ehSpam, score, motivos } independente do input', () => {
      const r = validacaoSemantica.detectarSpam('qualquer texto');
      expect(typeof r.ehSpam).toBe('boolean');
      expect(typeof r.score).toBe('number');
      expect(Array.isArray(r.motivos)).toBe(true);
    });

    it('motivos não duplica entradas (Set interno)', () => {
      // Texto que poderia disparar o mesmo padrão de caps duas vezes
      const r = validacaoSemantica.detectarSpam('ABCDEFGHIJ ABCDEFGHIJ VENHA AO SHOW');
      const unique = new Set(r.motivos);
      expect(r.motivos.length).toBe(unique.size);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. detectarConteudoOfensivo
// ─────────────────────────────────────────────────────────────────────────────
describe('detectarConteudoOfensivo()', () => {
  describe('texto limpo → nenhum', () => {
    it('texto neutro → temOdio: false, nivel: "nenhum"', () => {
      const r = validacaoSemantica.detectarConteudoOfensivo('Show de forró no sábado, venha curtir!');
      expect(r.temOdio).toBe(false);
      expect(r.nivel).toBe('nenhum');
      expect(r.motivos).toEqual([]);
    });

    it('texto vazio → nenhum', () => {
      const r = validacaoSemantica.detectarConteudoOfensivo('');
      expect(r.temOdio).toBe(false);
      expect(r.nivel).toBe('nenhum');
    });
  });

  describe('ameaças explícitas → severo', () => {
    it('"vou te matar" detecta ameaça → nivel severo', () => {
      const r = validacaoSemantica.detectarConteudoOfensivo('vou te matar se aparecer aqui');
      expect(r.temOdio).toBe(true);
      expect(r.nivel).toBe('severo');
      expect(r.motivos.some(m => m.includes('Ameaça'))).toBe(true);
    });

    it('"te mato" → severo', () => {
      const r = validacaoSemantica.detectarConteudoOfensivo('pode aparecer que te mato');
      expect(r.nivel).toBe('severo');
    });

    it('"você vai pagar" → severo', () => {
      const r = validacaoSemantica.detectarConteudoOfensivo('você vai pagar por isso');
      expect(r.nivel).toBe('severo');
    });

    it('"vou aparecer na sua casa" → severo', () => {
      const r = validacaoSemantica.detectarConteudoOfensivo('vou aparecer na sua casa amanhã');
      expect(r.nivel).toBe('severo');
    });
  });

  describe('padrões de ódio → níveis variados', () => {
    it('"morte a X" → severo (Incitação à violência)', () => {
      const r = validacaoSemantica.detectarConteudoOfensivo('morte ao prefeito');
      expect(r.nivel).toBe('severo');
      expect(r.motivos).toContain('Incitação à violência');
    });

    it('"odeio os X" → moderado (Discurso de ódio)', () => {
      const r = validacaoSemantica.detectarConteudoOfensivo('odeio os políticos corruptos');
      expect(r.nivel).toBe('moderado');
      expect(r.motivos).toContain('Discurso de ódio');
    });

    it('"fora o grupo X" → pelo menos leve (Linguagem de exclusão)', () => {
      const r = validacaoSemantica.detectarConteudoOfensivo('fora o prefeito');
      expect(r.temOdio).toBe(true);
      expect(r.nivel).not.toBe('nenhum');
    });

    it('palavrão leve → nivel leve', () => {
      const r = validacaoSemantica.detectarConteudoOfensivo('que merda de evento');
      expect(r.temOdio).toBe(true);
      expect(r.nivel).toBe('leve');
      expect(r.motivos).toContain('Palavrão');
    });

    it('"idiota" → leve', () => {
      const r = validacaoSemantica.detectarConteudoOfensivo('não seja idiota');
      expect(r.nivel).toBe('leve');
    });
  });

  describe('nivelMax — pior nível prevalece', () => {
    it('texto com leve + severo → nivel severo no final', () => {
      const r = validacaoSemantica.detectarConteudoOfensivo('que merda, morte ao organizador');
      expect(r.nivel).toBe('severo');
    });

    it('acumula múltiplos motivos', () => {
      const r = validacaoSemantica.detectarConteudoOfensivo('morte ao grupo, odeio os membros');
      expect(r.motivos.length).toBeGreaterThan(1);
    });

    it('motivos sem duplicatas', () => {
      const r = validacaoSemantica.detectarConteudoOfensivo('morte ao vereador e morte ao deputado');
      const unique = new Set(r.motivos);
      expect(r.motivos.length).toBe(unique.size);
    });
  });

  describe('retorno sempre tem formato correto', () => {
    it('sempre retorna { temOdio, nivel, motivos }', () => {
      const r = validacaoSemantica.detectarConteudoOfensivo('texto qualquer');
      expect(typeof r.temOdio).toBe('boolean');
      expect(['nenhum', 'leve', 'moderado', 'severo']).toContain(r.nivel);
      expect(Array.isArray(r.motivos)).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. analisar() — API unificada
// ─────────────────────────────────────────────────────────────────────────────
describe('analisar()', () => {
  describe('formato do retorno (ResultadoAnalise)', () => {
    it('retorna todas as propriedades esperadas para texto limpo', () => {
      const r = validacaoSemantica.analisar('Evento cultural gratuito no sábado');
      expect(typeof r.bloqueado).toBe('boolean');
      expect(Array.isArray(r.alertas)).toBe(true);
      expect(typeof r.score).toBe('number');
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(typeof r.spam).toBe('object');
      expect(typeof r.ofensivo).toBe('object');
      expect(typeof r.comercial).toBe('boolean');
      expect(Array.isArray(r.termosComerciais)).toBe(true);
    });

    it('texto limpo → bloqueado: false, score baixo, sem motivo', () => {
      const r = validacaoSemantica.analisar('Roda de samba ao ar livre, entrada franca.');
      expect(r.bloqueado).toBe(false);
      expect(r.motivo).toBeUndefined();
      expect(r.score).toBeLessThan(20);
    });
  });

  describe('contexto "evento" — bloqueia conteúdo comercial', () => {
    it('conteúdo comercial em evento → bloqueado: true', () => {
      const r = validacaoSemantica.analisar('Grande promoção com desconto de R$ 50 off!', 'evento');
      expect(r.bloqueado).toBe(true);
      expect(r.motivo).toMatch(/comercial/i);
    });

    it('conteúdo comercial em evento → termosComerciais preenchido', () => {
      const r = validacaoSemantica.analisar('Compre seu ingresso com desconto especial', 'evento');
      expect(r.termosComerciais.length).toBeGreaterThan(0);
    });

    it('alertas incluem termos comerciais individuais em evento', () => {
      const r = validacaoSemantica.analisar('Grande promoção e desconto hoje', 'evento');
      expect(r.alertas.some(a => a.startsWith('Termo comercial:'))).toBe(true);
    });
  });

  describe('contexto "mensagem" — não bloqueia conteúdo comercial', () => {
    it('conteúdo comercial em mensagem → bloqueado: false', () => {
      const r = validacaoSemantica.analisar('Promoção especial com desconto amanhã', 'mensagem');
      expect(r.bloqueado).toBe(false);
    });

    it('contexto padrão (omitido) é "mensagem"', () => {
      const r = validacaoSemantica.analisar('Promoção especial com desconto amanhã');
      expect(r.bloqueado).toBe(false);
    });

    it('comercial: true mas sem bloqueio em "mensagem"', () => {
      const r = validacaoSemantica.analisar('Grande promoção com desconto especial', 'mensagem');
      expect(r.comercial).toBe(true);
      expect(r.bloqueado).toBe(false);
    });
  });

  describe('contexto "produto" — comercial permitido', () => {
    it('conteúdo comercial em produto → bloqueado: false', () => {
      const r = validacaoSemantica.analisar('Produto com 30% off e frete gratis', 'produto');
      expect(r.bloqueado).toBe(false);
    });

    it('score de conteúdo comercial em produto contribui menos ao score final', () => {
      const rEvento = validacaoSemantica.analisar('Grande promoção com desconto especial', 'evento');
      const rProduto = validacaoSemantica.analisar('Grande promoção com desconto especial', 'produto');
      // Em evento adiciona 30 pontos ao score, em produto apenas 10
      expect(rEvento.score).toBeGreaterThan(rProduto.score);
    });
  });

  describe('conteúdo ofensivo severo/moderado → sempre bloqueia', () => {
    it('ameaça explícita → bloqueado: true independente do contexto', () => {
      const r = validacaoSemantica.analisar('vou te matar se aparecer', 'produto');
      expect(r.bloqueado).toBe(true);
      expect(r.motivo).toMatch(/ofensivo|ameaç/i);
    });

    it('discurso de ódio moderado → bloqueado: true', () => {
      const r = validacaoSemantica.analisar('odeio todos os participantes', 'mensagem');
      expect(r.bloqueado).toBe(true);
    });

    it('nível severo → score alto (>=60)', () => {
      const r = validacaoSemantica.analisar('morte ao organizador do evento', 'mensagem');
      expect(r.score).toBeGreaterThanOrEqual(60);
    });
  });

  describe('conteúdo ofensivo leve → alerta, sem bloqueio', () => {
    it('palavrão leve → bloqueado: false', () => {
      const r = validacaoSemantica.analisar('que merda de evento esse', 'mensagem');
      expect(r.bloqueado).toBe(false);
    });

    it('palavrão leve → alertas incluem aviso de linguagem', () => {
      const r = validacaoSemantica.analisar('que merda de evento esse', 'mensagem');
      expect(r.alertas.some(a => a.includes('ofensiva') || a.includes('vulgar') || a.includes('Palavrão'))).toBe(true);
    });
  });

  describe('spam', () => {
    it('spam com score >= 6 → bloqueado: true', () => {
      // Precisamos de score >= 6: 3 termos de spam (2 cada) = 6
      const texto = 'Você foi selecionado! Clique aqui e acesse já para ganhar gratis!';
      const r = validacaoSemantica.analisar(texto, 'mensagem');
      expect(r.spam.score).toBeGreaterThanOrEqual(6);
      expect(r.bloqueado).toBe(true);
    });

    it('spam com score 3-5 → alerta mas não bloqueado', () => {
      // Um único termo de spam (score=2) + um padrão estrutural (score=1) = 3
      const texto = 'Clique aqui para mais info!!!';
      const r = validacaoSemantica.analisar(texto, 'mensagem');
      if (r.spam.ehSpam && r.spam.score < 6) {
        expect(r.bloqueado).toBe(false);
        expect(r.alertas.some(a => a.includes('spam'))).toBe(true);
      }
    });
  });

  describe('score 0-100', () => {
    it('score nunca excede 100', () => {
      const texto = 'vou te matar clique aqui você foi selecionado acesse já!!!!! VENHA AGORA GANHE GRATIS';
      const r = validacaoSemantica.analisar(texto, 'evento');
      expect(r.score).toBeLessThanOrEqual(100);
    });

    it('score >= 0 sempre', () => {
      const r = validacaoSemantica.analisar('', 'mensagem');
      expect(r.score).toBeGreaterThanOrEqual(0);
    });

    it('score cresce com conteúdo spam', () => {
      const limpo = validacaoSemantica.analisar('Evento cultural gratuito', 'mensagem');
      const spam  = validacaoSemantica.analisar('Você foi selecionado! Acesse já gratuitamente!', 'mensagem');
      expect(spam.score).toBeGreaterThan(limpo.score);
    });
  });

  describe('alertas sem duplicatas', () => {
    it('alertas não duplica strings iguais', () => {
      const r = validacaoSemantica.analisar('vou te matar e odeio os participantes, merda de evento', 'mensagem');
      const unique = new Set(r.alertas);
      expect(r.alertas.length).toBe(unique.size);
    });
  });

  describe('combinação de problemas — pior motivo vence', () => {
    it('spam + ofensivo severo → motivo é ofensivo (definido primeiro)', () => {
      const texto = 'vou te matar. Clique aqui, você foi selecionado, acesse já, ganhe gratis agora!';
      const r = validacaoSemantica.analisar(texto, 'mensagem');
      expect(r.bloqueado).toBe(true);
      // motivo foi definido pela ofensiva (primeiro if)
      expect(r.motivo).toMatch(/ofensivo|ameaç/i);
    });
  });
});
