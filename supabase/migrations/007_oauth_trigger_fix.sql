-- ═══════════════════════════════════════════════════════════════════
-- AGORA — Migration 007: Fix handle_new_user para OAuth providers
--
-- Problema: trigger original lê NEW.raw_user_meta_data->>'nome' mas
-- provedores OAuth (Google, Apple) enviam dados em formato diferente:
--
--   Google: { "full_name": "João Silva", "avatar_url": "...", "name": "João" }
--   Apple:  { "full_name": { "givenName": "João", "familyName": "Silva" } }
--   Email:  { "nome": "João", "sobrenome": "Silva", "tipo_conta": "pf" }
--
-- Esta migration atualiza o trigger para extrair corretamente de cada fonte.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_username   text;
  v_counter    int := 0;
  v_base       text;
  v_nome       text;
  v_sobrenome  text;
  v_avatar_url text;
  v_full_name  text;
  v_provider   text;
BEGIN
  -- ── Detecta o provedor de identidade ──────────────────────────────
  v_provider := COALESCE(
    NEW.raw_user_meta_data->>'provider_id',
    NEW.raw_app_meta_data->>'provider',
    'email'
  );

  -- ── Extrai nome dependendo do provedor ────────────────────────────
  IF v_provider IN ('google', 'github', 'facebook', 'twitter') THEN
    -- OAuth: full_name ou name no metadata
    v_full_name := COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      SPLIT_PART(NEW.email, '@', 1)
    );

    -- Separa em nome e sobrenome pelo primeiro espaço
    v_nome      := SPLIT_PART(v_full_name, ' ', 1);
    v_sobrenome := NULLIF(
      TRIM(SUBSTRING(v_full_name FROM LENGTH(v_nome) + 2)),
      ''
    );

    -- Avatar do provedor
    v_avatar_url := COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture'
    );

  ELSIF v_provider = 'apple' THEN
    -- Apple envia givenName/familyName dentro de um objeto JSON na primeira autenticação
    -- Nas re-autenticações o campo vem vazio — usamos email como fallback
    v_nome := COALESCE(
      NEW.raw_user_meta_data->'full_name'->>'givenName',
      NEW.raw_user_meta_data->>'nome',
      SPLIT_PART(NEW.email, '@', 1)
    );
    v_sobrenome := COALESCE(
      NEW.raw_user_meta_data->'full_name'->>'familyName',
      NEW.raw_user_meta_data->>'sobrenome',
      ''
    );
    v_avatar_url := NULL; -- Apple não fornece foto

  ELSE
    -- Cadastro por email: usa campos explícitos definidos no registro
    v_nome      := COALESCE(NEW.raw_user_meta_data->>'nome',      SPLIT_PART(NEW.email, '@', 1));
    v_sobrenome := COALESCE(NEW.raw_user_meta_data->>'sobrenome', '');
    v_avatar_url := NULL;
  END IF;

  -- ── Garante nome mínimo ────────────────────────────────────────────
  IF v_nome IS NULL OR LENGTH(TRIM(v_nome)) = 0 THEN
    v_nome := SPLIT_PART(NEW.email, '@', 1);
  END IF;

  -- ── Gera username único a partir do email ──────────────────────────
  v_base := LOWER(REGEXP_REPLACE(
    SPLIT_PART(NEW.email, '@', 1),
    '[^a-z0-9_]', '', 'g'
  ));

  IF LENGTH(v_base) < 3 THEN
    v_base := v_base || SUBSTRING(gen_random_uuid()::text, 1, 6);
  END IF;

  v_username := v_base;

  WHILE EXISTS (SELECT 1 FROM profiles WHERE username = v_username) LOOP
    v_counter  := v_counter + 1;
    v_username := v_base || v_counter::text;
  END LOOP;

  -- ── Insere o perfil ────────────────────────────────────────────────
  INSERT INTO profiles (
    id,
    nome,
    sobrenome,
    username,
    avatar_url,
    tipo_conta,
    genero,
    cnpj,
    verificado,
    criado_em,
    atualizado_em
  ) VALUES (
    NEW.id,
    v_nome,
    COALESCE(v_sobrenome, ''),
    v_username,
    v_avatar_url,
    COALESCE(
      (NEW.raw_user_meta_data->>'tipo_conta')::tipo_conta_enum,
      'pf'
    ),
    CASE
      WHEN NEW.raw_user_meta_data->>'genero' IS NOT NULL
      THEN (NEW.raw_user_meta_data->>'genero')::genero_enum
      ELSE NULL
    END,
    NEW.raw_user_meta_data->>'cnpj',
    -- Usuários OAuth com email verificado são marcados como verificados
    COALESCE((NEW.raw_user_meta_data->>'email_verified')::boolean, false),
    now(),
    now()
  )
  -- Idempotente: se perfil já existe (ex: re-trigger), ignora
  ON CONFLICT (id) DO UPDATE SET
    avatar_url    = EXCLUDED.avatar_url,
    atualizado_em = now()
  WHERE profiles.avatar_url IS NULL;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[handle_new_user] falhou para % (provider: %): %',
    NEW.id, v_provider, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recria o trigger (função já está substituída)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─────────────────────────────────────────────────────────────────
-- Atualiza perfis existentes de usuários OAuth sem avatar
-- (executa uma vez, sem efeito em registros futuros)
-- ─────────────────────────────────────────────────────────────────
UPDATE profiles p
SET
  avatar_url    = u.raw_user_meta_data->>'avatar_url',
  atualizado_em = now()
FROM auth.users u
WHERE p.id = u.id
  AND p.avatar_url IS NULL
  AND u.raw_user_meta_data->>'avatar_url' IS NOT NULL;
