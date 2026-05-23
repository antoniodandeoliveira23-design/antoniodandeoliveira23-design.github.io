/**
 * services/__tests__/supabase.test.ts
 *
 * Cobertura de unidade para services/supabase.ts.
 *
 * Ambiente: jsdom (window existe → isBrowser = true).
 *
 * Testa:
 *  A) supabaseConfigured — derivado exclusivamente das env vars EXPO_PUBLIC_*,
 *     sem depender de isBrowser (SSG-safe por design).
 *  B) supabase — null quando env vars ausentes; cliente real quando presentes
 *     (no ambiente jsdom, window existe, então createClient é chamado).
 */

// ── Mock de dependências externas ─────────────────────────────────────────

const mockCreateClient = jest.fn(() => ({ _isMockClient: true }));

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

// AsyncStorage não existe em jsdom; mock mínimo
jest.mock('@react-native-async-storage/async-storage', () => ({}));

// ── Helper ────────────────────────────────────────────────────────────────

/**
 * Carrega services/supabase.ts em módulo isolado com as env vars especificadas.
 * Garante que cada chamada parte de um estado limpo (sem cache de módulo).
 */
function loadModule(env: { url?: string; key?: string }) {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (env.url) process.env.EXPO_PUBLIC_SUPABASE_URL = env.url;
  if (env.key) process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = env.key;

  let mod!: typeof import('@/services/supabase');
  jest.isolateModules(() => {
    mod = require('@/services/supabase');
  });
  return mod;
}

// ── Limpeza entre testes ──────────────────────────────────────────────────

afterEach(() => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  mockCreateClient.mockClear();
});

// ─────────────────────────────────────────────────────────────────────────────
// A. supabaseConfigured — baseado apenas nas env vars (SSG-safe)
// ─────────────────────────────────────────────────────────────────────────────

describe('supabaseConfigured', () => {
  it('é false quando ambas as env vars estão ausentes', () => {
    const { supabaseConfigured } = loadModule({});
    expect(supabaseConfigured).toBe(false);
  });

  it('é false quando apenas EXPO_PUBLIC_SUPABASE_URL está presente', () => {
    const { supabaseConfigured } = loadModule({ url: 'https://abc.supabase.co' });
    expect(supabaseConfigured).toBe(false);
  });

  it('é false quando apenas EXPO_PUBLIC_SUPABASE_ANON_KEY está presente', () => {
    const { supabaseConfigured } = loadModule({ key: 'minha-anon-key-abc' });
    expect(supabaseConfigured).toBe(false);
  });

  it('é true quando ambas as env vars estão presentes e não vazias', () => {
    const { supabaseConfigured } = loadModule({
      url: 'https://abc.supabase.co',
      key: 'minha-anon-key-abc',
    });
    expect(supabaseConfigured).toBe(true);
  });

  it('é false quando as env vars são strings vazias', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL      = '';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = '';

    let mod!: typeof import('@/services/supabase');
    jest.isolateModules(() => { mod = require('@/services/supabase'); });

    expect(mod.supabaseConfigured).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. supabase (client) — comportamento no ambiente jsdom (window existe)
// ─────────────────────────────────────────────────────────────────────────────

describe('supabase (client)', () => {
  it('é null quando env vars ausentes (supabaseConfigured = false)', () => {
    const { supabase } = loadModule({});
    // sem env vars → supabaseConfigured=false → null independente de isBrowser
    expect(supabase).toBeNull();
  });

  it('é null quando apenas URL está presente (supabaseConfigured = false)', () => {
    const { supabase } = loadModule({ url: 'https://abc.supabase.co' });
    expect(supabase).toBeNull();
  });

  it('é null quando apenas KEY está presente (supabaseConfigured = false)', () => {
    const { supabase } = loadModule({ key: 'minha-anon-key-abc' });
    expect(supabase).toBeNull();
  });

  it('não é null quando ambas as env vars estão presentes (jsdom → isBrowser=true)', () => {
    // No ambiente jsdom, window existe → isBrowser=true → createClient é chamado
    const { supabase } = loadModule({
      url: 'https://abc.supabase.co',
      key: 'minha-anon-key-abc',
    });
    expect(supabase).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. createClient — chamado apenas quando supabaseConfigured e isBrowser
// ─────────────────────────────────────────────────────────────────────────────

describe('createClient', () => {
  it('NÃO é chamado quando env vars ausentes', () => {
    loadModule({});
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('NÃO é chamado quando apenas URL está presente', () => {
    loadModule({ url: 'https://abc.supabase.co' });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('É chamado com URL e KEY corretos quando ambas as vars estão presentes', () => {
    loadModule({ url: 'https://abc.supabase.co', key: 'minha-anon-key-abc' });
    // jsdom → isBrowser=true + supabaseConfigured=true → createClient chamado
    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://abc.supabase.co',
      'minha-anon-key-abc',
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        }),
      }),
    );
  });

  it('É chamado exatamente 1 vez por carregamento de módulo', () => {
    loadModule({ url: 'https://abc.supabase.co', key: 'minha-anon-key-abc' });
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
  });
});
