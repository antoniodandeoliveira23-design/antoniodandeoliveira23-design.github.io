/**
 * Edge Function: expirar-eventos
 * Marca eventos aprovados com data_inicio passada como 'expirado'.
 *
 * ── Dois modos de ativação ───────────────────────────────────────
 *
 * 1. Cron automático (pg_cron no Supabase):
 *    Supabase Dashboard → Database → Extensions → pg_cron (habilitar)
 *    Depois no SQL Editor:
 *
 *    SELECT cron.schedule(
 *      'expirar-eventos-diario',
 *      '0 3 * * *',   -- todo dia às 03:00 (horário do servidor)
 *      $$
 *        SELECT net.http_post(
 *          url    := current_setting('app.edge_functions_url') || '/expirar-eventos',
 *          headers := jsonb_build_object(
 *            'Authorization', 'Bearer ' || current_setting('app.alert_secret'),
 *            'Content-Type', 'application/json'
 *          ),
 *          body   := '{}'::jsonb
 *        );
 *      $$
 *    );
 *
 * 2. Manual via admin dashboard ou CI:
 *    curl -X POST https://<project>.supabase.co/functions/v1/expirar-eventos \
 *      -H "Authorization: Bearer $ALERT_SECRET"
 *
 * ── Env vars necessárias ─────────────────────────────────────────
 *   ALERT_SECRET              → valida chamadas internas
 *   SUPABASE_URL              → injetado automaticamente
 *   SUPABASE_SERVICE_ROLE_KEY → injetado automaticamente
 *   ADMIN_EMAIL               → email do admin para relatório (opcional)
 *   APP_URL                   → ex: https://agora-vilhena.vercel.app
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { validarAuth } from '../_shared/auth.ts';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')              ?? '';
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ADMIN_EMAIL       = Deno.env.get('ADMIN_EMAIL')               ?? '';
const APP_URL           = Deno.env.get('APP_URL') ?? 'https://agora-vilhena.vercel.app';
const ALERT_SECRET      = Deno.env.get('ALERT_SECRET')              ?? '';
const FUNCTIONS_URL     = `${SUPABASE_URL}/functions/v1`;

// ─────────────────────────────────────────────────────────────────
// Cliente Supabase com service role (acesso total, sem RLS)
// ─────────────────────────────────────────────────────────────────

function getAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─────────────────────────────────────────────────────────────────
// Expirar eventos passados
// ─────────────────────────────────────────────────────────────────

interface ResultadoExpiracao {
  expirados:   number;
  pendentes:   number;
  ts:          string;
  detalhes:    { id: string; nome: string; data_inicio: string }[];
}

export async function expirarEventos(): Promise<ResultadoExpiracao> {
  const sb = getAdminClient();
  const agora = new Date();
  const corte = new Date(agora.getTime() - 24 * 60 * 60_000); // 24h atrás

  // Busca eventos a expirar (com detalhes para log)
  const { data: paraExpirar, error: erroBusca } = await sb
    .from('eventos')
    .select('id, nome, data_inicio')
    .eq('status', 'aprovado')
    .lt('data_inicio', corte.toISOString());

  if (erroBusca) throw new Error(`Erro ao buscar eventos: ${erroBusca.message}`);

  const lista = paraExpirar ?? [];

  if (lista.length === 0) {
    return { expirados: 0, pendentes: 0, ts: agora.toISOString(), detalhes: [] };
  }

  // Atualiza status para 'expirado'
  const { error: erroUpdate } = await sb
    .from('eventos')
    .update({ status: 'expirado', atualizado_em: agora.toISOString() })
    .in('id', lista.map((e: { id: string }) => e.id));

  if (erroUpdate) throw new Error(`Erro ao expirar: ${erroUpdate.message}`);

  // Conta pendentes que ainda não foram pagos/aprovados
  const { count: pendentes } = await sb
    .from('eventos')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pendente');

  // Registra no audit_log
  await sb.from('audit_log').insert({
    user_id:    null,
    acao:       'eventos_expirados_cron',
    categoria:  'admin',
    severidade: lista.length >= 10 ? 'aviso' : 'info',
    detalhes:   { total: lista.length, ids: lista.map((e: { id: string }) => e.id).slice(0, 20) },
    resultado:  'sucesso',
  }).then(null, () => {});

  return {
    expirados: lista.length,
    pendentes: pendentes ?? 0,
    ts:        agora.toISOString(),
    detalhes:  lista as { id: string; nome: string; data_inicio: string }[],
  };
}

// ─────────────────────────────────────────────────────────────────
// Email de relatório para o admin
// ─────────────────────────────────────────────────────────────────

export async function enviarRelatorioAdmin(resultado: ResultadoExpiracao): Promise<void> {
  if (!ADMIN_EMAIL || !ALERT_SECRET) return;

  const linhas = resultado.detalhes.slice(0, 15).map(e => {
    const data = new Date(e.data_inicio).toLocaleDateString('pt-BR');
    return `<tr>
      <td style="padding:4px 8px;color:#ccc;font-size:13px">${e.nome}</td>
      <td style="padding:4px 8px;color:#888;font-size:12px">${data}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><body style="background:#07070E;font-family:sans-serif;padding:16px">
  <div style="max-width:520px;margin:0 auto;background:#0F0F1A;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#6C3FC5,#FF6B00);padding:24px;text-align:center">
      <h1 style="margin:0;color:#fff;font-size:22px;letter-spacing:3px">AGORA</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.6);font-size:12px">Relatório de Expiração</p>
    </div>
    <div style="padding:28px 24px">
      <h2 style="color:#FF7A00;margin-top:0">⏰ Relatório diário — ${new Date(resultado.ts).toLocaleDateString('pt-BR')}</h2>
      <div style="background:#1A1A2E;border-radius:8px;padding:16px;margin:16px 0">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="color:#888;font-size:12px;padding:4px 0">Eventos expirados</td>
            <td style="text-align:right;color:#FF7A00;font-weight:bold;font-size:18px">${resultado.expirados}</td>
          </tr>
          <tr>
            <td style="color:#888;font-size:12px;padding:4px 0">Eventos pendentes</td>
            <td style="text-align:right;color:#8B5CF6;font-weight:bold;font-size:18px">${resultado.pendentes}</td>
          </tr>
        </table>
      </div>
      ${resultado.detalhes.length > 0 ? `
        <h3 style="color:#fff;font-size:14px">Eventos expirados:</h3>
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <th style="text-align:left;color:#888;font-size:11px;padding:4px 8px;border-bottom:1px solid #333">EVENTO</th>
            <th style="text-align:left;color:#888;font-size:11px;padding:4px 8px;border-bottom:1px solid #333">DATA</th>
          </tr>
          ${linhas}
          ${resultado.detalhes.length > 15 ? `<tr><td colspan="2" style="color:#888;font-size:12px;padding:8px">... e mais ${resultado.detalhes.length - 15} evento(s)</td></tr>` : ''}
        </table>
      ` : '<p style="color:#888;font-size:13px">Nenhum evento expirado hoje.</p>'}
      <div style="margin-top:20px;text-align:center">
        <a href="${APP_URL}/admin/moderacao" style="background:#6C3FC5;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">
          Painel de Moderação
        </a>
      </div>
    </div>
    <div style="background:#1A1A2E;padding:14px 24px;text-align:center;color:#888;font-size:12px">
      Relatório automático gerado às ${new Date(resultado.ts).toLocaleTimeString('pt-BR')} |
      AGORA © ${new Date().getFullYear()}
    </div>
  </div>
</body></html>`;

  try {
    await fetch(`${FUNCTIONS_URL}/email-transacional`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${ALERT_SECRET}`,
      },
      body: JSON.stringify({
        tipo:  'relatorio_expiracao', // tipo genérico — usa envio direto
        para:  ADMIN_EMAIL,
        nome:  'Administrador',
        dados: {
          subject: `[AGORA] ${resultado.expirados} evento(s) expirado(s) — ${new Date(resultado.ts).toLocaleDateString('pt-BR')}`,
        },
      }),
    });
  } catch (err) {
    // Tenta envio direto se a Edge Function falhar
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
    if (!RESEND_API_KEY) return;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from:    Deno.env.get('FROM_EMAIL') ?? 'AGORA <nao-responda@agora.app>',
        to:      [ADMIN_EMAIL],
        subject: `[AGORA] ${resultado.expirados} evento(s) expirado(s) — ${new Date(resultado.ts).toLocaleDateString('pt-BR')}`,
        html,
      }),
    }).catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'POST')   return errorResponse('Method Not Allowed', 405);

  // Valida autenticação: só sistema ou admin podem chamar
  const auth = await validarAuth(req);
  if (!auth.ok) return errorResponse(auth.erro, 401);
  if (auth.tipo === 'usuario' && !auth.isAdmin) {
    return errorResponse('Requer permissão de administrador', 403);
  }

  try {
    console.log('[expirar-eventos] Iniciando...');
    const resultado = await expirarEventos();
    console.log(`[expirar-eventos] Expirados: ${resultado.expirados} | Pendentes: ${resultado.pendentes}`);

    // Envia email de relatório somente se algo mudou OU é segunda (relatório semanal)
    const ehSegunda = new Date().getDay() === 1;
    if (resultado.expirados > 0 || ehSegunda) {
      await enviarRelatorioAdmin(resultado);
    }

    return jsonResponse({
      ok: true,
      expirados: resultado.expirados,
      pendentes: resultado.pendentes,
      ts:        resultado.ts,
    });
  } catch (err) {
    console.error('[expirar-eventos] Erro:', err);

    // Registra no audit_log
    getAdminClient().from('audit_log').insert({
      user_id:    null,
      acao:       'expirar_eventos_falha',
      categoria:  'admin',
      severidade: 'critico',
      detalhes:   { erro: String(err) },
      resultado:  'falha',
    }).then(null, () => {});

    return errorResponse(`Erro interno: ${String(err)}`, 500);
  }
}

if (!Deno.env.get('DENO_TESTING')) { serve(handler); }
