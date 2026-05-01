/**
 * Edge Function: alertas-criticos
 * Recebe webhooks de tabelas do Supabase e envia alertas via Discord e email.
 *
 * ⚠️  ATENÇÃO: Esta função foi supersedida por `db-webhook`, que oferece
 *     roteamento mais completo e suporte a email.
 *     Configure APENAS UM dos dois como DB Webhook para evitar duplicatas.
 *     Recomendamos usar `db-webhook` em novos projetos.
 *
 * ── Env vars ─────────────────────────────────────────────────────────
 *   ALERT_SECRET         → valida chamadas do Supabase
 *   DISCORD_WEBHOOK_URL  → canal #alertas-agora (opcional)
 *   ADMIN_EMAIL          → email do admin para alertas críticos (opcional)
 *   SUPABASE_URL         → injetado automaticamente
 *   SUPABASE_SERVICE_ROLE_KEY → injetado automaticamente
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

const DISCORD_WEBHOOK = Deno.env.get('DISCORD_WEBHOOK_URL') ?? '';
const ALERT_SECRET    = Deno.env.get('ALERT_SECRET')        ?? '';
const ADMIN_EMAIL     = Deno.env.get('ADMIN_EMAIL')         ?? '';
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')        ?? '';
const RESEND_API_KEY  = Deno.env.get('RESEND_API_KEY')      ?? '';
const FROM_EMAIL      = Deno.env.get('FROM_EMAIL')          ?? 'AGORA <nao-responda@agora.app>';
const FUNCTIONS_URL   = `${SUPABASE_URL}/functions/v1`;

// ─────────────────────────────────────────────────────────────────
// Cores e ícones Discord
// ─────────────────────────────────────────────────────────────────

const CORES: Record<string, number> = {
  critico:  0xFF0000,
  aviso:    0xFF8800,
  info:     0x0099FF,
  anomalia: 0xFF4444,
};

const ICONES: Record<string, string> = {
  auth:                 '🔐',
  evento:               '📅',
  moderacao:            '⚖️',
  pagamento:            '💳',
  denuncia:             '🚨',
  admin:                '👤',
  seguranca:            '🛡️',
  anomalia:             '⚠️',
  velocidade:           '⚡',
  login_falha_repetida: '🔑',
  conteudo_suspeito:    '🚫',
  multiplas_denuncias:  '📢',
};

// ─────────────────────────────────────────────────────────────────
// Discord
// ─────────────────────────────────────────────────────────────────

async function enviarDiscord(embed: Record<string, unknown>): Promise<void> {
  if (!DISCORD_WEBHOOK) return;
  await fetch(DISCORD_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  }).catch(err => console.warn('[alertas-criticos] Discord falhou:', err));
}

function formatarAuditEmbed(record: Record<string, unknown>): Record<string, unknown> {
  const icone = ICONES[String(record.categoria ?? '')] ?? '📋';
  const sev   = String(record.severidade ?? 'info');
  return {
    title:       `${icone} AGORA — ${sev.toUpperCase()}`,
    description: `**${record.acao}**`,
    color:       CORES[sev] ?? CORES.info,
    fields: [
      { name: 'Categoria', value: String(record.categoria ?? '—'), inline: true },
      { name: 'Resultado', value: String(record.resultado ?? '—'), inline: true },
      { name: 'Tabela',    value: String(record.tabela   ?? '—'), inline: true },
      {
        name:   'Detalhes',
        value:  record.detalhes && Object.keys(record.detalhes as object).length > 0
          ? '```json\n' + JSON.stringify(record.detalhes, null, 2).slice(0, 500) + '\n```'
          : '—',
        inline: false,
      },
    ],
    footer:    { text: 'AGORA Security Monitor' },
    timestamp: String(record.created_at ?? new Date().toISOString()),
  };
}

function formatarAnomaliaEmbed(record: Record<string, unknown>): Record<string, unknown> {
  const tipo  = String(record.tipo ?? 'desconhecido');
  const icone = ICONES[tipo] ?? '⚠️';
  return {
    title:       `${icone} ANOMALIA — ${tipo.toUpperCase()}`,
    description: String(record.descricao ?? ''),
    color:       CORES.anomalia,
    fields: [
      { name: 'Tipo',    value: tipo,                                inline: true },
      { name: 'Usuário', value: String(record.user_id ?? 'anônimo'), inline: true },
      {
        name:   'Detalhes',
        value:  record.detalhes && Object.keys(record.detalhes as object).length > 0
          ? '```json\n' + JSON.stringify(record.detalhes, null, 2).slice(0, 400) + '\n```'
          : '—',
        inline: false,
      },
      { name: '⚡ Ação necessária', value: 'Acesse o painel de moderação.', inline: false },
    ],
    footer:    { text: 'AGORA Anomaly Detection' },
    timestamp: String(record.created_at ?? new Date().toISOString()),
  };
}

// ─────────────────────────────────────────────────────────────────
// Email de alerta crítico (via email-transacional ou Resend direto)
// ─────────────────────────────────────────────────────────────────

async function enviarEmailCritico(
  subject: string,
  html: string,
): Promise<void> {
  if (!ADMIN_EMAIL) return;

  // Tenta via email-transacional primeiro
  if (SUPABASE_URL && ALERT_SECRET) {
    try {
      const res = await fetch(`${FUNCTIONS_URL}/email-transacional`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${ALERT_SECRET}`,
        },
        body: JSON.stringify({
          tipo:  'alerta_denuncia',
          para:  ADMIN_EMAIL,
          nome:  'Administrador',
          dados: { tipo: subject, motivo: '', alvo_id: '' },
        }),
      });
      if (res.ok) return;
    } catch { /* fallback abaixo */ }
  }

  // Fallback: Resend direto
  if (!RESEND_API_KEY) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [ADMIN_EMAIL], subject, html }),
  }).catch(err => console.warn('[alertas-criticos] Resend falhou:', err));
}

// ─────────────────────────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors();

  // Valida segredo
  const authHeader = req.headers.get('authorization') ?? '';
  const source     = req.headers.get('x-webhook-source') ?? '';

  const autenticado = (ALERT_SECRET && authHeader === `Bearer ${ALERT_SECRET}`)
    || source === 'supabase';

  if (!autenticado) {
    return errorResponse('Unauthorized', 401);
  }

  let payload: { record?: Record<string, unknown>; table?: string };
  try {
    payload = await req.json();
  } catch {
    return errorResponse('JSON inválido', 400);
  }

  const { record, table } = payload;
  if (!record) return jsonResponse({ ok: true, msg: 'sem record' });

  try {
    // ── audit_log: aviso e crítico → Discord; crítico em auth/pagamento/segurança → email
    if (table === 'audit_log') {
      const sev = String(record.severidade ?? '');
      if (['aviso', 'critico'].includes(sev)) {
        await enviarDiscord(formatarAuditEmbed(record));

        if (sev === 'critico') {
          const cat = String(record.categoria ?? '');
          if (['auth', 'pagamento', 'seguranca'].includes(cat)) {
            await enviarEmailCritico(
              `🚨 Evento crítico AGORA — ${record.acao}`,
              `<p style="font-family:sans-serif">
                <strong>Ação:</strong> ${record.acao}<br>
                <strong>Categoria:</strong> ${cat}<br>
                <strong>Resultado:</strong> ${record.resultado}<br>
                <pre>${JSON.stringify(record.detalhes, null, 2)}</pre>
              </p>`,
            );
          }
        }
      }
    }

    // ── anomalia_log: sempre Discord; tipos de alto risco → email
    if (table === 'anomalia_log' && !record.resolvido) {
      await enviarDiscord(formatarAnomaliaEmbed(record));

      const TIPOS_ALTO_RISCO = ['login_falha_repetida', 'velocidade', 'multiplas_denuncias'];
      if (TIPOS_ALTO_RISCO.includes(String(record.tipo ?? ''))) {
        await enviarEmailCritico(
          `⚠️ ANOMALIA AGORA — ${record.tipo}`,
          `<p style="font-family:sans-serif">
            <strong>Tipo:</strong> ${record.tipo}<br>
            <strong>Descrição:</strong> ${record.descricao}<br>
            <strong>Usuário:</strong> ${record.user_id ?? 'anônimo'}<br>
            <pre>${JSON.stringify(record.detalhes, null, 2)}</pre>
          </p>`,
        );
      }
    }

    console.log(`[alertas-criticos] ${table} → notificações enviadas`);
    return jsonResponse({ ok: true });

  } catch (err) {
    console.error('[alertas-criticos] erro:', err);
    return errorResponse(`Erro interno: ${String(err)}`, 500);
  }
});
