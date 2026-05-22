/**
 * Edge Function: excluir-conta
 *
 * Exclui permanentemente a conta do usuário autenticado e todos os seus dados.
 * Requer o JWT do usuário no header Authorization (token da sessão ativa).
 *
 * Fluxo:
 *   1. Valida o JWT do usuário via SUPABASE_URL + SUPABASE_ANON_KEY
 *   2. Extrai o user_id do token
 *   3. Remove dados auxiliares (tokens push, etc.) via service_role
 *   4. Chama auth.admin.deleteUser() para excluir a conta do Auth
 *      (o CASCADE nas FKs do banco apaga os dados associados automaticamente)
 *   5. Retorna { ok: true }
 *
 * Env vars necessárias (já configuradas no projeto):
 *   SUPABASE_URL              — injetado automaticamente
 *   SUPABASE_ANON_KEY         — injetado automaticamente
 *   SUPABASE_SERVICE_ROLE_KEY — precisa ser secret do projeto
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')             ?? '';
const SUPABASE_ANON_KEY        = Deno.env.get('SUPABASE_ANON_KEY')        ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'POST')   return errorResponse('Method Not Allowed', 405);

  // ── 1. Extrai o JWT do usuário ──────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? '';
  const userJwt    = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!userJwt) return errorResponse('Token de autenticação ausente', 401);

  // ── 2. Valida o token e obtém o usuário ────────────────────────────
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  });

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();

  if (userError || !user) {
    console.error('[excluir-conta] Token inválido:', userError?.message);
    return errorResponse('Token inválido ou expirado', 401);
  }

  const userId = user.id;
  console.log(`[excluir-conta] Iniciando exclusão da conta: ${userId}`);

  // ── 3. Cliente admin com service_role ──────────────────────────────
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 4. Remove dados auxiliares que podem não ter CASCADE ───────────
  // (tokens de push, sessões ativas, etc.)
  const limpezas = [
    supabaseAdmin.from('push_tokens').delete().eq('usuario_id', userId),
    supabaseAdmin.from('anomalia_log').delete().eq('user_id', userId),
  ];

  await Promise.allSettled(limpezas);

  // ── 5. Exclui a conta do Auth (cascade apaga profiles, inscricoes, etc.) ─
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (deleteError) {
    console.error('[excluir-conta] Erro ao excluir usuário:', deleteError.message);
    return errorResponse(`Falha ao excluir conta: ${deleteError.message}`, 500);
  }

  console.log(`[excluir-conta] Conta excluída com sucesso: ${userId}`);
  return jsonResponse({ ok: true, mensagem: 'Conta excluída permanentemente.' });
}

if (!Deno.env.get('DENO_TESTING')) { serve(handler); }
