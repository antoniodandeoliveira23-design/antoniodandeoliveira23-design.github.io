/**
 * services/__tests__/localizacao.test.ts
 *
 * Suite de testes para localizacao.ts
 *
 * Correções em relação ao rascunho anterior:
 *   1. expo-location mock: jest.fn() declarado DENTRO da factory (evita TDZ).
 *      Após o mock, importamos o módulo e o casteamos como jest.Mocked para
 *      configurar retornos per-test com .mockResolvedValue().
 *   2. Cache tests: usam o navigator.geolocation mockado para que a _obterWeb
 *      REAL rode e sete _cache (spy substituía a implementação sem setar cache).
 *   3. Platform.OS: getter na factory react-native funciona corretamente para
 *      alternar entre 'web' e 'ios' nos testes.
 *
 * Princípios FIRST:
 *  Fast      — sem I/O real; todos os periféricos mockados
 *  Isolated  — limparCache() + beforeEach garantem _cache limpo
 *  Repeatable — Date.now spy fixo nos testes de TTL
 *  Self-validating — assertions explícitas
 *  Timely    — cobertura pré-produção
 */

// ─── mocks de módulo ──────────────────────────────────────────────────────────

let mockPlatformOS = 'web'; // prefixo "mock" permite uso na factory hoistada

jest.mock('react-native', () => ({
  Platform: { get OS() { return mockPlatformOS; } },
}));

// jest.fn() declarado DENTRO da factory → sem TDZ
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync:           jest.fn(),
  Accuracy: { Balanced: 3 },
}));

// ─── imports (após mocks) ─────────────────────────────────────────────────────

import { localizacaoService, COORDS_PADRAO } from '@/services/localizacao';
import type { Coordenadas, StatusGPS } from '@/services/localizacao';
import * as ExpoLocation from 'expo-location';

// Cast para acessar os jest.fn() com tipagem correta
const mockLocation = ExpoLocation as jest.Mocked<typeof ExpoLocation>;

// ─── helper: substitui navigator.geolocation no jsdom ────────────────────────

function setGeolocation(impl: Partial<Geolocation> | undefined) {
  Object.defineProperty(global.navigator, 'geolocation', {
    value: impl,
    writable: true,
    configurable: true,
  });
}

/** Geolocation que chama success com as coordenadas fornecidas */
function geoSuccess(lat: number, lng: number): Partial<Geolocation> {
  return {
    getCurrentPosition: (
      success: PositionCallback,
      _err: PositionErrorCallback | null,
      _opts?: PositionOptions,
    ) => {
      success({
        coords: { latitude: lat, longitude: lng, accuracy: 5 } as GeolocationCoordinates,
        timestamp: Date.now(),
      } as GeolocationPosition);
    },
  };
}

/** Geolocation que chama o callback de erro */
function geoError(code = 1): Partial<Geolocation> {
  return {
    getCurrentPosition: (
      _success: PositionCallback,
      error: PositionErrorCallback | null,
    ) => {
      error?.({ code, message: 'Erro de localização' } as GeolocationPositionError);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A. COORDS_PADRAO
// ─────────────────────────────────────────────────────────────────────────────
describe('COORDS_PADRAO', () => {
  it('corresponde às coordenadas de Vilhena-RO', () => {
    expect(COORDS_PADRAO.lat).toBeCloseTo(-12.7405, 4);
    expect(COORDS_PADRAO.lng).toBeCloseTo(-60.1458, 4);
  });

  it('é um objeto com propriedades lat e lng numéricas', () => {
    expect(typeof COORDS_PADRAO.lat).toBe('number');
    expect(typeof COORDS_PADRAO.lng).toBe('number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. _obterWeb() — Web Geolocation API
// ─────────────────────────────────────────────────────────────────────────────
describe('_obterWeb()', () => {
  beforeEach(() => {
    localizacaoService.limparCache();
    mockPlatformOS = 'web';
  });

  afterEach(() => {
    setGeolocation(undefined);
  });

  it('retorna null quando navigator.geolocation é undefined', async () => {
    setGeolocation(undefined);
    const resultado = await localizacaoService._obterWeb();
    expect(resultado).toBeNull();
  });

  it('retorna Coordenadas quando getCurrentPosition chama success', async () => {
    setGeolocation(geoSuccess(-12.74, -60.14));
    const resultado = await localizacaoService._obterWeb();
    expect(resultado).toEqual({ lat: -12.74, lng: -60.14 });
  });

  it('retorna null quando getCurrentPosition chama callback de erro', async () => {
    setGeolocation(geoError(1));
    const resultado = await localizacaoService._obterWeb();
    expect(resultado).toBeNull();
  });

  it('popula _cache após posição bem-sucedida', async () => {
    setGeolocation(geoSuccess(-10.0, -50.0));
    expect(localizacaoService.temCacheAtivo()).toBe(false);
    await localizacaoService._obterWeb();
    expect(localizacaoService.temCacheAtivo()).toBe(true);
  });

  it('mapeia latitude → lat e longitude → lng corretamente', async () => {
    setGeolocation(geoSuccess(-3.1234, -45.6789));
    const resultado = await localizacaoService._obterWeb();
    expect(resultado?.lat).toBeCloseTo(-3.1234, 4);
    expect(resultado?.lng).toBeCloseTo(-45.6789, 4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. _obterNativa() — expo-location
// ─────────────────────────────────────────────────────────────────────────────
describe('_obterNativa()', () => {
  beforeEach(() => {
    localizacaoService.limparCache();
    mockPlatformOS = 'ios';
    mockLocation.requestForegroundPermissionsAsync.mockReset();
    mockLocation.getCurrentPositionAsync.mockReset();
  });

  it('retorna null quando permissão é denied', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue(
      { status: 'denied' } as any,
    );
    const resultado = await localizacaoService._obterNativa();
    expect(resultado).toBeNull();
  });

  it('retorna null quando permissão é undetermined', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue(
      { status: 'undetermined' } as any,
    );
    const resultado = await localizacaoService._obterNativa();
    expect(resultado).toBeNull();
  });

  it('retorna Coordenadas quando permissão é granted', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue(
      { status: 'granted' } as any,
    );
    mockLocation.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: -12.7405, longitude: -60.1458 },
    } as any);

    const resultado = await localizacaoService._obterNativa();
    expect(resultado).toEqual({ lat: -12.7405, lng: -60.1458 });
  });

  it('chama getCurrentPositionAsync com Accuracy.Balanced (= 3)', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue(
      { status: 'granted' } as any,
    );
    mockLocation.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 0, longitude: 0 },
    } as any);

    await localizacaoService._obterNativa();

    expect(mockLocation.getCurrentPositionAsync).toHaveBeenCalledWith(
      expect.objectContaining({ accuracy: 3 }),
    );
  });

  it('não chama getCurrentPositionAsync quando permissão é negada', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue(
      { status: 'denied' } as any,
    );
    await localizacaoService._obterNativa();
    expect(mockLocation.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('popula _cache após posição bem-sucedida', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue(
      { status: 'granted' } as any,
    );
    mockLocation.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: -5.0, longitude: -35.0 },
    } as any);

    expect(localizacaoService.temCacheAtivo()).toBe(false);
    await localizacaoService._obterNativa();
    expect(localizacaoService.temCacheAtivo()).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. obterPosicao() — roteamento + tratamento de erros
// ─────────────────────────────────────────────────────────────────────────────
describe('obterPosicao() — roteamento por Platform.OS', () => {
  beforeEach(() => {
    localizacaoService.limparCache();
  });

  afterEach(() => {
    setGeolocation(undefined);
  });

  it('chama _obterWeb() quando Platform.OS = "web"', async () => {
    mockPlatformOS = 'web';
    const spy = jest.spyOn(localizacaoService, '_obterWeb').mockResolvedValueOnce({ lat: -1, lng: -1 });
    await localizacaoService.obterPosicao();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('chama _obterNativa() quando Platform.OS = "ios"', async () => {
    mockPlatformOS = 'ios';
    const spy = jest.spyOn(localizacaoService, '_obterNativa').mockResolvedValueOnce({ lat: -1, lng: -1 });
    await localizacaoService.obterPosicao();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('chama _obterNativa() quando Platform.OS = "android"', async () => {
    mockPlatformOS = 'android';
    const spy = jest.spyOn(localizacaoService, '_obterNativa').mockResolvedValueOnce(null);
    await localizacaoService.obterPosicao();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('retorna null quando _obterWeb lança exceção (catch interno)', async () => {
    mockPlatformOS = 'web';
    const spy = jest.spyOn(localizacaoService, '_obterWeb').mockRejectedValueOnce(new Error('Timeout'));
    const resultado = await localizacaoService.obterPosicao();
    expect(resultado).toBeNull();
    spy.mockRestore();
  });

  it('retorna null quando _obterNativa lança exceção (catch interno)', async () => {
    mockPlatformOS = 'ios';
    const spy = jest.spyOn(localizacaoService, '_obterNativa').mockRejectedValueOnce(new Error('Sensor error'));
    const resultado = await localizacaoService.obterPosicao();
    expect(resultado).toBeNull();
    spy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Cache — usando _obterWeb real + navigator.geolocation mockado
// ─────────────────────────────────────────────────────────────────────────────
describe('obterPosicao() — comportamento do cache', () => {
  const COORDS_A: Coordenadas = { lat: -12.74, lng: -60.14 };
  const COORDS_B: Coordenadas = { lat: -10.00, lng: -50.00 };

  beforeEach(() => {
    localizacaoService.limparCache();
    mockPlatformOS = 'web'; // usa _obterWeb real com navigator.geolocation mockado
  });

  afterEach(() => {
    setGeolocation(undefined);
    jest.restoreAllMocks();
  });

  it('retorna cache sem chamar navigator.geolocation na 2ª chamada (TTL válido)', async () => {
    // 1ª chamada — popula cache via _obterWeb real
    setGeolocation(geoSuccess(COORDS_A.lat, COORDS_A.lng));
    const resultado1 = await localizacaoService.obterPosicao();
    expect(resultado1).toEqual(COORDS_A);
    expect(localizacaoService.temCacheAtivo()).toBe(true);

    // 2ª chamada — troca geolocation por COORDS_B; se usar cache, retorna A
    setGeolocation(geoSuccess(COORDS_B.lat, COORDS_B.lng));
    const resultado2 = await localizacaoService.obterPosicao();
    expect(resultado2).toEqual(COORDS_A); // cache ainda válido → retorna A
  });

  it('busca nova posição quando cache expirou (> 5min)', async () => {
    const dateSpy = jest.spyOn(Date, 'now');
    const T0 = 1_000_000;

    // T0: popula cache com COORDS_A
    dateSpy.mockReturnValue(T0);
    setGeolocation(geoSuccess(COORDS_A.lat, COORDS_A.lng));
    await localizacaoService.obterPosicao();

    // T0 + 5min + 1ms: cache expirado → deve buscar COORDS_B
    dateSpy.mockReturnValue(T0 + 5 * 60_000 + 1);
    setGeolocation(geoSuccess(COORDS_B.lat, COORDS_B.lng));
    const resultado = await localizacaoService.obterPosicao();

    expect(resultado).toEqual(COORDS_B);
  });

  it('cache com 4min59s ainda é válido (< TTL)', async () => {
    const dateSpy = jest.spyOn(Date, 'now');
    const T0 = 2_000_000;

    // T0: popula cache com COORDS_A
    dateSpy.mockReturnValue(T0);
    setGeolocation(geoSuccess(COORDS_A.lat, COORDS_A.lng));
    await localizacaoService.obterPosicao();

    // T0 + 4min59s: dentro do TTL → deve usar cache
    dateSpy.mockReturnValue(T0 + 4 * 60_000 + 59_000);
    setGeolocation(geoSuccess(COORDS_B.lat, COORDS_B.lng));
    const resultado = await localizacaoService.obterPosicao();

    expect(resultado).toEqual(COORDS_A); // ainda retorna A (cache válido)
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. limparCache() e temCacheAtivo()
// ─────────────────────────────────────────────────────────────────────────────
describe('limparCache() e temCacheAtivo()', () => {
  const COORDS_A: Coordenadas = { lat: -12.74, lng: -60.14 };

  beforeEach(() => {
    localizacaoService.limparCache();
    mockPlatformOS = 'web';
  });

  afterEach(() => {
    setGeolocation(undefined);
  });

  it('temCacheAtivo() retorna false quando _cache é null', () => {
    expect(localizacaoService.temCacheAtivo()).toBe(false);
  });

  it('temCacheAtivo() retorna true após _obterWeb popular o cache', async () => {
    setGeolocation(geoSuccess(COORDS_A.lat, COORDS_A.lng));
    await localizacaoService.obterPosicao();
    expect(localizacaoService.temCacheAtivo()).toBe(true);
  });

  it('limparCache() faz temCacheAtivo() retornar false', async () => {
    setGeolocation(geoSuccess(COORDS_A.lat, COORDS_A.lng));
    await localizacaoService.obterPosicao();
    expect(localizacaoService.temCacheAtivo()).toBe(true);

    localizacaoService.limparCache();
    expect(localizacaoService.temCacheAtivo()).toBe(false);
  });

  it('limparCache() pode ser chamado múltiplas vezes sem lançar', () => {
    expect(() => {
      localizacaoService.limparCache();
      localizacaoService.limparCache();
      localizacaoService.limparCache();
    }).not.toThrow();
  });

  it('temCacheAtivo() retorna false quando cache expirou (> 5min)', async () => {
    const dateSpy = jest.spyOn(Date, 'now');
    const T0 = 3_000_000;

    dateSpy.mockReturnValue(T0);
    setGeolocation(geoSuccess(COORDS_A.lat, COORDS_A.lng));
    await localizacaoService.obterPosicao();
    expect(localizacaoService.temCacheAtivo()).toBe(true);

    dateSpy.mockReturnValue(T0 + 5 * 60_000 + 1);
    expect(localizacaoService.temCacheAtivo()).toBe(false);

    dateSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. Tipos exportados
// ─────────────────────────────────────────────────────────────────────────────
describe('tipos exportados', () => {
  it('StatusGPS cobre os 5 estados esperados', () => {
    const estados: StatusGPS[] = ['idle', 'loading', 'ok', 'negado', 'indisponivel'];
    expect(estados.length).toBe(5);
  });

  it('Coordenadas aceita lat/lng numéricos', () => {
    const c: Coordenadas = { lat: -12.7405, lng: -60.1458 };
    expect(c).toMatchObject({ lat: expect.any(Number), lng: expect.any(Number) });
  });
});
