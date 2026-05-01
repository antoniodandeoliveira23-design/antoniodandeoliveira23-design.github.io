-- ═══════════════════════════════════════════════════════════════════
-- AGORA — Migration 004: Funções, Triggers e RPCs
-- Aplicar APÓS 001 e 002
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. handle_new_user — cria profile automaticamente ao cadastrar
--    Trigger: AFTER INSERT ON auth.users
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_username text;
  v_counter  int := 0;
  v_base     text;
BEGIN
  -- Gera username a partir do email (parte antes do @)
  v_base := LOWER(REGEXP_REPLACE(
    SPLIT_PART(NEW.email, '@', 1),
    '[^a-z0-9_]', '', 'g'
  ));

  -- Garante mínimo de 3 chars
  IF LENGTH(v_base) < 3 THEN
    v_base := v_base || SUBSTRING(gen_random_uuid()::text, 1, 6);
  END IF;

  v_username := v_base;

  -- Resolve conflito de username com sufixo numérico
  WHILE EXISTS (SELECT 1 FROM profiles WHERE username = v_username) LOOP
    v_counter  := v_counter + 1;
    v_username := v_base || v_counter::text;
  END LOOP;

  -- Insere o perfil com dados do metadata (vindo do cadastro)
  INSERT INTO profiles (
    id,
    nome,
    sobrenome,
    username,
    tipo_conta,
    genero,
    cnpj,
    verificado,
    criado_em,
    atualizado_em
  ) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'sobrenome', ''),
    v_username,
    COALESCE((NEW.raw_user_meta_data->>'tipo_conta')::tipo_conta_enum, 'pf'),
    CASE
      WHEN NEW.raw_user_meta_data->>'genero' IS NOT NULL
      THEN (NEW.raw_user_meta_data->>'genero')::genero_enum
      ELSE NULL
    END,
    NEW.raw_user_meta_data->>'cnpj',
    false,
    now(),
    now()
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Não falha o cadastro se o profile falhar (graceful)
  RAISE WARNING 'handle_new_user falhou para %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove trigger anterior se existir, recria
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─────────────────────────────────────────────────────────────────
-- 2. eventos_por_raio — RPC de busca geográfica (Haversine)
--    Substitui PostGIS quando a extensão não está disponível
--
-- Uso no cliente:
--   supabase.rpc('eventos_por_raio', { lat: -12.74, lng: -60.14, raio_km: 10 })
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION eventos_por_raio(
  lat        double precision,
  lng        double precision,
  raio_km    double precision DEFAULT 10,
  p_categoria text DEFAULT NULL,
  p_pagina   int DEFAULT 1,
  p_por_pagina int DEFAULT 20
)
RETURNS TABLE (
  id                  uuid,
  criador_id          uuid,
  nome                text,
  descricao           text,
  local               text,
  e_lat               double precision,
  e_lng               double precision,
  categoria           text,
  data_inicio         timestamptz,
  data_fim            timestamptz,
  imagem_url          text,
  comercial           boolean,
  exclusivo_mulheres  boolean,
  status              text,
  pago                boolean,
  destaque            boolean,
  criado_em           timestamptz,
  distancia_km        double precision
) AS $$
DECLARE
  R constant double precision := 6371.0; -- raio da Terra em km
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.criador_id,
    e.nome,
    e.descricao,
    e.local,
    e.lat          AS e_lat,
    e.lng          AS e_lng,
    e.categoria::text,
    e.data_inicio,
    e.data_fim,
    e.imagem_url,
    e.comercial,
    e.exclusivo_mulheres,
    e.status::text,
    e.pago,
    e.destaque,
    e.criado_em,
    -- Haversine
    ROUND(
      (R * 2 * ASIN(
        SQRT(
          POWER(SIN(RADIANS((e.lat - lat) / 2)), 2)
          + COS(RADIANS(lat)) * COS(RADIANS(e.lat))
          * POWER(SIN(RADIANS((e.lng - lng) / 2)), 2)
        )
      ))::numeric, 2
    )::double precision AS distancia_km
  FROM eventos e
  WHERE
    e.status = 'aprovado'
    AND (p_categoria IS NULL OR e.categoria::text = p_categoria)
    -- Bounding box rápida antes do Haversine (índice lat/lng)
    AND e.lat BETWEEN lat - (raio_km / 111.0)
                  AND lat + (raio_km / 111.0)
    AND e.lng BETWEEN lng - (raio_km / (111.0 * COS(RADIANS(lat))))
                  AND lng + (raio_km / (111.0 * COS(RADIANS(lat))))
    -- Filtro Haversine exato
    AND (R * 2 * ASIN(
      SQRT(
        POWER(SIN(RADIANS((e.lat - lat) / 2)), 2)
        + COS(RADIANS(lat)) * COS(RADIANS(e.lat))
        * POWER(SIN(RADIANS((e.lng - lng) / 2)), 2)
      )
    )) <= raio_km
  ORDER BY distancia_km ASC, e.destaque DESC, e.data_inicio ASC
  LIMIT  p_por_pagina
  OFFSET (p_pagina - 1) * p_por_pagina;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Permite acesso anônimo e autenticado ao RPC
GRANT EXECUTE ON FUNCTION eventos_por_raio TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 3. contar_denuncias_abertas — RPC para badge no painel admin
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION contar_denuncias_abertas()
RETURNS bigint AS $$
  SELECT COUNT(*) FROM denuncias WHERE status = 'aberta';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION contar_denuncias_abertas TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 4. aprovar_evento — RPC moderação (apenas admin/gov)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION aprovar_evento(p_evento_id uuid)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND tipo_conta IN ('admin', 'gov')
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE eventos
  SET status = 'aprovado', atualizado_em = now()
  WHERE id = p_evento_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────
-- 5. rejeitar_evento — RPC moderação com motivo
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rejeitar_evento(p_evento_id uuid, p_motivo text)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND tipo_conta IN ('admin', 'gov')
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE eventos
  SET status = 'rejeitado',
      motivo_rejeicao = p_motivo,
      atualizado_em = now()
  WHERE id = p_evento_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION aprovar_evento  TO authenticated;
GRANT EXECUTE ON FUNCTION rejeitar_evento TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 6. expirar_eventos — função agendada (pg_cron ou Edge Function)
--    Marca como expirado eventos aprovados com data_inicio passada
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION expirar_eventos_passados()
RETURNS int AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE eventos
  SET status = 'expirado', atualizado_em = now()
  WHERE status = 'aprovado'
    AND data_inicio < (now() - INTERVAL '24 hours');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────
-- 7. VIEW: painel_moderacao — eventos pendentes para o admin
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_painel_moderacao AS
SELECT
  e.id,
  e.nome,
  e.descricao,
  e.local,
  e.categoria,
  e.data_inicio,
  e.status,
  e.comercial,
  e.exclusivo_mulheres,
  e.pago,
  e.criado_em,
  p.nome        AS criador_nome,
  p.tipo_conta  AS criador_tipo,
  p.verificado  AS criador_verificado,
  COUNT(d.id)   AS total_denuncias
FROM eventos e
JOIN profiles p ON p.id = e.criador_id
LEFT JOIN denuncias d ON d.alvo_id = e.id::text AND d.status = 'aberta'
WHERE e.status IN ('pendente', 'suspenso')
GROUP BY e.id, p.id
ORDER BY e.criado_em ASC;

-- ─────────────────────────────────────────────────────────────────
-- 8. VIEW: dashboard_stats — métricas agregadas para o admin
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM profiles)                               AS total_usuarios,
  (SELECT COUNT(*) FROM profiles WHERE tipo_conta = 'pj')      AS total_empresas,
  (SELECT COUNT(*) FROM eventos WHERE status = 'aprovado')      AS total_eventos_ativos,
  (SELECT COUNT(*) FROM eventos WHERE status = 'pendente')      AS eventos_pendentes,
  (SELECT COUNT(*) FROM denuncias WHERE status = 'aberta')      AS denuncias_abertas,
  (SELECT COUNT(*) FROM anomalia_log WHERE resolvido = false)   AS anomalias_ativas,
  (SELECT COALESCE(SUM(valor),0) FROM pagamentos
   WHERE status IN ('aprovado','pago'))                         AS receita_total,
  (SELECT COUNT(*) FROM pagamentos
   WHERE status IN ('aprovado','pago')
     AND criado_em > now() - INTERVAL '30 days')               AS pagamentos_mes;
