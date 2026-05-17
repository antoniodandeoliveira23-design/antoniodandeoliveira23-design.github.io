/**
 * components/MapaInterativo.tsx  ← WEB ONLY
 *
 * Carregada pelo Metro apenas em web (Platform.OS === 'web').
 * Para iOS/Android o Metro usa MapaInterativo.native.tsx automaticamente.
 *
 * Usa Leaflet via CDN (dark theme CartoDb) — sem API key necessária.
 */

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Evento } from '@/types';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

const ICON_EMOJI: Record<string, string> = {
  musica:      '🎵',
  teatro:      '🎭',
  esporte:     '⚽',
  educacao:    '📚',
  feira:       '🏪',
  cultura:     '🏛️',
  gastronomia: '🍽️',
  negocios:    '💼',
  religiao:    '❤️',
  governo:     '🏳️',
  outro:       '📅',
};

interface MapaInterativoProps {
  eventos: Evento[];
  onEventoPress?: (evento: Evento) => void;
  centro?: { lat: number; lng: number };
  zoom?: number;
}

// Injeta o CSS do Leaflet no <head> uma única vez
function injetarCSS() {
  if (document.getElementById('leaflet-css')) return;
  const link = document.createElement('link');
  link.id = 'leaflet-css';
  link.rel = 'stylesheet';
  link.href = LEAFLET_CSS;
  document.head.appendChild(link);
}

// Injeta e aguarda o JS do Leaflet
function carregarLeaflet(): Promise<any> {
  const L = (window as any).L;
  if (L) return Promise.resolve(L);

  return new Promise((resolve, reject) => {
    const existing = document.getElementById('leaflet-js');
    if (existing) {
      // script já injetado, aguarda `window.L` aparecer
      const t = setInterval(() => {
        if ((window as any).L) { clearInterval(t); resolve((window as any).L); }
      }, 50);
      return;
    }

    const script = document.createElement('script');
    script.id  = 'leaflet-js';
    script.src = LEAFLET_JS;
    script.onload  = () => resolve((window as any).L);
    script.onerror = () => reject(new Error('Leaflet JS falhou ao carregar'));
    document.head.appendChild(script);
  });
}

export default function MapaInterativo({
  eventos,
  onEventoPress,
  centro = { lat: -12.7405, lng: -60.1458 },
  zoom = 13,
}: MapaInterativoProps) {
  const wrapperRef   = useRef<HTMLDivElement | null>(null);
  const mapRef       = useRef<any>(null);
  const markersRef   = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const onPressRef   = useRef(onEventoPress);
  onPressRef.current = onEventoPress;

  // ── Inicializa o mapa uma vez ────────────────────────────
  useEffect(() => {
    injetarCSS();

    let destroyed = false;
    let resizeObserver: ResizeObserver | null = null;

    carregarLeaflet()
      .then((L) => {
        if (destroyed || !wrapperRef.current || mapRef.current) return;

        const map = L.map(wrapperRef.current, {
          zoomControl:       false,
          attributionControl: false,
        }).setView([centro.lat, centro.lng], zoom);

        L.tileLayer(
          'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
          { maxZoom: 19, subdomains: 'abcd' },
        ).addTo(map);

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        mapRef.current = map;

        // ResizeObserver garante que invalidateSize() é chamado sempre que
        // o container muda de tamanho (scroll, orientação, lazy mount, etc.)
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => {
            map.invalidateSize();
          });
          resizeObserver.observe(wrapperRef.current);
        }

        // Chamadas de segurança adicionais para garantir que o mapa renderize
        setTimeout(() => { if (!destroyed) { map.invalidateSize(); setMapReady(true); } }, 100);
        setTimeout(() => { if (!destroyed) map.invalidateSize(); }, 500);
        setTimeout(() => { if (!destroyed) map.invalidateSize(); }, 1000);
      })
      .catch(() => { /* CDN inacessível — mapa não renderiza, sem crash */ });

    return () => {
      destroyed = true;
      resizeObserver?.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current = [];
        setMapReady(false);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Atualiza marcadores quando eventos mudam ─────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    eventos.forEach((evento) => {
      if (!evento.lat || !evento.lng) return;

      const emoji    = ICON_EMOJI[evento.categoria] || '📅';
      const destaque = evento.destaque;
      const size     = destaque ? 44 : 36;

      const icon = L.divIcon({
        className: 'agora-marker',
        html: `<div style="
          width:${size}px;height:${size}px;border-radius:50%;
          background:${destaque ? '#FF7A00' : '#6A32C9'};
          border:3px solid ${destaque ? '#FF9A33' : '#8B5CF6'};
          display:flex;align-items:center;justify-content:center;
          font-size:${destaque ? 20 : 16}px;cursor:pointer;
          box-shadow:0 2px 12px rgba(0,0,0,.6);transition:transform .2s;
        ">${emoji}</div>`,
        iconSize:   [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([evento.lat, evento.lng], { icon }).addTo(mapRef.current);

      marker.bindPopup(`
        <div style="
          background:#2D1B4E;color:#fff;padding:12px 16px;border-radius:12px;
          min-width:200px;font-family:system-ui,-apple-system,sans-serif;
          box-shadow:0 4px 16px rgba(0,0,0,.4);
        ">
          <div style="font-size:15px;font-weight:bold;margin-bottom:6px;">${emoji} ${evento.nome}</div>
          <div style="font-size:12px;color:#A0A0B0;margin-bottom:4px;">
            <span style="color:#8B5CF6">📍</span> ${evento.local}
          </div>
          <div style="font-size:12px;color:#FF7A00;font-weight:600;">
            📅 ${new Date(evento.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </div>
          ${destaque ? '<div style="font-size:10px;color:#FF7A00;margin-top:6px;background:rgba(255,122,0,.15);display:inline-block;padding:2px 8px;border-radius:99px;">⭐ Destaque</div>' : ''}
          <div style="font-size:11px;color:#8B5CF6;margin-top:8px;font-weight:600;">Toque para ver detalhes →</div>
        </div>
      `, { className: 'agora-popup', closeButton: false, offset: [0, -10] });

      marker.on('click', () => onPressRef.current?.(evento));
      markersRef.current.push(marker);
    });

    if (markersRef.current.length > 0) {
      try {
        const group = L.featureGroup(markersRef.current);
        mapRef.current.fitBounds(group.getBounds().pad(0.3));
      } catch {
        // fitBounds falha se bounds inválidos — mantém view padrão
      }
    }
  }, [eventos, mapReady]);

  return (
    <View style={styles.container}>
      {/* div nativo: Leaflet monta aqui — posição absoluta garante 100% do espaço */}
      <div
        ref={wrapperRef}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16 }}
      />

      {/* Estilos do Leaflet customizados — injetados inline no DOM */}
      <style>{`
        .agora-popup .leaflet-popup-content-wrapper {
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .agora-popup .leaflet-popup-content { margin: 0 !important; }
        .agora-popup .leaflet-popup-tip { background: #2D1B4E !important; }
        .agora-marker div:hover { transform: scale(1.15) !important; }
        .leaflet-control-zoom a {
          background: #2D1B4E !important;
          color: #fff !important;
          border: 1px solid #3D2B5E !important;
          width: 32px !important; height: 32px !important; line-height: 32px !important;
          font-size: 16px !important;
        }
        .leaflet-control-zoom a:hover { background: #6A32C9 !important; }
        .leaflet-control-zoom {
          border: none !important;
          box-shadow: 0 2px 8px rgba(0,0,0,.3) !important;
          border-radius: 8px !important; overflow: hidden;
        }
      `}</style>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
});
