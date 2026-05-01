-- ═══════════════════════════════════════════════════════════════════
-- AGORA — Migration 002: Row Level Security (RLS)
-- Aplicar APÓS 001_schema.sql
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- Helper: verifica se o usuário atual é admin
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND tipo_conta = 'admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: verifica se é admin ou gov
CREATE OR REPLACE FUNCTION is_moderator()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND tipo_conta IN ('admin', 'gov')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────
-- 1. PROFILES
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Qualquer um pode ler perfis públicos
CREATE POLICY "profiles_leitura_publica" ON profiles
  FOR SELECT USING (true);

-- Usuário pode atualizar apenas o próprio perfil
CREATE POLICY "profiles_atualizar_proprio" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admin pode atualizar qualquer perfil
CREATE POLICY "profiles_admin_atualiza" ON profiles
  FOR UPDATE USING (is_admin());

-- Inserção feita apenas pelo trigger handle_new_user (SECURITY DEFINER)
CREATE POLICY "profiles_inserir_trigger" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Ninguém deleta perfil direto (só via auth.users cascade)
-- (sem policy de DELETE = bloqueado por padrão)

-- ─────────────────────────────────────────────────────────────────
-- 2. PLANOS
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE planos ENABLE ROW LEVEL SECURITY;

-- Todos podem ler planos ativos
CREATE POLICY "planos_leitura_publica" ON planos
  FOR SELECT USING (ativo = true);

-- Somente admin pode gerenciar planos
CREATE POLICY "planos_admin_gerenciar" ON planos
  FOR ALL USING (is_admin());

-- ─────────────────────────────────────────────────────────────────
-- 3. EVENTOS
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;

-- Leitura pública: eventos aprovados
CREATE POLICY "eventos_leitura_aprovados" ON eventos
  FOR SELECT USING (status = 'aprovado');

-- Dono vê todos os seus eventos (qualquer status)
CREATE POLICY "eventos_dono_le_todos" ON eventos
  FOR SELECT USING (auth.uid() = criador_id);

-- Admin/moderador lê tudo
CREATE POLICY "eventos_moderador_le_tudo" ON eventos
  FOR SELECT USING (is_moderator());

-- Autenticado pode criar
CREATE POLICY "eventos_inserir_autenticado" ON eventos
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = criador_id
  );

-- Dono pode editar (status rascunho/pendente); admin pode editar qualquer
CREATE POLICY "eventos_dono_edita" ON eventos
  FOR UPDATE USING (
    auth.uid() = criador_id
    AND status IN ('rascunho', 'pendente', 'rejeitado')
  );

CREATE POLICY "eventos_admin_edita" ON eventos
  FOR UPDATE USING (is_moderator());

-- Dono deleta apenas rascunhos; admin deleta tudo
CREATE POLICY "eventos_dono_deleta_rascunho" ON eventos
  FOR DELETE USING (
    auth.uid() = criador_id
    AND status = 'rascunho'
  );

CREATE POLICY "eventos_admin_deleta" ON eventos
  FOR DELETE USING (is_admin());

-- ─────────────────────────────────────────────────────────────────
-- 4. PRODUTOS
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;

-- Leitura pública: produtos ativos
CREATE POLICY "produtos_leitura_ativos" ON produtos
  FOR SELECT USING (status = 'ativo');

-- Dono vê os próprios em qualquer status
CREATE POLICY "produtos_dono_le_todos" ON produtos
  FOR SELECT USING (auth.uid() = criador_id);

-- Admin lê tudo
CREATE POLICY "produtos_admin_le" ON produtos
  FOR SELECT USING (is_admin());

-- Inserção: apenas PJ autenticado
CREATE POLICY "produtos_inserir_pj" ON produtos
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = criador_id
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND tipo_conta IN ('pj', 'admin')
    )
  );

-- Dono edita o próprio produto
CREATE POLICY "produtos_dono_edita" ON produtos
  FOR UPDATE USING (auth.uid() = criador_id);

-- Admin edita qualquer
CREATE POLICY "produtos_admin_edita" ON produtos
  FOR UPDATE USING (is_admin());

-- Dono ou admin deleta
CREATE POLICY "produtos_dono_deleta" ON produtos
  FOR DELETE USING (auth.uid() = criador_id OR is_admin());

-- ─────────────────────────────────────────────────────────────────
-- 5. CONVERSAS
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE conversas ENABLE ROW LEVEL SECURITY;

-- Apenas participantes lêem a conversa
CREATE POLICY "conversas_participante_le" ON conversas
  FOR SELECT USING (auth.uid() = ANY(participante_ids));

-- Autenticado cria conversa (deve ser participante)
CREATE POLICY "conversas_criar" ON conversas
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = ANY(participante_ids)
  );

-- Sistema/trigger atualiza ultima_mensagem
CREATE POLICY "conversas_update_sistema" ON conversas
  FOR UPDATE USING (auth.uid() = ANY(participante_ids));

-- ─────────────────────────────────────────────────────────────────
-- 6. MENSAGENS
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE mensagens ENABLE ROW LEVEL SECURITY;

-- Participante da conversa lê mensagens
CREATE POLICY "mensagens_participante_le" ON mensagens
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversas
      WHERE id = mensagens.conversa_id
        AND auth.uid() = ANY(participante_ids)
    )
  );

-- Autor envia mensagem (deve ser participante)
CREATE POLICY "mensagens_autor_insere" ON mensagens
  FOR INSERT WITH CHECK (
    auth.uid() = autor_id
    AND EXISTS (
      SELECT 1 FROM conversas
      WHERE id = conversa_id
        AND auth.uid() = ANY(participante_ids)
    )
  );

-- Autor pode marcar como lida / editar própria mensagem
CREATE POLICY "mensagens_autor_atualiza" ON mensagens
  FOR UPDATE USING (auth.uid() = autor_id);

-- Participante pode marcar mensagens recebidas como lidas
CREATE POLICY "mensagens_marcar_lida" ON mensagens
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM conversas
      WHERE id = mensagens.conversa_id
        AND auth.uid() = ANY(participante_ids)
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- 7. FAVORITOS
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE favoritos ENABLE ROW LEVEL SECURITY;

-- Usuário vê apenas os próprios favoritos
CREATE POLICY "favoritos_proprio_usuario" ON favoritos
  FOR ALL USING (auth.uid() = usuario_id)
  WITH CHECK (auth.uid() = usuario_id);

-- ─────────────────────────────────────────────────────────────────
-- 8. DENUNCIAS
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE denuncias ENABLE ROW LEVEL SECURITY;

-- Denunciante vê as próprias denúncias
CREATE POLICY "denuncias_proprio_denunciante" ON denuncias
  FOR SELECT USING (auth.uid() = denunciante_id);

-- Admin/moderador lê todas
CREATE POLICY "denuncias_moderador_le" ON denuncias
  FOR SELECT USING (is_moderator());

-- Autenticado cria denúncia
CREATE POLICY "denuncias_criar" ON denuncias
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = denunciante_id
  );

-- Apenas admin/moderador atualiza (resolve/descarta)
CREATE POLICY "denuncias_moderador_atualiza" ON denuncias
  FOR UPDATE USING (is_moderator());

-- ─────────────────────────────────────────────────────────────────
-- 9. PAGAMENTOS
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE pagamentos ENABLE ROW LEVEL SECURITY;

-- Usuário vê apenas os próprios pagamentos
CREATE POLICY "pagamentos_proprio_usuario" ON pagamentos
  FOR SELECT USING (auth.uid() = usuario_id);

-- Admin vê todos
CREATE POLICY "pagamentos_admin_le" ON pagamentos
  FOR SELECT USING (is_admin());

-- Autenticado cria pagamento para si mesmo
CREATE POLICY "pagamentos_criar" ON pagamentos
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = usuario_id
  );

-- Admin confirma/atualiza pagamento
CREATE POLICY "pagamentos_admin_atualiza" ON pagamentos
  FOR UPDATE USING (is_admin());

-- Service role (Edge Function webhook) pode upsert
-- (via SUPABASE_SERVICE_ROLE_KEY — bypassa RLS automaticamente)

-- ─────────────────────────────────────────────────────────────────
-- GRANT permissões ao role autenticado
-- ─────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT ON planos TO anon;
GRANT SELECT ON eventos TO anon;
GRANT SELECT ON profiles TO anon;
GRANT SELECT ON produtos TO anon;
