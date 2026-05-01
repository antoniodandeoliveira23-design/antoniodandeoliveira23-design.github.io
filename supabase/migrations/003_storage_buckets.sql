-- ═══════════════════════════════════════════════════════════════
-- Migration 003: Supabase Storage — buckets e políticas RLS
-- Execute no SQL Editor do Supabase Dashboard
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Criar buckets públicos ─────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatares', 'avatares', true, 10485760, ARRAY['image/jpeg','image/png','image/webp']),
  ('eventos',  'eventos',  true, 10485760, ARRAY['image/jpeg','image/png','image/webp']),
  ('produtos', 'produtos', true, 10485760, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public            = EXCLUDED.public,
  file_size_limit   = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 2. Políticas RLS — bucket: avatares ──────────────────────

-- Leitura pública (qualquer um pode ver avatares)
CREATE POLICY "avatares_leitura_publica"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatares');

-- Upload: usuário autenticado, somente na própria pasta (userId/*)
CREATE POLICY "avatares_upload_proprio"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatares'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Atualização: somente o dono do arquivo
CREATE POLICY "avatares_atualizar_proprio"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatares'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Exclusão: somente o dono
CREATE POLICY "avatares_deletar_proprio"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatares'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── 3. Políticas RLS — bucket: eventos ───────────────────────

CREATE POLICY "eventos_leitura_publica"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'eventos');

CREATE POLICY "eventos_upload_autenticado"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'eventos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "eventos_atualizar_proprio"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'eventos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "eventos_deletar_proprio"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'eventos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── 4. Políticas RLS — bucket: produtos ──────────────────────

CREATE POLICY "produtos_leitura_publica"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'produtos');

CREATE POLICY "produtos_upload_autenticado"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'produtos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "produtos_atualizar_proprio"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'produtos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "produtos_deletar_proprio"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'produtos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── 5. Admin pode gerenciar qualquer arquivo ──────────────────

CREATE POLICY "admin_storage_total"
  ON storage.objects FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND tipo_conta = 'admin'
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- Estrutura de paths esperada por bucket:
--   avatares/{userId}/{timestamp}-{rand}.jpg
--   eventos/{userId}/{timestamp}-{rand}.jpg
--   produtos/{userId}/{timestamp}-{rand}.jpg
-- ═══════════════════════════════════════════════════════════════
