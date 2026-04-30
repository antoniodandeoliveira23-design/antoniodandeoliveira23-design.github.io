import { Platform } from 'react-native';
import { supabase, supabaseConfigured } from './supabase';

// ─────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────

export type BucketName = 'avatares' | 'eventos' | 'produtos';

export interface ResultadoUpload {
  url: string;
  caminho: string;
}

export interface OpcoesUpload {
  uri?: string;       // URI local (expo-image-picker ou web File URL)
  base64?: string;    // Base64 puro sem prefixo data:
  mimeType?: string;  // ex: "image/jpeg"
}

// ─────────────────────────────────────────────────────────
// Placeholders demo (sem Supabase configurado)
// ─────────────────────────────────────────────────────────

const DEMO_URL: Record<BucketName, (seed: string) => string> = {
  avatares: (s) => `https://i.pravatar.cc/150?u=${encodeURIComponent(s)}`,
  eventos:  (s) => `https://picsum.photos/seed/${encodeURIComponent(s)}/600/400`,
  produtos: (s) => `https://picsum.photos/seed/${encodeURIComponent(s)}/400/400`,
};

// Tamanho máximo por upload: 10 MB
const MAX_BYTES = 10 * 1024 * 1024;

// ─────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────

export const storageService = {
  /**
   * Faz upload de uma imagem para o Supabase Storage.
   *
   * Demo mode: retorna URL de placeholder sem chamar o Supabase.
   *
   * @param bucket   — 'avatares' | 'eventos' | 'produtos'
   * @param caminho  — path dentro do bucket ex: "userId/avatar.jpg"
   * @param opcoes   — { uri?, base64?, mimeType? }
   */
  async upload(
    bucket: BucketName,
    caminho: string,
    opcoes: OpcoesUpload,
  ): Promise<ResultadoUpload> {
    const { uri, base64, mimeType = 'image/jpeg' } = opcoes;

    // ── Demo mode ──────────────────────────────────────────
    if (!supabaseConfigured) {
      const seed = `${bucket}-${caminho}-${Date.now()}`;
      return { url: DEMO_URL[bucket](seed), caminho };
    }

    // ── Resolução do blob ──────────────────────────────────
    const blob = await this._resolverBlob({ uri, base64, mimeType });

    if (blob.size > MAX_BYTES) {
      throw new Error('Arquivo muito grande. Tamanho máximo: 10 MB.');
    }

    // ── Upload ─────────────────────────────────────────────
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(caminho, blob, {
        contentType: mimeType,
        upsert: true,          // sobrescreve se já existir
        cacheControl: '3600',
      });

    if (uploadError) throw new Error(`Upload falhou: ${uploadError.message}`);

    // ── URL pública ────────────────────────────────────────
    const { data } = supabase.storage.from(bucket).getPublicUrl(caminho);
    return { url: data.publicUrl, caminho };
  },

  /** Remove um arquivo do storage (silencioso em demo mode) */
  async deletar(bucket: BucketName, caminho: string): Promise<void> {
    if (!supabaseConfigured) return;
    await supabase.storage.from(bucket).remove([caminho]);
  },

  /** Retorna a URL pública de um caminho já existente no bucket */
  urlPublica(bucket: BucketName, caminho: string): string {
    if (!supabaseConfigured) return '';
    const { data } = supabase.storage.from(bucket).getPublicUrl(caminho);
    return data.publicUrl;
  },

  // ── Privados ───────────────────────────────────────────

  async _resolverBlob({ uri, base64, mimeType = 'image/jpeg' }: OpcoesUpload): Promise<Blob> {
    if (base64) {
      return this._base64ToBlob(base64, mimeType);
    }
    if (uri) {
      // fetch() funciona tanto na web (blob: / data:) quanto no native (file://)
      // a partir do React Native 0.73+
      const resp = await fetch(uri);
      if (!resp.ok) throw new Error('Não foi possível ler o arquivo local.');
      return resp.blob();
    }
    throw new Error('storageService.upload: forneça uri ou base64.');
  },

  _base64ToBlob(base64: string, mimeType: string): Blob {
    // Remove prefixo "data:image/...;base64," se presente
    const raw = base64.includes(',') ? base64.split(',')[1] : base64;
    const byteChars = atob(raw);
    const chunks: Uint8Array[] = [];
    for (let offset = 0; offset < byteChars.length; offset += 512) {
      const slice = byteChars.slice(offset, offset + 512);
      const bytes = new Uint8Array(slice.length);
      for (let i = 0; i < slice.length; i++) bytes[i] = slice.charCodeAt(i);
      chunks.push(bytes);
    }
    return new Blob(chunks as BlobPart[], { type: mimeType });
  },

  /** Gera um caminho único para o arquivo: "userId/timestamp-random.ext" */
  gerarCaminho(userId: string, mimeType: string = 'image/jpeg'): string {
    const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    const rand = Math.random().toString(36).slice(2, 8);
    return `${userId}/${Date.now()}-${rand}.${ext}`;
  },
};
