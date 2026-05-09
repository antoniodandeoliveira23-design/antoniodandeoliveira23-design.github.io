/**
 * components/MapaInterativo.native.tsx
 *
 * Implementação nativa do mapa usando react-native-maps.
 * Carregada automaticamente pelo Metro bundler em iOS e Android.
 * Para web, o bundler usa MapaInterativo.tsx (Leaflet via CDN).
 *
 * iOS   → Apple Maps (PROVIDER_DEFAULT, sem API key necessária)
 * Android → Google Maps (requer YOUR_GOOGLE_MAPS_API_KEY no app.json)
 */

import React from 'react';
import {
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Callout, Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import type { Evento } from '@/types';

// ── Emoji por categoria ───────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────

/** Converte zoom Leaflet (inteiro) em latitudeDelta aproximado */
function zoomParaDelta(zoom: number): number {
  return 360 / Math.pow(2, zoom) * 1.5;
}

// ── Props ─────────────────────────────────────────────────────────

interface MapaInterativoProps {
  eventos: Evento[];
  onEventoPress?: (evento: Evento) => void;
  centro?: { lat: number; lng: number };
  zoom?: number;
}

// ── Componente ────────────────────────────────────────────────────

export default function MapaInterativo({
  eventos,
  onEventoPress,
  centro = { lat: -12.7405, lng: -60.1458 },
  zoom = 14,
}: MapaInterativoProps) {
  const delta = zoomParaDelta(zoom);

  const abrirGoogleMaps = (evento: Evento) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${evento.lat},${evento.lng}`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <MapView
      style={styles.map}
      provider={PROVIDER_DEFAULT}
      initialRegion={{
        latitude:        centro.lat,
        longitude:       centro.lng,
        latitudeDelta:   delta,
        longitudeDelta:  delta,
      }}
      customMapStyle={DARK_MAP_STYLE}
      showsUserLocation
      showsMyLocationButton={false}
      showsCompass={false}
      toolbarEnabled={false}
    >
      {eventos.map((evento) => {
        if (!evento.lat || !evento.lng) return null;
        const emoji    = ICON_EMOJI[evento.categoria] ?? '📅';
        const destaque = evento.destaque;

        return (
          <Marker
            key={evento.id}
            coordinate={{ latitude: evento.lat, longitude: evento.lng }}
            onPress={() => onEventoPress?.(evento)}
            tracksViewChanges={false}
          >
            {/* Pin personalizado */}
            <View style={[styles.pin, destaque && styles.pinDestaque]}>
              <Text style={[styles.pinEmoji, destaque && styles.pinEmojiGrande]}>
                {emoji}
              </Text>
            </View>

            {/* Callout (balão de informação) */}
            <Callout tooltip onPress={() => onEventoPress?.(evento)}>
              <View style={styles.callout}>
                <Text style={styles.calloutNome} numberOfLines={2}>
                  {emoji} {evento.nome}
                </Text>
                <Text style={styles.calloutLocal} numberOfLines={1}>
                  📍 {evento.local}
                </Text>
                <Text style={styles.calloutData}>
                  📅 {new Date(evento.data_inicio).toLocaleDateString('pt-BR', {
                    day:   '2-digit',
                    month: 'short',
                    hour:  '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
                {destaque && (
                  <View style={styles.calloutDestaque}>
                    <Text style={styles.calloutDestaqueText}>⭐ Destaque</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.calloutMaps}
                  onPress={() => abrirGoogleMaps(evento)}
                >
                  <Text style={styles.calloutMapsText}>Abrir no Maps</Text>
                </TouchableOpacity>
                <Text style={styles.calloutCta}>Toque para ver detalhes →</Text>
              </View>
            </Callout>
          </Marker>
        );
      })}
    </MapView>
  );
}

// ── Estilos ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  map: {
    flex: 1,
    borderRadius: 16,
  },

  // Pin do marcador
  pin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CORES.roxo,
    borderWidth: 3,
    borderColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 6,
  },
  pinDestaque: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CORES.laranja,
    borderColor: '#FF9A33',
  },
  pinEmoji: {
    fontSize: 16,
  },
  pinEmojiGrande: {
    fontSize: 20,
  },

  // Callout (balão)
  callout: {
    backgroundColor: '#2D1B4E',
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    minWidth: 180,
    maxWidth: 240,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  calloutNome: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  calloutLocal: {
    fontSize: FONT_SIZE.xs,
    color: '#A0A0B0',
    marginBottom: 2,
  },
  calloutData: {
    fontSize: FONT_SIZE.xs,
    color: CORES.laranja,
    fontWeight: '600',
    marginBottom: 6,
  },
  calloutDestaque: {
    backgroundColor: 'rgba(255,122,0,0.15)',
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  calloutDestaqueText: {
    fontSize: 10,
    color: CORES.laranja,
    fontWeight: '600',
  },
  calloutMaps: {
    backgroundColor: CORES.roxo,
    borderRadius: RADIUS.sm,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  calloutMapsText: {
    fontSize: 11,
    color: '#FFF',
    fontWeight: '700',
  },
  calloutCta: {
    fontSize: 10,
    color: '#8B5CF6',
    fontWeight: '600',
  },
});

// ── Google Maps dark style ────────────────────────────────────────
// Compatible com iOS (Apple Maps ignora, usa tema do sistema) e Android

const DARK_MAP_STYLE = [
  { elementType: 'geometry',            stylers: [{ color: '#1a0b2e' }] },
  { elementType: 'labels.text.fill',    stylers: [{ color: '#746855' }] },
  { elementType: 'labels.text.stroke',  stylers: [{ color: '#242f3e' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#263c3f' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6b9a76' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#38414e' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#212a37' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9ca5b3' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#746855' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1f2835' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#f3d19c' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#2f3948' }],
  },
  {
    featureType: 'transit.station',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#17263c' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#515c6d' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#17263c' }],
  },
];
