import { Platform } from 'react-native';
import * as Location from 'expo-location';

// ─────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────

export interface Coordenadas {
  lat: number;
  lng: number;
}

export type StatusGPS = 'idle' | 'loading' | 'ok' | 'negado' | 'indisponivel';

// ─────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────

/** Coordenadas padrão: Vilhena-RO — fallback quando GPS está indisponível */
export const COORDS_PADRAO: Coordenadas = { lat: -12.7405, lng: -60.1458 };

const CACHE_TTL_MS = 5 * 60_000; // 5 minutos

// ─────────────────────────────────────────────────────────
// Cache module-level
// ─────────────────────────────────────────────────────────

let _cache: { coords: Coordenadas; ts: number } | null = null;

// ─────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────

export const localizacaoService = {
  /**
   * Tenta obter a posição atual do dispositivo.
   * - Usa cache de 5 minutos para evitar chamadas repetidas.
   * - Retorna null quando permissão é negada ou GPS indisponível.
   * - Funciona em Web (navigator.geolocation) e Native (expo-location).
   */
  async obterPosicao(): Promise<Coordenadas | null> {
    // Cache ainda válido?
    if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) {
      return _cache.coords;
    }

    try {
      if (Platform.OS === 'web') {
        return await this._obterWeb();
      }
      return await this._obterNativa();
    } catch {
      return null;
    }
  },

  /** Resolve a posição via Web Geolocation API */
  async _obterWeb(): Promise<Coordenadas | null> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;

    return new Promise<Coordenadas | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: Coordenadas = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          _cache = { coords, ts: Date.now() };
          resolve(coords);
        },
        () => resolve(null),
        { timeout: 4000, maximumAge: CACHE_TTL_MS },
      );
    });
  },

  /** Resolve a posição via expo-location (Android / iOS) */
  async _obterNativa(): Promise<Coordenadas | null> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const coords: Coordenadas = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    };
    _cache = { coords, ts: Date.now() };
    return coords;
  },

  /**
   * Invalida o cache forçando nova leitura na próxima chamada.
   * Útil quando o usuário solicita atualização manual.
   */
  limparCache(): void {
    _cache = null;
  },

  /** Retorna true se o cache está ativo (posição recente disponível) */
  temCacheAtivo(): boolean {
    return !!(_cache && Date.now() - _cache.ts < CACHE_TTL_MS);
  },
};
