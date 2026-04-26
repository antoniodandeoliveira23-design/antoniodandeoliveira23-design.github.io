-- ═══════════════════════════════════════════════════════════
-- MIGRATION: Tabelas de Auditoria, Acesso e Anomalias (A09)
-- Aplicar em: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────
-- 1. AUDIT LOG — registro de todas as ações críticas
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  acao          text NOT NULL,
  categoria     text NOT NULL,
  -- 'auth' | 'evento' | 'moderacao' | 'pagamento' | 'denuncia' | 'admin' | 'seguranca'
  severidade    text NOT NULL DEFAULT 'info',
  -- 'info' | 'aviso' | 'critico'
  tabela        text,
  registro_id   uuid,
  detalhes      jsonb DEFAULT '{}',
  resultado     text DEFAULT 'sucesso',
  -- 'sucesso' | 'falha' | 'bloqueado'
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_user_id    ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_categoria  ON audit_log(categoria);
CREATE INDEX IF NOT EXISTS idx_audit_severidade ON audit_log(severidade);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_le_audit" ON audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tipo_conta = 'admin')
  );

CREATE POLICY "service_insere_audit" ON audit_log
  FOR INSERT WITH CHECK (true);

-- ─────────────────────────────────────────────────────────
-- 2. ACCESS LOG — logins, logouts, falhas de autenticação
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS access_log (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  evento      text NOT NULL,
  -- 'login' | 'logout' | 'login_falha' | 'cadastro' | 'token_renovado'
  user_agent  text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_user_id ON access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_access_evento  ON access_log(evento);
CREATE INDEX IF NOT EXISTS idx_access_created ON access_log(created_at DESC);

ALTER TABLE access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_le_access" ON access_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tipo_conta = 'admin')
  );

CREATE POLICY "service_insere_access" ON access_log
  FOR INSERT WITH CHECK (true);

-- ─────────────────────────────────────────────────────────
-- 3. ANOMALIA LOG — comportamentos suspeitos detectados
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anomalia_log (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  tipo        text NOT NULL,
  -- 'velocidade' | 'login_falha_repetida' | 'conteudo_suspeito'
  -- 'ip_duplicado' | 'evento_clonado' | 'multiplas_denuncias'
  descricao   text NOT NULL,
  detalhes    jsonb DEFAULT '{}',
  resolvido   boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anomalia_resolvido  ON anomalia_log(resolvido);
CREATE INDEX IF NOT EXISTS idx_anomalia_user_id    ON anomalia_log(user_id);
CREATE INDEX IF NOT EXISTS idx_anomalia_created_at ON anomalia_log(created_at DESC);

ALTER TABLE anomalia_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_le_anomalias" ON anomalia_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tipo_conta IN ('admin','gov'))
  );

CREATE POLICY "admin_atualiza_anomalias" ON anomalia_log
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tipo_conta = 'admin')
  );

CREATE POLICY "service_insere_anomalia" ON anomalia_log
  FOR INSERT WITH CHECK (true);

-- ─────────────────────────────────────────────────────────
-- 4. TRIGGER: detecta criação de eventos em alta velocidade
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION detectar_velocidade_suspeita()
RETURNS TRIGGER AS $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM eventos
  WHERE criador_id = NEW.criador_id
    AND criado_em > NOW() - INTERVAL '1 hour';

  IF v_count >= 5 THEN
    INSERT INTO anomalia_log (user_id, tipo, descricao, detalhes)
    VALUES (
      NEW.criador_id,
      'velocidade',
      'Usuário criou 5+ eventos em menos de 1 hora',
      jsonb_build_object(
        'eventos_na_hora', v_count,
        'ultimo_evento_id', NEW.id
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_detectar_velocidade ON eventos;
CREATE TRIGGER trg_detectar_velocidade
  AFTER INSERT ON eventos
  FOR EACH ROW EXECUTE FUNCTION detectar_velocidade_suspeita();

-- ─────────────────────────────────────────────────────────
-- 5. TRIGGER: detecta múltiplas denúncias no mesmo alvo
--    e suspende automaticamente o evento se >= 5 denúncias/hora
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION detectar_multiplas_denuncias()
RETURNS TRIGGER AS $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM denuncias
  WHERE alvo_id = NEW.alvo_id
    AND criado_em > NOW() - INTERVAL '1 hour';

  IF v_count >= 5 THEN
    INSERT INTO anomalia_log (user_id, tipo, descricao, detalhes)
    VALUES (
      NULL,
      'multiplas_denuncias',
      'Alvo recebeu 5+ denúncias em 1 hora — revisar urgente',
      jsonb_build_object(
        'alvo_id', NEW.alvo_id,
        'tipo_alvo', NEW.tipo,
        'total_denuncias', v_count
      )
    );

    -- Suspende automaticamente se for evento
    IF NEW.tipo = 'evento' THEN
      UPDATE eventos SET status = 'suspenso' WHERE id = NEW.alvo_id::uuid;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_detectar_denuncias ON denuncias;
CREATE TRIGGER trg_detectar_denuncias
  AFTER INSERT ON denuncias
  FOR EACH ROW EXECUTE FUNCTION detectar_multiplas_denuncias();

-- ─────────────────────────────────────────────────────────
-- 6. VIEW: painel de anomalias ativas para admin
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_anomalias_ativas AS
SELECT
  a.id,
  a.tipo,
  a.descricao,
  a.detalhes,
  a.created_at,
  p.nome        AS usuario_nome,
  p.tipo_conta
FROM anomalia_log a
LEFT JOIN profiles p ON p.id = a.user_id
WHERE a.resolvido = false
ORDER BY a.created_at DESC;
