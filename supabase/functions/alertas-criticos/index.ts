// Edge Function: alertas-criticos
// Recebe webhook do Supabase quando audit_log ou anomalia_log recebe registro crítico
// Envia alerta para Discord/Slack em tempo real
//
// Deploy: supabase functions deploy alertas-criticos
// Env vars necessárias:
//   DISCORD_WEBHOOK_URL — URL do webhook do canal #alertas-agora
//   ALERT_SECRET        — token para validar que a chamada veio do Supabase

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const DISCORD_WEBHOOK = Deno.env.get('DISCORD_WEBHOOK_URL');
const ALERT_SECRET    = Deno.env.get('ALERT_SECRET') ?? '';

// ─────────────────────────────────────────────
// Cores Discord por severidade
// ─────────────────────────────────────────────
const CORES: Record<string, number> = {
  critico: 0xFF0000, // vermelho
  aviso:   0xFF8800, // laranja
  info:    0x0099FF, // azul
  anomalia:0xFF4444, // vermelho escuro
};

// ─────────────────────────────────────────────
// Ícones por categoria/tipo
// ─────────────────────────────────────────────
const ICONES: Record<string, string> = {
  auth:      '🔐',
  evento:    '📅',
  moderacao: '⚖️',
  pagamento: '💳',
  denuncia:  '🚨',
  admin:     '👤',
  seguranca: '🛡️',
  anomalia:  '⚠️',
  velocidade:'⚡',
  login_falha_repetida: '🔑',
  conteudo_suspeito:    '🚫',
  multiplas_denuncias:  '📢',
};

async function enviarDiscord(embed: object): Promise<void> {
  if (!DISCORD_WEBHOOK) {
    console.warn('[alertas] DISCORD_WEBHOOK_URL não configurado');
    return;
  }
  await fetch(DISCORD_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });
}

// ─────────────────────────────────────────────
// Formata alerta de audit_log
// ─────────────────────────────────────────────
function formatarAuditEmbed(record: any) {
  const icone = ICONES[record.categoria] ?? '📋';
  const cor   = CORES[record.severidade] ?? CORES.info;

  return {
    title: `${icone} AGORA — ${record.severidade.toUpperCase()}`,
    description: `**${record.acao}**`,
    color: cor,
    fields: [
      { name: 'Categoria',  value: record.categoria,          inline: true },
      { name: 'Resultado',  value: record.resultado,          inline: true },
      { name: 'Tabela',     value: record.tabela ?? '—',      inline: true },
      {
        name: 'Detalhes',
        value: record.detalhes && Object.keys(record.detalhes).length > 0
          ? '```json\n' + JSON.stringify(record.detalhes, null, 2).substring(0, 500) + '\n```'
          : '—',
        inline: false,
      },
    ],
    footer: { text: 'AGORA Security Monitor' },
    timestamp: record.created_at ?? new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────
// Formata alerta de anomalia_log
// ─────────────────────────────────────────────
function formatarAnomaliaEmbed(record: any) {
  const icone = ICONES[record.tipo] ?? '⚠️';

  return {
    title: `${icone} ANOMALIA DETECTADA — ${record.tipo.toUpperCase()}`,
    description: record.descricao,
    color: CORES.anomalia,
    fields: [
      { name: 'Tipo',      value: record.tipo,            inline: true },
      { name: 'Usuário',   value: record.user_id ?? 'anônimo', inline: true },
      {
        name: 'Detalhes',
        value: record.detalhes && Object.keys(record.detalhes).length > 0
          ? '```json\n' + JSON.stringify(record.detalhes, null, 2).substring(0, 400) + '\n```'
          : '—',
        inline: false,
      },
      {
        name: '⚡ Ação necessária',
        value: 'Acesse o painel de moderação para resolver esta anomalia.',
        inline: false,
      },
    ],
    footer: { text: 'AGORA Anomaly Detection' },
    timestamp: record.created_at ?? new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────
serve(async (req) => {
  // Valida segredo se configurado
  const authHeader = req.headers.get('authorization') ?? '';
  if (ALERT_SECRET && authHeader !== `Bearer ${ALERT_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const payload = await req.json();
    const { record, table } = payload;

    if (!record) {
      return new Response('ok — sem record', { status: 200 });
    }

    // ── Alertas de audit_log (apenas aviso e crítico)
    if (table === 'audit_log') {
      if (['aviso', 'critico'].includes(record.severidade)) {
        await enviarDiscord(formatarAuditEmbed(record));
      }
    }

    // ── Alertas de anomalia_log (sempre alerta)
    if (table === 'anomalia_log' && !record.resolvido) {
      await enviarDiscord(formatarAnomaliaEmbed(record));
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[alertas-criticos] erro:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
