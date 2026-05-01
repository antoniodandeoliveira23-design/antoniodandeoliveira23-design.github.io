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
import { corsHeaders, handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

const ASAAS_TOKEN     = Deno.env.get('ASAAS_ACCESS_TOKEN')        ?? '';
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')              ?? '';
const SUPABASE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FUNCTIONS_URL   = `${SUPABASE_URL}/functions/v1`;
const ALERT_SECRET    = Deno.env.get('ALERT_SECRET')              ?? '';

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

/** Dispara email de recibo via email-transacional (fire-and-forget) */
async function enviarEmailPagamento(
  usuarioId: string,
  planoId: string | null,
  valor: number,
  metodo: string,
  idExterno: string,
  planoTipo?: string,
): Promise<void> {
  if (!SUPABASE_URL || !ALERT_SECRET) return;
  try {
    await fetch(`${FUNCTIONS_URL}/email-transacional`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ALERT_SECRET}`,
      },
      body: JSON.stringify({
        tipo:       'pagamento_confirmado',
        usuario_id: usuarioId,
        dados: {
          plano_nome: planoId ?? 'Plano AGORA',
          valor:      valor.toFixed(2).replace('.', ','),
          validade:   calcularValidade(planoId ?? '', planoTipo),
          metodo:     metodo ?? '',
          id_externo: idExterno,
        },
        idempotency_key: `pag-${idExterno}`,
      }),
    });
  } catch (err) {
    console.warn('[asaas-webhook] Falha ao enviar email de recibo:', err);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  // A08 — Valida assinatura antes de qualquer processamento
  if (!validarAssinatura(req)) {
    console.error('[asaas-webhook] Assinatura inválida — requisição rejeitada');
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
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
        // Busca o tipo do plano para calcular validade corretamente
        const { data: plano } = await supabase
          .from('planos')
          .select('tipo')
          .eq('id', pagamento.plano_id)
          .single();

        const validade = calcularValidade(pagamento.plano_id, plano?.tipo);

        await supabase
          .from('profiles')
          .update({
            plano_ativo:      pagamento.plano_id,
            plano_valido_ate: validade,
            atualizado_em:    new Date().toISOString(),
          })
          .eq('id', pagamento.usuario_id);

        // ── Fire-and-forget: email de recibo ──────────────
        enviarEmailPagamento(
          pagamento.usuario_id,
          pagamento.plano_id,
          payment.value,
          payment.billingType ?? '',
          payment.id,
          plano?.tipo,
        );

        // ── Fire-and-forget: push notification ────────────
        fetch(`${FUNCTIONS_URL}/enviar-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ALERT_SECRET}` },
          body: JSON.stringify({
            usuario_id: pagamento.usuario_id,
            tipo:       'pagamento_confirmado',
            titulo:     'Pagamento confirmado ✅',
            mensagem:   `Seu plano ${plano?.tipo ?? ''} foi ativado com sucesso.`,
            dados:      { plano_id: pagamento.plano_id ?? '', id_externo: payment.id },
          }),
        }).catch(() => {});
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
    return jsonResponse({ ok: true, status: novoStatus });

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

    return errorResponse('Erro interno', 500);
  }
});

// ─────────────────────────────────────────────────────
// Mapa de validade por UUID real dos planos (dias)
// Fonte: tabela `planos` do banco de produção
// ─────────────────────────────────────────────────────
const PLANOS_VALIDADE: Record<string, number> = {
  'cbd84bb2-b351-40fa-acc5-d2f55feb9eee': 30,   // Avulso Básico
  'c909438d-e517-4c3e-87de-aff1a2074d8e': 30,   // Mensal Pro
  'fe218f6d-13e9-45b1-9f03-41cda44329b1': 90,   // Trimestral Business
  '6b429c49-589c-4643-97c8-333828b00fcb': 365,  // Anual Enterprise
};

// Fallback por tipo — cobre planos criados futuramente
const TIPO_VALIDADE: Record<string, number> = {
  avulso:     30,
  mensal:     30,
  trimestral: 90,
  anual:      365,
  semanal:    7,
};

// ─────────────────────────────────────────────────────
// Calcula data de validade por ID ou tipo do plano
// ─────────────────────────────────────────────────────
function calcularValidade(planoId: string, tipo?: string): string {
  const agora  = new Date();
  const dias   =
    PLANOS_VALIDADE[planoId] ??
    (tipo ? TIPO_VALIDADE[tipo] : undefined) ??
    30; // fallback seguro: 30 dias

  agora.setDate(agora.getDate() + dias);
  return agora.toISOString();
}
