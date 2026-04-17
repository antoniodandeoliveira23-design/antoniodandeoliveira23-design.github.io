import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { Evento } from '@/types';

const ICON_EMOJI: Record<string, string> = {
  musica: '🎵',
  teatro: '🎭',
  esporte: '⚽',
  educacao: '📚',
  feira: '🏪',
  cultura: '🏛️',
  gastronomia: '🍽️',
  negocios: '💼',
  religiao: '❤️',
  governo: '🏳️',
  outro: '📅',
};

interface MapaInterativoProps {
  eventos: Evento[];
  onEventoPress?: (evento: Evento) => void;
  centro?: { lat: number; lng: number };
  zoom?: number;
}

export default function MapaInterativo({
  eventos,
  onEventoPress,
  centro = { lat: -12.7405, lng: -60.1458 },
  zoom = 14,
}: MapaInterativoProps) {
  const containerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const onEventoPressRef = useRef(onEventoPress);
  onEventoPressRef.current = onEventoPress;

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // Load Leaflet CSS
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    // Load Leaflet JS
    const loadLeaflet = (): Promise<any> => {
      if ((window as any).L) return Promise.resolve((window as any).L);
      return new Promise((resolve) => {
        if (document.getElementById('leaflet-js')) {
          const check = setInterval(() => {
            if ((window as any).L) { clearInterval(check); resolve((window as any).L); }
          }, 100);
          return;
        }
        const script = document.createElement('script');
        script.id = 'leaflet-js';
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => resolve((window as any).L);
        document.head.appendChild(script);
      });
    };

    loadLeaflet().then((L) => {
      if (!containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([centro.lat, centro.lng], zoom);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      mapRef.current = map;

      setTimeout(() => {
        map.invalidateSize();
        setMapReady(true);
      }, 300);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update markers when eventos change OR map becomes ready
  useEffect(() => {
    if (Platform.OS !== 'web' || !mapReady || !mapRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    eventos.forEach((evento) => {
      if (!evento.lat || !evento.lng) return;

      const emoji = ICON_EMOJI[evento.categoria] || '📅';
      const isDestaque = evento.destaque;

      const icon = L.divIcon({
        className: 'agora-marker',
        html: `<div style="
          width: ${isDestaque ? 44 : 36}px;
          height: ${isDestaque ? 44 : 36}px;
          border-radius: 50%;
          background: ${isDestaque ? '#FF7A00' : '#6A32C9'};
          border: 3px solid ${isDestaque ? '#FF9A33' : '#8B5CF6'};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: ${isDestaque ? 20 : 16}px;
          cursor: pointer;
          box-shadow: 0 2px 12px rgba(0,0,0,0.6);
          transition: transform 0.2s;
        ">${emoji}</div>`,
        iconSize: [isDestaque ? 44 : 36, isDestaque ? 44 : 36],
        iconAnchor: [isDestaque ? 22 : 18, isDestaque ? 22 : 18],
      });

      const marker = L.marker([evento.lat, evento.lng], { icon }).addTo(mapRef.current);

      const popupContent = `
        <div style="
          background: #2D1B4E;
          color: white;
          padding: 12px 16px;
          border-radius: 12px;
          min-width: 200px;
          font-family: system-ui, -apple-system, sans-serif;
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        ">
          <div style="font-size: 15px; font-weight: bold; margin-bottom: 6px;">${emoji} ${evento.nome}</div>
          <div style="font-size: 12px; color: #A0A0B0; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
            <span style="color: #8B5CF6;">📍</span> ${evento.local}
          </div>
          <div style="font-size: 12px; color: #FF7A00; font-weight: 600;">
            📅 ${new Date(evento.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </div>
          ${isDestaque ? '<div style="font-size: 10px; color: #FF7A00; margin-top: 6px; background: rgba(255,122,0,0.15); display: inline-block; padding: 2px 8px; border-radius: 99px;">⭐ Destaque</div>' : ''}
          <div style="font-size: 11px; color: #8B5CF6; margin-top: 8px; cursor: pointer; font-weight: 600;">Toque para ver detalhes →</div>
        </div>
      `;

      marker.bindPopup(popupContent, {
        className: 'agora-popup',
        closeButton: false,
        offset: [0, -10],
      });

      marker.on('click', () => {
        if (onEventoPressRef.current) {
          onEventoPressRef.current(evento);
        }
      });

      markersRef.current.push(marker);
    });

    // Fit bounds if there are events
    if (markersRef.current.length > 0) {
      const group = L.featureGroup(markersRef.current);
      mapRef.current.fitBounds(group.getBounds().pad(0.3));
    }
  }, [eventos, mapReady]);

  if (Platform.OS !== 'web') {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 16,
          overflow: 'hidden',
        }}
      />
      <style>{`
        .agora-popup .leaflet-popup-content-wrapper {
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 !important;
          border-radius: 12px !important;
        }
        .agora-popup .leaflet-popup-content {
          margin: 0 !important;
        }
        .agora-popup .leaflet-popup-tip {
          background: #2D1B4E !important;
        }
        .agora-marker div:hover {
          transform: scale(1.15) !important;
        }
        .leaflet-control-zoom a {
          background: #2D1B4E !important;
          color: white !important;
          border: 1px solid #3D2B5E !important;
          width: 32px !important;
          height: 32px !important;
          line-height: 32px !important;
          font-size: 16px !important;
        }
        .leaflet-control-zoom a:hover {
          background: #6A32C9 !important;
        }
        .leaflet-control-zoom {
          border: none !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
          border-radius: 8px !important;
          overflow: hidden;
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
  },
});
