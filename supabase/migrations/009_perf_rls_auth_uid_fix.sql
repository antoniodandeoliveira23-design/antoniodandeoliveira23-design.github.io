-- ══════════════════════════════════════════════════════════════════════
-- MIGRAÇÃO: perf_rls_auth_uid_fix_drop_duplicate_indexes
-- Substitui auth.uid() por (SELECT auth.uid()) em todas as políticas RLS
-- para evitar re-avaliação por linha (Auth RLS Initialization Plan).
-- Remove índices duplicados em audit_log.
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. Drop de índices duplicados em audit_log ────────────────────────
DROP INDEX IF EXISTS public.idx_audit_created_at;
DROP INDEX IF EXISTS public.idx_audit_user_id;

-- ── 2. Fix RLS: access_log ────────────────────────────────────────────
DROP POLICY IF EXISTS admin_le_access ON public.access_log;
CREATE POLICY admin_le_access ON public.access_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.tipo_conta = 'admin'
  ));

-- ── 3. Fix RLS: admin_2fa_tokens ──────────────────────────────────────
DROP POLICY IF EXISTS admin_le_proprio_token ON public.admin_2fa_tokens;
CREATE POLICY admin_le_proprio_token ON public.admin_2fa_tokens FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- ── 4. Fix RLS: anomalia_log ──────────────────────────────────────────
DROP POLICY IF EXISTS admin_atualiza_anomalias ON public.anomalia_log;
CREATE POLICY admin_atualiza_anomalias ON public.anomalia_log FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.tipo_conta = 'admin'
  ));

DROP POLICY IF EXISTS admin_le_anomalias ON public.anomalia_log;
CREATE POLICY admin_le_anomalias ON public.anomalia_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.tipo_conta = ANY (ARRAY['admin'::text, 'gov'::text])
  ));

-- ── 5. Fix RLS: audit_log ─────────────────────────────────────────────
DROP POLICY IF EXISTS admin_le_audit ON public.audit_log;
CREATE POLICY admin_le_audit ON public.audit_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.tipo_conta = 'admin'
  ));

DROP POLICY IF EXISTS audit_log_insert_proprio ON public.audit_log;
CREATE POLICY audit_log_insert_proprio ON public.audit_log FOR INSERT
  WITH CHECK ((user_id IS NULL) OR (user_id = (SELECT auth.uid())));

-- ── 6. Fix RLS: categoria ─────────────────────────────────────────────
DROP POLICY IF EXISTS categoria_admin_delete ON public.categoria;
CREATE POLICY categoria_admin_delete ON public.categoria FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.tipo_conta = 'admin'
  ));

DROP POLICY IF EXISTS categoria_admin_insert ON public.categoria;
CREATE POLICY categoria_admin_insert ON public.categoria FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.tipo_conta = 'admin'
  ));

DROP POLICY IF EXISTS categoria_admin_update ON public.categoria;
CREATE POLICY categoria_admin_update ON public.categoria FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.tipo_conta = 'admin'
  ));

-- ── 7. Fix RLS: conversas ─────────────────────────────────────────────
DROP POLICY IF EXISTS conversas_delete ON public.conversas;
CREATE POLICY conversas_delete ON public.conversas FOR DELETE
  USING ((SELECT auth.uid()) = ANY (participante_ids));

DROP POLICY IF EXISTS conversas_insert ON public.conversas;
CREATE POLICY conversas_insert ON public.conversas FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = ANY (participante_ids));

DROP POLICY IF EXISTS conversas_select ON public.conversas;
CREATE POLICY conversas_select ON public.conversas FOR SELECT
  USING ((SELECT auth.uid()) = ANY (participante_ids));

-- ── 8. Fix RLS: denuncias ─────────────────────────────────────────────
DROP POLICY IF EXISTS denuncias_insert ON public.denuncias;
CREATE POLICY denuncias_insert ON public.denuncias FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = denunciante_id);

DROP POLICY IF EXISTS denuncias_select ON public.denuncias;
CREATE POLICY denuncias_select ON public.denuncias FOR SELECT
  USING (
    ((SELECT auth.uid()) = denunciante_id)
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.tipo_conta = 'admin'
    )
  );

DROP POLICY IF EXISTS denuncias_update_admin ON public.denuncias;
CREATE POLICY denuncias_update_admin ON public.denuncias FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.tipo_conta = 'admin'
  ));

-- ── 9. Fix RLS: email_log ─────────────────────────────────────────────
DROP POLICY IF EXISTS admin_le_email_log ON public.email_log;
CREATE POLICY admin_le_email_log ON public.email_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.tipo_conta = 'admin'
  ));

-- ── 10. Fix RLS: empresa ──────────────────────────────────────────────
DROP POLICY IF EXISTS empresa_insert ON public.empresa;
CREATE POLICY empresa_insert ON public.empresa FOR INSERT
  WITH CHECK (
    ((SELECT auth.uid()) = owner_id)
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.tipo_conta = ANY (ARRAY['pj'::text, 'gov'::text])
    )
  );

DROP POLICY IF EXISTS empresa_select ON public.empresa;
CREATE POLICY empresa_select ON public.empresa FOR SELECT
  USING (
    ((SELECT auth.uid()) = owner_id)
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.tipo_conta = 'admin'
    )
  );

DROP POLICY IF EXISTS empresa_update ON public.empresa;
CREATE POLICY empresa_update ON public.empresa FOR UPDATE
  USING ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

-- ── 11. Fix RLS: endereco ─────────────────────────────────────────────
DROP POLICY IF EXISTS endereco_admin_delete ON public.endereco;
CREATE POLICY endereco_admin_delete ON public.endereco FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.tipo_conta = 'admin'
  ));

DROP POLICY IF EXISTS endereco_admin_update ON public.endereco;
CREATE POLICY endereco_admin_update ON public.endereco FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.tipo_conta = 'admin'
  ));

DROP POLICY IF EXISTS endereco_insert ON public.endereco;
CREATE POLICY endereco_insert ON public.endereco FOR INSERT
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ── 12. Fix RLS: evento_participante ──────────────────────────────────
DROP POLICY IF EXISTS participante_insert ON public.evento_participante;
CREATE POLICY participante_insert ON public.evento_participante FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM pessoa
    WHERE pessoa.id = evento_participante.pessoa_id
      AND pessoa.auth_user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS participante_select ON public.evento_participante;
CREATE POLICY participante_select ON public.evento_participante FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pessoa
      WHERE pessoa.id = evento_participante.pessoa_id
        AND pessoa.auth_user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM eventos
      WHERE eventos.id = evento_participante.evento_id
        AND eventos.criador_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.tipo_conta = 'admin'
    )
  );

-- ── 13. Fix RLS: eventos ──────────────────────────────────────────────
DROP POLICY IF EXISTS eventos_delete ON public.eventos;
CREATE POLICY eventos_delete ON public.eventos FOR DELETE
  USING (
    ((SELECT auth.uid()) = criador_id)
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.tipo_conta = 'admin'
    )
  );

DROP POLICY IF EXISTS eventos_insert ON public.eventos;
CREATE POLICY eventos_insert ON public.eventos FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = criador_id);

DROP POLICY IF EXISTS eventos_select ON public.eventos;
CREATE POLICY eventos_select ON public.eventos FOR SELECT
  USING ((status = 'aprovado'::text) OR (criador_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS eventos_update ON public.eventos;
CREATE POLICY eventos_update ON public.eventos FOR UPDATE
  USING (
    ((SELECT auth.uid()) = criador_id)
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.tipo_conta = 'admin'
    )
  );

-- ── 14. Fix RLS: favoritos ────────────────────────────────────────────
DROP POLICY IF EXISTS favoritos_all ON public.favoritos;
CREATE POLICY favoritos_all ON public.favoritos FOR ALL
  USING ((SELECT auth.uid()) = usuario_id);

-- ── 15. Fix RLS: inscricoes ───────────────────────────────────────────
DROP POLICY IF EXISTS inscricoes_criador_select ON public.inscricoes;
CREATE POLICY inscricoes_criador_select ON public.inscricoes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM eventos e
    WHERE e.id = inscricoes.evento_id AND e.criador_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS inscricoes_own_insert ON public.inscricoes;
CREATE POLICY inscricoes_own_insert ON public.inscricoes FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = usuario_id);

DROP POLICY IF EXISTS inscricoes_own_select ON public.inscricoes;
CREATE POLICY inscricoes_own_select ON public.inscricoes FOR SELECT
  USING ((SELECT auth.uid()) = usuario_id);

DROP POLICY IF EXISTS inscricoes_own_update ON public.inscricoes;
CREATE POLICY inscricoes_own_update ON public.inscricoes FOR UPDATE
  USING ((SELECT auth.uid()) = usuario_id);

-- ── 16. Fix RLS: mensagens ────────────────────────────────────────────
DROP POLICY IF EXISTS mensagens_insert ON public.mensagens;
CREATE POLICY mensagens_insert ON public.mensagens FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = autor_id);

DROP POLICY IF EXISTS mensagens_select ON public.mensagens;
CREATE POLICY mensagens_select ON public.mensagens FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM conversas
    WHERE conversas.id = mensagens.conversa_id
      AND (SELECT auth.uid()) = ANY (conversas.participante_ids)
  ));

-- ── 17. Fix RLS: notificacoes ─────────────────────────────────────────
DROP POLICY IF EXISTS notificacoes_own_select ON public.notificacoes;
CREATE POLICY notificacoes_own_select ON public.notificacoes FOR SELECT
  USING ((SELECT auth.uid()) = usuario_id);

DROP POLICY IF EXISTS notificacoes_own_update ON public.notificacoes;
CREATE POLICY notificacoes_own_update ON public.notificacoes FOR UPDATE
  USING ((SELECT auth.uid()) = usuario_id)
  WITH CHECK ((SELECT auth.uid()) = usuario_id);

-- ── 18. Fix RLS: pagamentos ───────────────────────────────────────────
DROP POLICY IF EXISTS pagamentos_insert ON public.pagamentos;
CREATE POLICY pagamentos_insert ON public.pagamentos FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = usuario_id);

DROP POLICY IF EXISTS pagamentos_select ON public.pagamentos;
CREATE POLICY pagamentos_select ON public.pagamentos FOR SELECT
  USING ((SELECT auth.uid()) = usuario_id);

-- ── 19. Fix RLS: pessoa ───────────────────────────────────────────────
DROP POLICY IF EXISTS pessoa_insert ON public.pessoa;
CREATE POLICY pessoa_insert ON public.pessoa FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = auth_user_id);

DROP POLICY IF EXISTS pessoa_select ON public.pessoa;
CREATE POLICY pessoa_select ON public.pessoa FOR SELECT
  USING (
    ((SELECT auth.uid()) = auth_user_id)
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.tipo_conta = 'admin'
    )
  );

DROP POLICY IF EXISTS pessoa_update ON public.pessoa;
CREATE POLICY pessoa_update ON public.pessoa FOR UPDATE
  USING ((SELECT auth.uid()) = auth_user_id)
  WITH CHECK ((SELECT auth.uid()) = auth_user_id);

-- ── 20. Fix RLS: planos ───────────────────────────────────────────────
DROP POLICY IF EXISTS planos_admin_delete ON public.planos;
CREATE POLICY planos_admin_delete ON public.planos FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.tipo_conta = 'admin'
  ));

DROP POLICY IF EXISTS planos_admin_insert ON public.planos;
CREATE POLICY planos_admin_insert ON public.planos FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.tipo_conta = 'admin'
  ));

DROP POLICY IF EXISTS planos_admin_update ON public.planos;
CREATE POLICY planos_admin_update ON public.planos FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.tipo_conta = 'admin'
  ));

-- ── 21. Fix RLS: produtos ─────────────────────────────────────────────
DROP POLICY IF EXISTS produtos_delete ON public.produtos;
CREATE POLICY produtos_delete ON public.produtos FOR DELETE
  USING ((SELECT auth.uid()) = criador_id);

DROP POLICY IF EXISTS produtos_insert ON public.produtos;
CREATE POLICY produtos_insert ON public.produtos FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = criador_id);

DROP POLICY IF EXISTS produtos_select ON public.produtos;
CREATE POLICY produtos_select ON public.produtos FOR SELECT
  USING ((status = 'ativo'::text) OR (criador_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS produtos_update ON public.produtos;
CREATE POLICY produtos_update ON public.produtos FOR UPDATE
  USING ((SELECT auth.uid()) = criador_id);

-- ── 22. Fix RLS: profiles ─────────────────────────────────────────────
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS profiles_select_proprio ON public.profiles;
CREATE POLICY profiles_select_proprio ON public.profiles FOR SELECT
  USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS profiles_select_publico ON public.profiles;
CREATE POLICY profiles_select_publico ON public.profiles FOR SELECT
  USING (((SELECT auth.uid()) <> id) AND ((SELECT auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS profiles_update_seguro ON public.profiles;
CREATE POLICY profiles_update_seguro ON public.profiles FOR UPDATE
  USING ((SELECT auth.uid()) = id)
  WITH CHECK (
    ((SELECT auth.uid()) = id)
    AND (tipo_conta = (
      SELECT p.tipo_conta FROM profiles p WHERE p.id = (SELECT auth.uid())
    ))
    AND (verificado = (
      SELECT p.verificado FROM profiles p WHERE p.id = (SELECT auth.uid())
    ))
  );

-- ── 23. Fix RLS: push_tokens ──────────────────────────────────────────
DROP POLICY IF EXISTS push_tokens_own_all ON public.push_tokens;
CREATE POLICY push_tokens_own_all ON public.push_tokens FOR ALL
  USING ((SELECT auth.uid()) = usuario_id)
  WITH CHECK ((SELECT auth.uid()) = usuario_id);
