-- ── 008 Push Notifications ─────────────────────────────────────────
-- Tabelas: push_tokens (dispositivos) + notificacoes (in-app)
-- Expo Push API para native; Supabase Realtime para web

-- ── 1. Push Tokens ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token         TEXT NOT NULL,
  plataforma    TEXT NOT NULL CHECK (plataforma IN ('ios', 'android', 'web')),
  ativo         BOOLEAN NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(usuario_id, token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_usuario_ativo
  ON push_tokens(usuario_id) WHERE ativo = true;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_push_tokens_atualizado_em') THEN
    CREATE TRIGGER trg_push_tokens_atualizado_em
      BEFORE UPDATE ON push_tokens
      FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
  END IF;
END $$;

-- ── 2. Notificações in-app ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notificacoes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL CHECK (tipo IN (
    'nova_mensagem',
    'evento_aprovado',
    'evento_rejeitado',
    'pagamento_confirmado',
    'evento_favorito_atualizado',
    'inscricao_confirmada',
    'sistema',
    'alerta_admin'
  )),
  titulo     TEXT NOT NULL,
  mensagem   TEXT NOT NULL,
  dados      JSONB NOT NULL DEFAULT '{}',
  lida       BOOLEAN NOT NULL DEFAULT false,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario_lida
  ON notificacoes(usuario_id, lida, criado_em DESC);

-- ── 3. RLS ───────────────────────────────────────────────────────
ALTER TABLE push_tokens  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;

-- push_tokens: usuário gerencia só os seus
CREATE POLICY "push_tokens_own_all" ON push_tokens
  FOR ALL USING (auth.uid() = usuario_id)
  WITH CHECK (auth.uid() = usuario_id);

-- notificacoes: usuário lê/atualiza as suas; service role insere
CREATE POLICY "notificacoes_own_select" ON notificacoes
  FOR SELECT USING (auth.uid() = usuario_id);

CREATE POLICY "notificacoes_own_update" ON notificacoes
  FOR UPDATE USING (auth.uid() = usuario_id)
  WITH CHECK (auth.uid() = usuario_id);

-- Edge Functions (service_role) inserem notificações
CREATE POLICY "notificacoes_service_insert" ON notificacoes
  FOR INSERT WITH CHECK (true);

-- ── 4. Realtime ──────────────────────────────────────────────────
ALTER TABLE notificacoes REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notificacoes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notificacoes;
  END IF;
END $$;
