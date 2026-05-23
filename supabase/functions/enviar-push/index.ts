/**
 * supabase/functions/enviar-push/index.ts
 *
 * Edge Function: envia push notification via Expo Push API
 * e cria registro in-app na tabela notificacoes.
 *
 * Chamada por: chat.ts, moderacao.ts, pagamentos.ts, asaas-webhook
 *
 * Body esperado:
 * {
 *   usuario_id: string,           // destinatário
 *   tipo: TipoNotificacao,
 *   titulo: string,
 *   mensagem: string,
 *   dados?: Record<string, string>
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/cors.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST')   return errorResponse('Method Not Allowed', 405);

  // ── Auth: aceita ALERT_SECRET (chamadas internas) ou JWT de usuário ──
  const ALERT_SECRET_ENV = Deno.env.get('ALERT_SECRET') ?? '';
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return errorResponse('Authorization ausente', 401);
  }
  const token = authHeader.slice(7);
  if (ALERT_SECRET_ENV && token !== ALERT_SECRET_ENV) {
    // Tenta validar como JWT do Supabase
    try {
      const adminCheck = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const { data: { user }, error } = await adminCheck.auth.getUser(token);
      if (error || !user) return errorResponse('Token inválido', 401);
    } catch {
      return errorResponse('Token inválido', 401);
    }
  }

  try {
    // Aceita chamadas de service_role (outras Edge Functions) ou usuários autenticados
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const { usuario_id, tipo, titulo, mensagem, dados = {} } = body;

    if (!usuario_id || !tipo || !titulo || !mensagem) {
      return errorResponse('Campos obrigatórios: usuario_id, tipo, titulo, mensagem', 400);
    }

    // ── 1. Criar notificação in-app ──────────────────────────────
    const { error: dbError } = await supabase.from('notificacoes').insert({
      usuario_id,
      tipo,
      titulo,
      mensagem,
      dados,
    });

    if (dbError) {
      console.error('[push] Erro ao criar notificação in-app:', dbError.message);
    }

    // ── 2. Buscar push tokens ativos do usuário ──────────────────
    const { data: tokens, error: tokensError } = await supabase
      .from('push_tokens')
      .select('token, plataforma')
      .eq('usuario_id', usuario_id)
      .eq('ativo', true);

    if (tokensError || !tokens?.length) {
      // Sem tokens: in-app foi criada, retorna sucesso
      return jsonResponse({ enviado: false, motivo: 'sem_tokens', in_app: !dbError });
    }

    // ── 3. Enviar via Expo Push API ──────────────────────────────
    const mensagens = tokens.map((t: { token: string; plataforma: string }) => ({
      to:    t.token,
      title: titulo,
      body:  mensagem,
      data:  { tipo, ...dados },
      sound: 'default',
      badge: 1,
      channelId: 'agora-notificacoes',
    }));

    const expoResp = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept':       'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mensagens),
    });

    const expoData = await expoResp.json();

    // Detectar tokens inválidos e desativá-los
    const results: Array<{ status: string; details?: { error?: string } }> =
      expoData.data ?? [];

    const tokensInvalidos = tokens
      .filter((_: unknown, i: number) =>
        results[i]?.status === 'error' &&
        results[i]?.details?.error === 'DeviceNotRegistered'
      )
      .map((t: { token: string }) => t.token);

    if (tokensInvalidos.length > 0) {
      await supabase
        .from('push_tokens')
        .update({ ativo: false })
        .in('token', tokensInvalidos);
    }

    return jsonResponse({
      enviado:       true,
      push_enviados: mensagens.length,
      in_app:        !dbError,
    });

  } catch (err) {
    console.error('[push] Erro inesperado:', err);
    return errorResponse('Erro interno', 500);
  }
}

if (!Deno.env.get('DENO_TESTING')) { serve(handler); }
