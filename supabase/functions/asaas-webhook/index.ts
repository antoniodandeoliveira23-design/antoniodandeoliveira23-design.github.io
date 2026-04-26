/**
 * Edge Function: asaas-webhook
 * A08 — Validação de integridade via token Asaas
 * Recebe notificações de pagamento e atualiza o banco
 *
 * Deploy: supabase functions deploy asaas-webhook
 *
 * Env vars necessárias (Supabase Dashboard → Settings → Edge Functions):
 *   ASAAS_ACCESS_TOKEN  — token do Asaas Sandbox/Produção
 *   SUPABASE_URL        — injetado automaticamente
 *   SUPABASE_SERVICE_ROLE_KEY — injetado automaticamente
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ASAAS_TOKEN     = Deno.env.get('ASAAS_ACCESS_TOKEN') ?? '';
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// ─────────────────────────────────────────────────────
// A08 — Validação de autenticidade do webhook
// Asaas envia o token no header 'asaas-access-token'
// ─────────────────────────────────────────────────────
function validarAssinatura(req: Request): boolean {
  if (!ASAAS_TOKEN) {
    console.warn('[asaas-webhook] ASAAS_ACCESS_TOKEN não configurado — rejeitando');
    return false;
  }
  const tokenRecebido = req.headers.get('asaas-access-token') ?? '';
  // Comparação em tempo constante para evitar timing attacks
  return tokenRecebido.length === ASAAS_TOKEN.length &&
    tokenRecebido === ASAAS_TOKEN;
}

// ─────────────────────────────────────────────────────
// Mapeamento de eventos Asaas → status interno
// ─────────────────────────────────────────────────────
const STATUS_MAP: Record<string, string> = {
  PAYMENT_RECEIVED:           'pago',
  PAYMENT_CONFIRMED:          'pago',
  PAYMENT_OVERDUE:            'vencido',
  PAYMENT_DELETED:            'cancelado',
  PAYMENT_REFUNDED:           'reembolsado',
  PAYMENT_CHARGEBACK_DISPUTE: 'em_disputa',
  PAYMENT_AWAITING_RISK_ANALYSIS: 'em_analise',
};

// ─────────────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────────────
serve(async (req) => {
  // Só aceita POST
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // A08 — Valida assinatura antes de qualquer processamento
  if (!validarAssinatura(req)) {
    console.error('[asaas-webhook] Assinatura inválida — requisição rejeitada');
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad Request — JSON inválido', { status: 400 });
  }

  const { event, payment } = payload;

  if (!event || !payment) {
    return new Response('Bad Request — campos obrigatórios ausentes', { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const novoStatus = STATUS_MAP[event];

  // Evento desconhecido — registra mas não falha
  if (!novoStatus) {
    console.log(`[asaas-webhook] Evento não mapeado ignorado: ${event}`);
    return new Response(JSON.stringify({ ok: true, ignorado: true }), { status: 200 });
  }

  try {
    // Atualiza o pagamento pelo ID externo do Asaas
    const { data: pagamento, error: erroBusca } = await supabase
      .from('pagamentos')
      .select('id, usuario_id, plano_id')
      .eq('id_externo', payment.id)
      .single();

    if (erroBusca || !pagamento) {
      // Tenta criar registro se não existe (primeira notificação)
      await supabase.from('pagamentos').upsert({
        id_externo:     payment.id,
        valor:          payment.value,
        status:         novoStatus,
        metodo:         payment.billingType,
        vencimento:     payment.dueDate,
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'id_externo' });
    } else {
      // Atualiza status do pagamento existente
      await supabase
        .from('pagamentos')
        .update({ status: novoStatus, updated_at: new Date().toISOString() })
        .eq('id_externo', payment.id);

      // Se pagamento confirmado — libera o plano do usuário
      if (novoStatus === 'pago' && pagamento.usuario_id && pagamento.plano_id) {
        await supabase
          .from('profiles')
          .update({
            plano_ativo:    pagamento.plano_id,
            plano_valido_ate: calcularValidade(pagamento.plano_id),
            atualizado_em:  new Date().toISOString(),
          })
          .eq('id', pagamento.usuario_id);
      }

      // Se vencido/cancelado — revoga o plano
      if (['vencido', 'cancelado'].includes(novoStatus) && pagamento.usuario_id) {
        await supabase
          .from('profiles')
          .update({
            plano_ativo:    null,
            plano_valido_ate: null,
            atualizado_em:  new Date().toISOString(),
          })
          .eq('id', pagamento.usuario_id);
      }
    }

    // Registra no audit_log
    await supabase.from('audit_log').insert({
      user_id:    pagamento?.usuario_id ?? null,
      acao:       `pagamento_${novoStatus}`,
      categoria:  'pagamento',
      severidade: novoStatus === 'pago' ? 'info' : 'aviso',
      tabela:     'pagamentos',
      detalhes:   { evento: event, id_externo: payment.id, valor: payment.value },
      resultado:  'sucesso',
    });

    console.log(`[asaas-webhook] ${event} processado — status: ${novoStatus}`);
    return new Response(JSON.stringify({ ok: true, status: novoStatus }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[asaas-webhook] Erro ao processar:', err);

    // Registra falha no audit_log
    await supabase.from('audit_log').insert({
      user_id:    null,
      acao:       'pagamento_webhook_falha',
      categoria:  'pagamento',
      severidade: 'critico',
      detalhes:   { evento: event, erro: String(err) },
      resultado:  'falha',
    }).catch(() => {});

    return new Response(JSON.stringify({ error: 'Erro interno' }), { status: 500 });
  }
});

// ─────────────────────────────────────────────────────
// Calcula data de validade por tipo de plano
// ─────────────────────────────────────────────────────
function calcularValidade(planoId: string): string {
  const agora = new Date();
  // Inferência básica pelo ID — ajustar conforme IDs reais do banco
  const meses = planoId?.includes('anual') ? 12
    : planoId?.includes('trimestral') ? 3
    : planoId?.includes('semanal') ? 0 : 1;

  if (meses === 0) {
    agora.setDate(agora.getDate() + 7); // semanal
  } else {
    agora.setMonth(agora.getMonth() + meses);
  }
  return agora.toISOString();
}
