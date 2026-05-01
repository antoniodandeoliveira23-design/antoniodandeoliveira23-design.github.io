/**
 * Edge Function: db-webhook
 * Recebe webhooks de tabelas do Supabase e roteia notificações.
 *
 * ── Configuração no Supabase Dashboard ──────────────────────────
 * Database → Webhooks → Create new webhook:
 *
 *   Nome: anomalia-critica
 *   Tabela: anomalia_log
 *   Eventos: INSERT
 *   URL: https://<project>.supabase.co/functions/v1/db-webhook
 *   Headers:
 *     x-webhook-source: supabase
 *     Authorization: Bearer <ALERT_SECRET>
 *
 *   Nome: audit-critico
 *   Tabela: audit_log
 *   Eventos: INSERT
 *   URL: https://<project>.supabase.co/functions/v1/db-webhook
 *   Headers:
 *     x-webhook-source: supabase
 *     Authorization: Bearer <ALERT_SECRET>
 *
 * ── Env vars ─────────────────────────────────────────────────────
 *   ALERT_SECRET              → valida chamadas do Supabase
 *   ADMIN_EMAIL               → email do admin para alertas
 *   SUPABASE_URL              → injetado automaticamente
 *   SUPABASE_SERVICE_ROLE_KEY → injetado automaticamente
 *   DISCORD_WEBHOOK_URL       → opcional, envia também no Discord
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

const ALERT_SECRET      = Deno.env.get('ALERT_SECRET')         ?? '';
const ADMIN_EMAIL       = Deno.env.get('ADMIN_EMAIL')          ?? '';
const DISCORD_WEBHOOK   = Deno.env.get('DISCORD_WEBHOOK_URL')  ?? '';
const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY')       ?? '';
const FROM_EMAIL        = Deno.env.get('FROM_EMAIL')           ?? 'AGORA <nao-responda@agora.app>';
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')         ?? '';
const FUNCTIONS_URL     = `${SUPABASE_URL}/functions/v1`;

// ─────────────────────────────────────────────────────────────────
// Tipos do payload Supabase DB Webhook
// ─────────────────────────────────────────────────────────────────

interface WebhookPayload {
  type:   'INSERT' | 'UPDATE' | 'DELETE';
  table:  string;
  schema: string;
  record: Record<string, unknown>;
  old_record?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────
// Roteador por tabela
// ─────────────────────────────────────────────────────────────────

async function processar(payload: WebhookPayload): Promise<string> {
  const { table, record } = payload;

  switch (table) {

    // ── Anomalias críticas → email + Discord ────────────────────
    case 'anomalia_log': {
      await Promise.all([
        notificarAnomaliaEmail(record),
        notificarAnomaliaDiscord(record),
      ]);
      return `anomalia_${record.tipo}_notificada`;
    }

    // ── Auditoria crítica → apenas Discord ─────────────────────
    case 'audit_log': {
      const sev = String(record.severidade ?? '');
      if (!['aviso', 'critico'].includes(sev)) {
        return 'audit_ignorado_severidade_baixa';
      }
      await notificarAuditDiscord(record);
      // Email apenas para eventos críticos de auth e pagamento
      const cat = String(record.categoria ?? '');
      if (sev === 'critico' && ['auth', 'pagamento', 'seguranca'].includes(cat)) {
        await notificarAuditEmail(record);
      }
      return `audit_${sev}_notificado`;
    }

    default:
      return `tabela_${table}_ignorada`;
  }
}

// ─────────────────────────────────────────────────────────────────
// Notificação por email — reutiliza email-transacional
// ─────────────────────────────────────────────────────────────────

async function notificarAnomaliaEmail(record: Record<string, unknown>): Promise<void> {
  if (!ADMIN_EMAIL || !ALERT_SECRET) return;

  // Anomalias de baixo risco não geram email
  const tipo = String(record.tipo ?? '');
  const EMAIL_TIPOS = ['velocidade', 'login_falha_repetida', 'multiplas_denuncias', 'conteudo_suspeito'];
  if (!EMAIL_TIPOS.includes(tipo)) return;

  try {
    await fetch(`${FUNCTIONS_URL}/email-transacional`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${ALERT_SECRET}`,
      },
      body: JSON.stringify({
        tipo:  'alerta_denuncia',
        para:  ADMIN_EMAIL,
        nome:  'Administrador',
        dados: {
          tipo:    `ANOMALIA: ${tipo.toUpperCase()}`,
          motivo:  String(record.descricao ?? 'Sem descrição'),
          alvo_id: String(record.user_id ?? 'anônimo'),
        },
      }),
    });
  } catch (err) {
    // Fallback: Resend direto
    await enviarEmailDireto(
      ADMIN_EMAIL,
      `⚠️ ANOMALIA AGORA — ${tipo}`,
      `<p>Anomalia detectada: <strong>${tipo}</strong><br>
       Descrição: ${record.descricao}<br>
       Usuário: ${record.user_id ?? 'anônimo'}<br>
       Detalhes: <pre>${JSON.stringify(record.detalhes, null, 2)}</pre></p>`
    ).catch(() => {});
  }
}

async function notificarAuditEmail(record: Record<string, unknown>): Promise<void> {
  if (!ADMIN_EMAIL) return;
  const severidade = String(record.severidade ?? 'info');
  const emoji = severidade === 'critico' ? '🚨' : '⚠️';

  await enviarEmailDireto(
    ADMIN_EMAIL,
    `${emoji} Evento crítico AGORA — ${record.acao}`,
    `<div style="font-family:sans-serif;background:#0F0F1A;color:#fff;padding:24px;border-radius:8px">
      <h2 style="color:#FF7A00">${emoji} Evento de Auditoria Crítico</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="color:#888;padding:6px 0">Ação</td><td style="color:#fff;font-weight:bold">${record.acao}</td></tr>
        <tr><td style="color:#888;padding:6px 0">Categoria</td><td style="color:#fff">${record.categoria}</td></tr>
        <tr><td style="color:#888;padding:6px 0">Severidade</td><td style="color:#EF4444;font-weight:bold">${severidade.toUpperCase()}</td></tr>
        <tr><td style="color:#888;padding:6px 0">Resultado</td><td style="color:#fff">${record.resultado}</td></tr>
        <tr><td style="color:#888;padding:6px 0">Usuário</td><td style="color:#8B5CF6">${record.user_id ?? 'anônimo'}</td></tr>
      </table>
      <pre style="background:#1A1A2E;padding:12px;border-radius:6px;color:#ccc;font-size:12px;margin-top:16px;overflow:auto">
${JSON.stringify(record.detalhes, null, 2)}
      </pre>
    </div>`
  ).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────
// Notificação por Discord
// ─────────────────────────────────────────────────────────────────

const DISCORD_CORES: Record<string, number> = {
  critico: 0xFF0000,
  aviso:   0xFF8800,
  info:    0x0099FF,
};

async function notificarAnomaliaDiscord(record: Record<string, unknown>): Promise<void> {
  if (!DISCORD_WEBHOOK) return;
  const tipo = String(record.tipo ?? 'desconhecido');

  const embed = {
    title:       `⚠️ ANOMALIA — ${tipo.toUpperCase()}`,
    description: String(record.descricao ?? ''),
    color:       DISCORD_CORES.aviso,
    fields: [
      { name: 'Usuário',   value: String(record.user_id ?? 'anônimo'), inline: true },
      { name: 'Resolvido', value: record.resolvido ? 'Sim' : 'Não',    inline: true },
      {
        name: 'Detalhes',
        value: record.detalhes && Object.keys(record.detalhes as object).length
          ? '```json\n' + JSON.stringify(record.detalhes, null, 2).slice(0, 400) + '\n```'
          : '—',
        inline: false,
      },
    ],
    footer:    { text: 'AGORA Anomaly Detector' },
    timestamp: String(record.created_at ?? new Date().toISOString()),
  };

  await fetch(DISCORD_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  }).catch(err => console.warn('[db-webhook] Discord anomalia falhou:', err));
}

async function notificarAuditDiscord(record: Record<string, unknown>): Promise<void> {
  if (!DISCORD_WEBHOOK) return;
  const severidade = String(record.severidade ?? 'info');

  const embed = {
    title:       `📋 AUDIT ${severidade.toUpperCase()} — ${record.acao}`,
    color:       DISCORD_CORES[severidade] ?? DISCORD_CORES.info,
    fields: [
      { name: 'Categoria',  value: String(record.categoria ?? '—'), inline: true },
      { name: 'Resultado',  value: String(record.resultado ?? '—'), inline: true },
      { name: 'Tabela',     value: String(record.tabela   ?? '—'), inline: true },
      {
        name: 'Detalhes',
        value: record.detalhes && Object.keys(record.detalhes as object).length
          ? '```json\n' + JSON.stringify(record.detalhes, null, 2).slice(0, 400) + '\n```'
          : '—',
        inline: false,
      },
    ],
    footer:    { text: 'AGORA Audit Monitor' },
    timestamp: String(record.created_at ?? new Date().toISOString()),
  };

  await fetch(DISCORD_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  }).catch(err => console.warn('[db-webhook] Discord audit falhou:', err));
}

// ─────────────────────────────────────────────────────────────────
// Envio de email direto via Resend (fallback)
// ─────────────────────────────────────────────────────────────────

async function enviarEmailDireto(para: string, subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [para], subject, html }),
  });
}

// ─────────────────────────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'POST')   return errorResponse('Method Not Allowed', 405);

  // Valida segredo do webhook
  const auth = req.headers.get('authorization') ?? '';
  const source = req.headers.get('x-webhook-source') ?? '';

  const isValidSecret = ALERT_SECRET && auth === `Bearer ${ALERT_SECRET}`;
  const isSupabaseWebhook = source === 'supabase';

  if (!isValidSecret && !isSupabaseWebhook) {
    return errorResponse('Unauthorized', 401);
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('JSON inválido', 400);
  }

  if (!payload.table || !payload.record) {
    return errorResponse('Payload inválido — faltam table e record', 400);
  }

  try {
    const resultado = await processar(payload);
    console.log(`[db-webhook] ${payload.table} → ${resultado}`);
    return jsonResponse({ ok: true, resultado });
  } catch (err) {
    console.error('[db-webhook] Erro ao processar:', err);
    return errorResponse(`Erro interno: ${String(err)}`, 500);
  }
});
