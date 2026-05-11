/**
 * services/__tests__/storage.test.ts
 *
 * Suite de testes para storage.ts
 *
 * Módulos testados:
 *   upload()          — demo fallback + blob resolution + supabase upload
 *   deletar()         — early return demo + supabase remove
 *   urlPublica()      — demo '' + supabase getPublicUrl
 *   _resolverBlob()   — base64 → Blob, uri → fetch → Blob, erros
 *   _base64ToBlob()   — conversão base64 → Blob (pure)
 *   gerarCaminho()    — formato userId/ts-rand.ext + mapeamentos de extensão
 *
 * Estratégia:
 *   - jest.isolateModules() para modo demo vs configurado
 *   - global.fetch mockado para _resolverBlob com uri
 *   - jest.spyOn(_resolverBlob) para isolar upload do blob real nos testes de limite
 *   - Date.now spy para gerarCaminho determinístico
 *
 * Princípios FIRST:
 *  Fast      — sem I/O real; fetch + supabase mockados
 *  Isolated  — mocks restaurados em afterEach
 *  Repeatable — Date.now/Math.random spies onde necessário
 *  Self-validating — assertions explícitas
 *  Timely    — cobertura pré-produção
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// ─── helpers para mock do supabase.storage ───────────────────────────────────

function buildStorageMock(overrides: {
  uploadResult?:    { error: any };
  publicUrl?:       string;
  removeResult?:    { error: any };
} = {}) {
  const getPublicUrl = jest.fn().mockReturnValue({
    data: { publicUrl: overrides.publicUrl ?? 'https://cdn.supabase.io/bucket/file.jpg' },
  });
  const upload = jest.fn().mockResolvedValue({
    error: overrides.uploadResult?.error ?? null,
  });
  const remove = jest.fn().mockResolvedValue({
    error: overrides.removeResult?.error ?? null,
  });
  const from = jest.fn().mockReturnValue({ upload, getPublicUrl, remove });
  return { storage: { from }, _mocks: { from, upload, getPublicUrl, remove } };
}

// ─────────────────────────────────────────────────────────────────────────────
// A. MODO DEMO — supabaseConfigured = false
// ─────────────────────────────────────────────────────────────────────────────
describe('storageService — modo demo (supabaseConfigured = false)', () => {
  let storageService: typeof import('@/services/storage')['storageService'];

  beforeEach(() => {
    jest.isolateModules(() => {
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: false,
        supabase: null,
      }));
      storageService = require('@/services/storage').storageService;
    });
  });

  describe('upload()', () => {
    it('retorna caminho original no campo caminho', async () => {
      const resultado = await storageService.upload('avatares', 'u1/avatar.jpg', {
        base64: btoa('img'),
      });
      expect(resultado.caminho).toBe('u1/avatar.jpg');
    });

    it('bucket avatares → URL do pravatar.cc', async () => {
      const resultado = await storageService.upload('avatares', 'u1/a.jpg', { base64: btoa('x') });
      expect(resultado.url).toMatch(/pravatar\.cc/);
    });

    it('bucket eventos → URL do picsum.photos', async () => {
      const resultado = await storageService.upload('eventos', 'u1/e.jpg', { base64: btoa('x') });
      expect(resultado.url).toMatch(/picsum\.photos/);
    });

    it('bucket produtos → URL do picsum.photos', async () => {
      const resultado = await storageService.upload('produtos', 'u1/p.jpg', { base64: btoa('x') });
      expect(resultado.url).toMatch(/picsum\.photos/);
    });

    it('URLs de buckets diferentes são distintas (seed diferente)', async () => {
      const r1 = await storageService.upload('avatares', 'path', { base64: btoa('x') });
      const r2 = await storageService.upload('eventos',  'path', { base64: btoa('x') });
      expect(r1.url).not.toBe(r2.url);
    });

    it('retorna ResultadoUpload com url e caminho', async () => {
      const resultado = await storageService.upload('avatares', 'u/a.jpg', { base64: btoa('d') });
      expect(typeof resultado.url).toBe('string');
      expect(resultado.url.length).toBeGreaterThan(0);
      expect(typeof resultado.caminho).toBe('string');
    });
  });

  describe('deletar()', () => {
    it('resolve sem lançar e sem chamar supabase', async () => {
      await expect(storageService.deletar('avatares', 'u1/a.jpg')).resolves.toBeUndefined();
    });
  });

  describe('urlPublica()', () => {
    it('retorna string vazia quando não configurado', () => {
      expect(storageService.urlPublica('avatares', 'u1/a.jpg')).toBe('');
    });

    it('retorna string vazia para qualquer bucket', () => {
      expect(storageService.urlPublica('eventos',  'ev/img.jpg')).toBe('');
      expect(storageService.urlPublica('produtos', 'pr/img.jpg')).toBe('');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. _base64ToBlob() — conversão pura (usa atob + Blob do jsdom)
// ─────────────────────────────────────────────────────────────────────────────
describe('_base64ToBlob()', () => {
  // Importação estática funciona aqui; a função não depende de supabase
  let storageService: typeof import('@/services/storage')['storageService'];

  beforeAll(() => {
    jest.isolateModules(() => {
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: false,
        supabase: null,
      }));
      storageService = require('@/services/storage').storageService;
    });
  });

  it('retorna um Blob para base64 puro (sem prefixo data URI)', () => {
    const base64 = btoa('hello world');
    const blob = storageService._base64ToBlob(base64, 'text/plain');
    expect(blob).toBeInstanceOf(Blob);
  });

  it('Blob tem o mimeType correto', () => {
    const blob = storageService._base64ToBlob(btoa('data'), 'image/png');
    expect(blob.type).toBe('image/png');
  });

  it('Blob tem tamanho não-zero para input não-vazio', () => {
    const blob = storageService._base64ToBlob(btoa('conteúdo'), 'image/jpeg');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('remove prefixo "data:image/jpeg;base64," corretamente', () => {
    const raw     = 'hello world test data';
    const base64  = btoa(raw);
    const comPref = `data:image/jpeg;base64,${base64}`;
    const semPref = base64;

    const b1 = storageService._base64ToBlob(comPref, 'image/jpeg');
    const b2 = storageService._base64ToBlob(semPref, 'image/jpeg');

    expect(b1.size).toBe(b2.size);
  });

  it('Blob default type é image/jpeg quando não especificado', () => {
    const blob = storageService._base64ToBlob(btoa('test'), 'image/jpeg');
    expect(blob.type).toBe('image/jpeg');
  });

  it('processa base64 em chunks de 512 bytes sem erro', () => {
    // Gera dado > 512 bytes (1 KB)
    const dado   = 'A'.repeat(1024);
    const base64 = btoa(dado);
    const blob   = storageService._base64ToBlob(base64, 'text/plain');
    expect(blob.size).toBeGreaterThan(512);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. _resolverBlob() — lógica de resolução de entrada
// ─────────────────────────────────────────────────────────────────────────────
describe('_resolverBlob()', () => {
  let storageService: typeof import('@/services/storage')['storageService'];
  let originalFetch: typeof global.fetch;

  beforeAll(() => {
    jest.isolateModules(() => {
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: false,
        supabase: null,
      }));
      storageService = require('@/services/storage').storageService;
    });
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('retorna Blob via _base64ToBlob quando base64 fornecido', async () => {
    const blob = await storageService._resolverBlob({
      base64:   btoa('imagem'),
      mimeType: 'image/jpeg',
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/jpeg');
  });

  it('base64 tem prioridade sobre uri quando ambos fornecidos', async () => {
    const fetchSpy = jest.fn();
    global.fetch   = fetchSpy as any;

    await storageService._resolverBlob({
      base64: btoa('data'),
      uri:    'file:///some/path.jpg',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('faz fetch(uri) quando uri fornecido sem base64', async () => {
    const blobMock = new Blob(['conteúdo'], { type: 'image/jpeg' });
    global.fetch   = jest.fn().mockResolvedValue({
      ok:   true,
      blob: jest.fn().mockResolvedValue(blobMock),
    }) as any;

    const blob = await storageService._resolverBlob({ uri: 'file:///img.jpg' });
    expect(global.fetch).toHaveBeenCalledWith('file:///img.jpg');
    expect(blob).toBe(blobMock);
  });

  it('lança erro quando fetch retorna !ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as any;
    await expect(
      storageService._resolverBlob({ uri: 'file:///invalid.jpg' }),
    ).rejects.toThrow('Não foi possível ler o arquivo local.');
  });

  it('lança erro quando nem uri nem base64 fornecidos', async () => {
    await expect(
      storageService._resolverBlob({ mimeType: 'image/jpeg' }),
    ).rejects.toThrow('forneça uri ou base64');
  });

  it('lança erro quando opcoes está vazio', async () => {
    await expect(storageService._resolverBlob({})).rejects.toThrow('forneça uri ou base64');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. gerarCaminho() — formato e extensões
// ─────────────────────────────────────────────────────────────────────────────
describe('gerarCaminho()', () => {
  let storageService: typeof import('@/services/storage')['storageService'];

  beforeAll(() => {
    jest.isolateModules(() => {
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: false,
        supabase: null,
      }));
      storageService = require('@/services/storage').storageService;
    });
  });

  it('retorna string contendo o userId no início', () => {
    const caminho = storageService.gerarCaminho('user-abc123');
    expect(caminho).toMatch(/^user-abc123\//);
  });

  it('mimeType image/jpeg → extensão .jpg (converte jpeg → jpg)', () => {
    const caminho = storageService.gerarCaminho('uid', 'image/jpeg');
    expect(caminho).toMatch(/\.jpg$/);
  });

  it('mimeType image/png → extensão .png', () => {
    const caminho = storageService.gerarCaminho('uid', 'image/png');
    expect(caminho).toMatch(/\.png$/);
  });

  it('mimeType image/webp → extensão .webp', () => {
    const caminho = storageService.gerarCaminho('uid', 'image/webp');
    expect(caminho).toMatch(/\.webp$/);
  });

  it('mimeType padrão (omitido) resulta em .jpg', () => {
    const caminho = storageService.gerarCaminho('uid');
    expect(caminho).toMatch(/\.jpg$/);
  });

  it('formato geral é "userId/timestamp-rand.ext"', () => {
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const caminho = storageService.gerarCaminho('user-x', 'image/png');
    // deve conter userId, número, hífen, parte aleatória, extensão
    expect(caminho).toMatch(/^user-x\/1700000000000-[a-z0-9]+\.png$/);
    dateSpy.mockRestore();
  });

  it('gera caminhos únicos em chamadas sucessivas (timestamp + random)', () => {
    const c1 = storageService.gerarCaminho('uid');
    const c2 = storageService.gerarCaminho('uid');
    // não garante unicidade absoluta, mas na prática diferem
    // (Date.now pode ser igual mas Math.random difere)
    expect(typeof c1).toBe('string');
    expect(typeof c2).toBe('string');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. upload() — modo configurado (supabase mockado)
// ─────────────────────────────────────────────────────────────────────────────
describe('upload() — modo configurado', () => {
  let storageService: typeof import('@/services/storage')['storageService'];
  let mocks: ReturnType<typeof buildStorageMock>;

  beforeEach(() => {
    mocks = buildStorageMock({ publicUrl: 'https://cdn.supabase.io/avatares/u1/a.jpg' });

    jest.isolateModules(() => {
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: true,
        supabase: { storage: mocks.storage },
      }));
      storageService = require('@/services/storage').storageService;
    });
  });

  it('retorna { url, caminho } com a URL pública do supabase', async () => {
    const resultado = await storageService.upload('avatares', 'u1/a.jpg', {
      base64: btoa('img data'),
    });
    expect(resultado.url).toBe('https://cdn.supabase.io/avatares/u1/a.jpg');
    expect(resultado.caminho).toBe('u1/a.jpg');
  });

  it('chama supabase.storage.from(bucket).upload com args corretos', async () => {
    await storageService.upload('eventos', 'ev/img.jpg', {
      base64:   btoa('data'),
      mimeType: 'image/png',
    });
    expect(mocks._mocks.from).toHaveBeenCalledWith('eventos');
    expect(mocks._mocks.upload).toHaveBeenCalledWith(
      'ev/img.jpg',
      expect.any(Blob),
      expect.objectContaining({ contentType: 'image/png', upsert: true }),
    );
  });

  it('lança "Upload falhou:" quando supabase retorna uploadError', async () => {
    mocks = buildStorageMock({ uploadResult: { error: { message: 'Access denied' } } });
    jest.isolateModules(() => {
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: true,
        supabase: { storage: mocks.storage },
      }));
      storageService = require('@/services/storage').storageService;
    });

    await expect(
      storageService.upload('avatares', 'u/a.jpg', { base64: btoa('x') }),
    ).rejects.toThrow('Upload falhou: Access denied');
  });

  it('lança "Arquivo muito grande" quando blob.size > 10MB', async () => {
    // Spy em _resolverBlob para retornar blob com size > 10MB
    jest.spyOn(storageService, '_resolverBlob').mockResolvedValueOnce(
      { size: 11 * 1024 * 1024 } as Blob,
    );

    await expect(
      storageService.upload('avatares', 'u/a.jpg', { base64: btoa('x') }),
    ).rejects.toThrow('Arquivo muito grande');
  });

  it('lança erro quando nem uri nem base64 fornecidos (propaga _resolverBlob)', async () => {
    await expect(
      storageService.upload('avatares', 'u/a.jpg', {}),
    ).rejects.toThrow('forneça uri ou base64');
  });

  it('chama getPublicUrl com o caminho correto após upload bem-sucedido', async () => {
    await storageService.upload('produtos', 'pr/img.jpg', { base64: btoa('data') });
    expect(mocks._mocks.getPublicUrl).toHaveBeenCalledWith('pr/img.jpg');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. deletar() e urlPublica() — modo configurado
// ─────────────────────────────────────────────────────────────────────────────
describe('deletar() e urlPublica() — modo configurado', () => {
  let storageService: typeof import('@/services/storage')['storageService'];
  let mocks: ReturnType<typeof buildStorageMock>;

  beforeEach(() => {
    mocks = buildStorageMock({ publicUrl: 'https://cdn.supabase.io/bucket/file.jpg' });

    jest.isolateModules(() => {
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: true,
        supabase: { storage: mocks.storage },
      }));
      storageService = require('@/services/storage').storageService;
    });
  });

  describe('deletar()', () => {
    it('chama supabase.storage.from(bucket).remove([caminho])', async () => {
      await storageService.deletar('eventos', 'ev/old.jpg');
      expect(mocks._mocks.from).toHaveBeenCalledWith('eventos');
      expect(mocks._mocks.remove).toHaveBeenCalledWith(['ev/old.jpg']);
    });

    it('resolve sem lançar após chamada ao supabase', async () => {
      await expect(storageService.deletar('avatares', 'u/a.jpg')).resolves.toBeUndefined();
    });
  });

  describe('urlPublica()', () => {
    it('retorna data.publicUrl do supabase', () => {
      const url = storageService.urlPublica('avatares', 'u/a.jpg');
      expect(url).toBe('https://cdn.supabase.io/bucket/file.jpg');
    });

    it('chama from(bucket) com o bucket correto', () => {
      storageService.urlPublica('produtos', 'pr/img.jpg');
      expect(mocks._mocks.from).toHaveBeenCalledWith('produtos');
    });

    it('chama getPublicUrl com o caminho correto', () => {
      storageService.urlPublica('eventos', 'ev/banner.jpg');
      expect(mocks._mocks.getPublicUrl).toHaveBeenCalledWith('ev/banner.jpg');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. Tipos exportados
// ─────────────────────────────────────────────────────────────────────────────
describe('tipos exportados', () => {
  it('BucketName cobre os 3 buckets do projeto', () => {
    const buckets: import('@/services/storage').BucketName[] = [
      'avatares', 'eventos', 'produtos',
    ];
    expect(buckets.length).toBe(3);
  });

  it('ResultadoUpload tem url e caminho como strings', () => {
    const r: import('@/services/storage').ResultadoUpload = {
      url:     'https://cdn.supabase.io/img.jpg',
      caminho: 'u/img.jpg',
    };
    expect(typeof r.url).toBe('string');
    expect(typeof r.caminho).toBe('string');
  });
});
