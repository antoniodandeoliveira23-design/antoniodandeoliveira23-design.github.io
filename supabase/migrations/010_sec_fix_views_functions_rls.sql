-- ══════════════════════════════════════════════════════════════════════
-- MIGRAÇÃO: sec_fix_views_functions_rls_policies
-- 1. Views SECURITY DEFINER → security_invoker (respeita RLS do caller)
-- 2. search_path fixado em todas as 16 funções (previne schema hijacking)
-- 3. Revoke anon EXECUTE em funções SECURITY DEFINER
-- 4. Revoke authenticated EXECUTE em funções internas (triggers / cron)
-- 5. Políticas WITH CHECK (true) em tabelas de log → restritas a service_role
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. Views: remove SECURITY DEFINER, aplica security_invoker ────────
ALTER VIEW public.profiles_publico     SET (security_invoker = on);
ALTER VIEW public.vw_anomalias_ativas  SET (security_invoker = on);
ALTER VIEW public.vw_dashboard_stats   SET (security_invoker = on);
ALTER VIEW public.vw_painel_moderacao  SET (security_invoker = on);

-- ── 2. Fixa search_path em todas as funções ───────────────────────────
ALTER FUNCTION public.aprovar_evento(uuid)                          SET search_path = 'public';
ALTER FUNCTION public.atualizar_conversa_apos_mensagem()            SET search_path = 'public';
ALTER FUNCTION public.atualizar_ultima_mensagem()                   SET search_path = 'public';
ALTER FUNCTION public.contar_denuncias_abertas()                    SET search_path = 'public';
ALTER FUNCTION public.detectar_multiplas_denuncias()                SET search_path = 'public';
ALTER FUNCTION public.detectar_velocidade_suspeita()                SET search_path = 'public';
ALTER FUNCTION public.eventos_por_raio(double precision, double precision, double precision, text, integer, integer)
                                                                    SET search_path = 'public';
ALTER FUNCTION public.expirar_eventos_passados()                    SET search_path = 'public';
ALTER FUNCTION public.handle_new_user()                             SET search_path = 'public';
ALTER FUNCTION public.is_admin()                                    SET search_path = 'public';
ALTER FUNCTION public.is_moderator()                                SET search_path = 'public';
ALTER FUNCTION public.mensagens_update_conversa()                   SET search_path = 'public';
ALTER FUNCTION public.rejeitar_evento(uuid, text)                   SET search_path = 'public';
ALTER FUNCTION public.set_atualizado_em()                           SET search_path = 'public';
ALTER FUNCTION public.sync_total_inscritos()                        SET search_path = 'public';
ALTER FUNCTION public.update_updated_at_column()                    SET search_path = 'public';

-- ── 3. Revoke anon EXECUTE em funções SECURITY DEFINER ───────────────
REVOKE EXECUTE ON FUNCTION public.aprovar_evento(uuid)             FROM anon;
REVOKE EXECUTE ON FUNCTION public.atualizar_conversa_apos_mensagem() FROM anon;
REVOKE EXECUTE ON FUNCTION public.contar_denuncias_abertas()        FROM anon;
REVOKE EXECUTE ON FUNCTION public.detectar_multiplas_denuncias()    FROM anon;
REVOKE EXECUTE ON FUNCTION public.detectar_velocidade_suspeita()    FROM anon;
REVOKE EXECUTE ON FUNCTION public.eventos_por_raio(double precision, double precision, double precision, text, integer, integer)
                                                                    FROM anon;
REVOKE EXECUTE ON FUNCTION public.expirar_eventos_passados()        FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin()                        FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_moderator()                    FROM anon;
REVOKE EXECUTE ON FUNCTION public.rejeitar_evento(uuid, text)       FROM anon;

-- ── 4. Revoke authenticated EXECUTE em funções internas ──────────────
REVOKE EXECUTE ON FUNCTION public.atualizar_conversa_apos_mensagem() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.detectar_multiplas_denuncias()     FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.detectar_velocidade_suspeita()     FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.expirar_eventos_passados()         FROM authenticated;

-- ── 5. Fix WITH CHECK (true) em políticas de tabelas de log ──────────
DROP POLICY IF EXISTS service_insere_access   ON public.access_log;
CREATE POLICY service_insere_access ON public.access_log
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS service_insere_anomalia ON public.anomalia_log;
CREATE POLICY service_insere_anomalia ON public.anomalia_log
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS notificacoes_service_insert ON public.notificacoes;
CREATE POLICY notificacoes_service_insert ON public.notificacoes
  FOR INSERT TO service_role WITH CHECK (true);
