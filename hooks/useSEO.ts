/**
 * useSEO — atualiza title, description e Open Graph por página (web only).
 *
 * Uso:
 *   useSEO({ titulo: 'Eventos em Vilhena', descricao: 'Descubra...' })
 */

import { useEffect } from 'react';
import { Platform } from 'react-native';

const APP_URL   = process.env.EXPO_PUBLIC_APP_URL ?? 'https://antoniodandeoliveira23-designgithub-q4yxy93ji.vercel.app';
const OG_IMAGE  = `${APP_URL}/assets/images/og-image.png`;
const SITE_NAME = 'AGORA';

interface SEOOptions {
  titulo?: string;
  descricao?: string;
  imagem?: string;
  url?: string;
  tipo?: 'website' | 'article' | 'event';
}

function setMeta(name: string, content: string, isProperty = false) {
  if (typeof document === 'undefined') return;
  const attr  = isProperty ? 'property' : 'name';
  const query = `meta[${attr}="${name}"]`;
  let tag = document.querySelector(query) as HTMLMetaElement | null;
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, name);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

export function useSEO({ titulo, descricao, imagem, url, tipo = 'website' }: SEOOptions = {}) {
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const tituloFinal    = titulo    ? `${titulo} — ${SITE_NAME}` : `${SITE_NAME} · Eventos em Vilhena`;
    const descricaoFinal = descricao ?? 'Descubra eventos, promoções e serviços perto de você em Vilhena – RO.';
    const imagemFinal    = imagem    ?? OG_IMAGE;
    const urlFinal       = url       ?? (typeof window !== 'undefined' ? window.location.href : APP_URL);

    // Título da aba
    document.title = tituloFinal;

    // Meta básico
    setMeta('description',        descricaoFinal);
    setMeta('keywords',           'eventos vilhena, agora app, shows vilhena, rondônia eventos, agenda cultural, eventos rondônia');

    // Open Graph (Facebook, WhatsApp, LinkedIn)
    setMeta('og:type',            tipo,           true);
    setMeta('og:site_name',       SITE_NAME,      true);
    setMeta('og:title',           tituloFinal,    true);
    setMeta('og:description',     descricaoFinal, true);
    setMeta('og:image',           imagemFinal,    true);
    setMeta('og:image:alt',       tituloFinal,    true);
    setMeta('og:url',             urlFinal,       true);
    setMeta('og:locale',          'pt_BR',        true);

    // Twitter Card
    setMeta('twitter:card',       'summary_large_image');
    setMeta('twitter:title',      tituloFinal);
    setMeta('twitter:description', descricaoFinal);
    setMeta('twitter:image',      imagemFinal);
  }, [titulo, descricao, imagem, url, tipo]);
}
