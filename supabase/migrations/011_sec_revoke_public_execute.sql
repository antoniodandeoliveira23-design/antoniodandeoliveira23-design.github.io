-- ══════════════════════════════════════════════════════════════════════
-- MIGRAÇÃO: sec_revoke_public_execute_functions
-- REVOKE de PUBLIC (que inclui anon) e re-grant apenas para as roles
-- que legitimamente precisam chamar cada função.
-- ══════════════════════════════════════════════════════════════════════

-- ── Funções internas (triggers / pg_cron) ────────────────────────────
REVOKE ALL ON FUNCTION public.atualizar_conversa_apos_mensagem() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.detectar_multiplas_denuncias()      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.detectar_velocidade_suspeita()      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user()                   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expirar_eventos_passados()          FROM PUBLIC;

-- ── Funções admin/helper (callable apenas por authenticated) ──────────
REVOKE ALL ON FUNCTION public.aprovar_evento(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aprovar_evento(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.rejeitar_evento(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rejeitar_evento(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.contar_denuncias_abertas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contar_denuncias_abertas() TO authenticated;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.is_moderator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_moderator() TO authenticated;

REVOKE ALL ON FUNCTION public.eventos_por_raio(
  double precision, double precision, double precision, text, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eventos_por_raio(
  double precision, double precision, double precision, text, integer, integer
) TO authenticated;
