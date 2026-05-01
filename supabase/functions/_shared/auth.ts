/**
 * _shared/auth.ts
 * Validação de autenticação para Edge Functions do AGORA.
 *
 * Suporta dois modos:
 *  1. Bearer JWT  → usuário autenticado via Supabase Auth
 *  2. Bearer ALERT_SECRET → chamada interna (sistema / cron)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')              ?? '';
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ALERT_SECRET      = Deno.env.get('ALERT_SECRET')              ?? '';

// ─────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────

export type AuthResult =
  | { ok: true;  tipo: 'sistema'; userId: null;   isAdmin: false }
  | { ok: true;  tipo: 'usuario'; userId: string; isAdmin: boolean }
  | { ok: false; erro: string };

// ─────────────────────────────────────────────────────────────────
// Cliente com service role (acesso total, sem RLS)
// Criado uma vez por isolate de Edge Function
// ─────────────────────────────────────────────────────────────────
let _adminClient: ReturnType<typeof createClient> | null = null;

export function getAdminClient() {
  if (!_adminClient) {
    _adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _adminClient;
}

// ─────────────────────────────────────────────────────────────────
// Valida a requisição: aceita JWT de usuário ou ALERT_SECRET
// ─────────────────────────────────────────────────────────────────
export async function validarAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('authorization') ?? '';

  if (!authHeader.startsWith('Bearer ')) {
    return { ok: false, erro: 'Header Authorization ausente' };
  }

  const token = authHeader.slice(7); // remove "Bearer "

  // ── Modo sistema: valida ALERT_SECRET ──────────────────────────
  if (ALERT_SECRET && token === ALERT_SECRET) {
    return { ok: true, tipo: 'sistema', userId: null, isAdmin: false };
  }

  // ── Modo usuário: valida JWT do Supabase ──────────────────────
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return { ok: false, erro: 'Supabase não configurado no servidor' };
  }

  // Usa client admin para validar o token do usuário
  const { data: { user }, error } = await getAdminClient().auth.getUser(token);

  if (error || !user) {
    return { ok: false, erro: 'Token inválido ou expirado' };
  }

  // Verifica se é admin consultando a tabela profiles
  const { data: profile } = await getAdminClient()
    .from('profiles')
    .select('tipo_conta')
    .eq('id', user.id)
    .single();

  return {
    ok:      true,
    tipo:    'usuario',
    userId:  user.id,
    isAdmin: profile?.tipo_conta === 'admin',
  };
}

// ─────────────────────────────────────────────────────────────────
// Busca email de um usuário pelo ID (via auth.users — service role)
// ─────────────────────────────────────────────────────────────────
export async function buscarEmailUsuario(userId: string): Promise<string | null> {
  const { data, error } = await getAdminClient().auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  return data.user.email ?? null;
}

// ─────────────────────────────────────────────────────────────────
// Rate limiter simples em memória por isolate
// (adequado para Edge Functions stateless; para prod use KV/Redis)
// ─────────────────────────────────────────────────────────────────

const _rateLimitMap = new Map<string, number>(); // key → timestamp último envio

/**
 * @param key       Chave única (ex: "email_aprovado:user@ex.com")
 * @param minutos   Janela mínima entre chamadas (padrão: 2 min)
 * @returns true se permitido, false se bloqueado
 */
export function rateLimitCheck(key: string, minutos = 2): boolean {
  const agora = Date.now();
  const ultimo = _rateLimitMap.get(key) ?? 0;
  if (agora - ultimo < minutos * 60_000) return false;
  _rateLimitMap.set(key, agora);
  return true;
}
