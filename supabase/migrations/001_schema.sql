-- ═══════════════════════════════════════════════════════════════════
-- AGORA — Migration 001: Schema Principal
-- Ordem de aplicação: 001 → 002 → 003 → 004 → 005
-- Aplicar em: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- EXTENSÕES
-- ─────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- busca LIKE rápida (GIN)
-- PostGIS opcional (ativa buscas geográficas nativas):
-- CREATE EXTENSION IF NOT EXISTS "postgis";

-- ─────────────────────────────────────────────────────────────────
-- TIPOS ENUMERADOS
-- ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE tipo_conta_enum AS ENUM ('pf', 'pj', 'gov', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE genero_enum AS ENUM ('masculino', 'feminino', 'outro', 'prefiro_nao_dizer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE categoria_evento_enum AS ENUM (
    'musica','teatro','esporte','educacao','feira',
    'cultura','gastronomia','negocios','religiao','governo','outro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE status_evento_enum AS ENUM (
    'rascunho','pendente','aprovado','rejeitado','expirado','suspenso'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE categoria_produto_enum AS ENUM (
    'alimentacao','vestuario','servicos','artesanato','tecnologia','saude','outro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE status_produto_enum AS ENUM ('ativo', 'inativo', 'pendente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE status_denuncia_enum AS ENUM ('aberta', 'em_analise', 'resolvida', 'descartada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tipo_denuncia_enum AS ENUM ('evento', 'usuario', 'mensagem');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE status_pagamento_enum AS ENUM (
    'pendente','processando','aprovado','recusado',
    'pago','vencido','cancelado','reembolsado','em_disputa','em_analise'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tipo_plano_enum AS ENUM ('avulso', 'mensal', 'trimestral', 'anual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────
-- 1. PROFILES — estende auth.users (1:1)
--    Criado automaticamente pelo trigger handle_new_user (004)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome             text NOT NULL,
  sobrenome        text NOT NULL DEFAULT '',
  username         text UNIQUE NOT NULL,
  tipo_conta       tipo_conta_enum NOT NULL DEFAULT 'pf',
  genero           genero_enum,
  avatar_url       text,
  bio              text,
  cnpj             text,                        -- apenas tipo_conta = 'pj'
  verificado       boolean NOT NULL DEFAULT false, -- gov verificado
  plano_ativo      text,                        -- FK soft para planos(id)
  plano_valido_ate timestamptz,                 -- expiração do plano ativo
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_username_length CHECK (char_length(username) BETWEEN 3 AND 30),
  CONSTRAINT chk_username_chars  CHECK (username ~ '^[a-z0-9_]+$'),
  CONSTRAINT chk_cnpj_pj CHECK (tipo_conta != 'pj' OR cnpj IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_profiles_username    ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_tipo_conta  ON profiles(tipo_conta);
CREATE INDEX IF NOT EXISTS idx_profiles_verificado  ON profiles(verificado) WHERE verificado = true;

-- ─────────────────────────────────────────────────────────────────
-- 2. PLANOS — planos de monetização (R3)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planos (
  id                text PRIMARY KEY,           -- 'avulso', 'mensal_basico', etc.
  nome              text NOT NULL,
  tipo              tipo_plano_enum NOT NULL,
  preco             numeric(10,2) NOT NULL CHECK (preco >= 0),
  max_eventos       int NOT NULL DEFAULT 1,
  destaque_incluso  boolean NOT NULL DEFAULT false,
  descricao         text NOT NULL DEFAULT '',
  ativo             boolean NOT NULL DEFAULT true,
  criado_em         timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────
-- 3. EVENTOS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS eventos (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  criador_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nome              text NOT NULL,
  descricao         text NOT NULL DEFAULT '',
  local             text NOT NULL,
  lat               double precision NOT NULL,
  lng               double precision NOT NULL,
  categoria         categoria_evento_enum NOT NULL DEFAULT 'outro',
  data_inicio       timestamptz NOT NULL,
  data_fim          timestamptz,
  imagem_url        text,
  comercial         boolean NOT NULL DEFAULT false,
  exclusivo_mulheres boolean NOT NULL DEFAULT false,
  status            status_evento_enum NOT NULL DEFAULT 'pendente',
  pago              boolean NOT NULL DEFAULT false,
  destaque          boolean NOT NULL DEFAULT false,
  motivo_rejeicao   text,                       -- preenchido pelo moderador
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_datas CHECK (data_fim IS NULL OR data_fim >= data_inicio),
  CONSTRAINT chk_lat    CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT chk_lng    CHECK (lng BETWEEN -180 AND 180)
);

CREATE INDEX IF NOT EXISTS idx_eventos_criador_id   ON eventos(criador_id);
CREATE INDEX IF NOT EXISTS idx_eventos_status        ON eventos(status);
CREATE INDEX IF NOT EXISTS idx_eventos_categoria     ON eventos(categoria);
CREATE INDEX IF NOT EXISTS idx_eventos_data_inicio   ON eventos(data_inicio);
CREATE INDEX IF NOT EXISTS idx_eventos_destaque      ON eventos(destaque) WHERE destaque = true;
CREATE INDEX IF NOT EXISTS idx_eventos_excl_mulheres ON eventos(exclusivo_mulheres) WHERE exclusivo_mulheres = true;
CREATE INDEX IF NOT EXISTS idx_eventos_lat_lng       ON eventos(lat, lng);

-- Busca full-text (nome + descricao)
CREATE INDEX IF NOT EXISTS idx_eventos_busca ON eventos
  USING GIN (to_tsvector('portuguese', nome || ' ' || descricao));

-- ─────────────────────────────────────────────────────────────────
-- 4. PRODUTOS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS produtos (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  criador_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nome        text NOT NULL,
  descricao   text NOT NULL DEFAULT '',
  preco       numeric(10,2) NOT NULL CHECK (preco >= 0),
  moeda       char(3) NOT NULL DEFAULT 'BRL',
  categoria   categoria_produto_enum NOT NULL DEFAULT 'outro',
  imagem_url  text,
  local       text NOT NULL,
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  status      status_produto_enum NOT NULL DEFAULT 'pendente',
  evento_id   uuid REFERENCES eventos(id) ON DELETE SET NULL,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_lat_prod CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT chk_lng_prod CHECK (lng BETWEEN -180 AND 180)
);

CREATE INDEX IF NOT EXISTS idx_produtos_criador_id  ON produtos(criador_id);
CREATE INDEX IF NOT EXISTS idx_produtos_status       ON produtos(status);
CREATE INDEX IF NOT EXISTS idx_produtos_categoria    ON produtos(categoria);
CREATE INDEX IF NOT EXISTS idx_produtos_evento_id    ON produtos(evento_id);

-- ─────────────────────────────────────────────────────────────────
-- 5. CONVERSAS — chat 1:1 entre usuários
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversas (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  participante_ids uuid[] NOT NULL,             -- sempre 2 participantes
  ultima_mensagem  text,
  atualizado_em    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_participantes CHECK (array_length(participante_ids, 1) = 2)
);

CREATE INDEX IF NOT EXISTS idx_conversas_participantes ON conversas USING GIN (participante_ids);
CREATE INDEX IF NOT EXISTS idx_conversas_atualizado    ON conversas(atualizado_em DESC);

-- ─────────────────────────────────────────────────────────────────
-- 6. MENSAGENS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mensagens (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversa_id uuid NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
  autor_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  texto       text NOT NULL,
  lida        boolean NOT NULL DEFAULT false,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mensagens_conversa_id ON mensagens(conversa_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_autor_id    ON mensagens(autor_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_lida        ON mensagens(lida) WHERE lida = false;
CREATE INDEX IF NOT EXISTS idx_mensagens_criado_em   ON mensagens(criado_em DESC);

-- ─────────────────────────────────────────────────────────────────
-- 7. FAVORITOS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS favoritos (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  evento_id   uuid NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  criado_em   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (usuario_id, evento_id)
);

CREATE INDEX IF NOT EXISTS idx_favoritos_usuario_id ON favoritos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_favoritos_evento_id  ON favoritos(evento_id);

-- ─────────────────────────────────────────────────────────────────
-- 8. DENUNCIAS (R8)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS denuncias (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  denunciante_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tipo            tipo_denuncia_enum NOT NULL,
  alvo_id         text NOT NULL,               -- uuid como texto (evento, user ou msg)
  motivo          text NOT NULL,
  descricao       text,
  status          status_denuncia_enum NOT NULL DEFAULT 'aberta',
  resolvido_por   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  resolvido_em    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_denuncias_denunciante ON denuncias(denunciante_id);
CREATE INDEX IF NOT EXISTS idx_denuncias_alvo        ON denuncias(alvo_id);
CREATE INDEX IF NOT EXISTS idx_denuncias_status      ON denuncias(status);
CREATE INDEX IF NOT EXISTS idx_denuncias_criado_em   ON denuncias(criado_em DESC);

-- ─────────────────────────────────────────────────────────────────
-- 9. PAGAMENTOS (R3)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pagamentos (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  evento_id    uuid REFERENCES eventos(id) ON DELETE SET NULL,
  plano_id     text REFERENCES planos(id) ON DELETE SET NULL,
  id_externo   text UNIQUE,                    -- ID do Asaas / gateway externo
  valor        numeric(10,2) NOT NULL CHECK (valor >= 0),
  moeda        char(3) NOT NULL DEFAULT 'BRL',
  status       status_pagamento_enum NOT NULL DEFAULT 'pendente',
  metodo       text NOT NULL DEFAULT '',        -- 'PIX' | 'CREDIT_CARD' | 'BOLETO'
  vencimento   date,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_usuario_id  ON pagamentos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_evento_id   ON pagamentos(evento_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_id_externo  ON pagamentos(id_externo);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status      ON pagamentos(status);

-- ─────────────────────────────────────────────────────────────────
-- TRIGGERS: atualiza atualizado_em automaticamente
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar em tabelas com atualizado_em
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_profiles_atualizado_em') THEN
    CREATE TRIGGER trg_profiles_atualizado_em
      BEFORE UPDATE ON profiles
      FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_eventos_atualizado_em') THEN
    CREATE TRIGGER trg_eventos_atualizado_em
      BEFORE UPDATE ON eventos
      FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_produtos_atualizado_em') THEN
    CREATE TRIGGER trg_produtos_atualizado_em
      BEFORE UPDATE ON produtos
      FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pagamentos_atualizado') THEN
    CREATE TRIGGER trg_pagamentos_atualizado
      BEFORE UPDATE ON pagamentos
      FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
  END IF;
END $$;

-- Trigger para atualizar ultima_mensagem na conversa
CREATE OR REPLACE FUNCTION atualizar_ultima_mensagem()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversas
  SET ultima_mensagem = NEW.texto,
      atualizado_em   = now()
  WHERE id = NEW.conversa_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mensagem_nova') THEN
    CREATE TRIGGER trg_mensagem_nova
      AFTER INSERT ON mensagens
      FOR EACH ROW EXECUTE FUNCTION atualizar_ultima_mensagem();
  END IF;
END $$;
