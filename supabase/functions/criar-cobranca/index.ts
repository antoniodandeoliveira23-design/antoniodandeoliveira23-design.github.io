/**
 * Edge Function: criar-cobranca
 * Cria uma cobrança no Asaas e registra o pagamento no banco.
 *
 * Fluxo:
 *  1. Valida JWT do usuário
 *  2. Busca dados do plano e do usuário
 *  3. Cria ou reutiliza cliente no Asaas
 *  4. Cria cobrança PIX/Boleto no Asaas
 *  5. Salva pagamento com id_externo no banco
 *  6. Retorna link de pagamento ao frontend
 *
 * Env vars:
 *   ASAAS_ACCESS_TOKEN        — token Asaas sandbox ou produção
 *   ASAAS_ENV                 — "sandbox" | "production"
 *   SUPABASE_URL              — injetado automaticamente
 *   SUPABASE_SERVICE_ROLE_KEY — injetado automaticamente
 *   ALERT_SECRET              — para chamadas internas
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { validarAuth, buscarEmailUsuario } from '../_shared/auth.ts';

// ─────────────────────────────────────────────────────────────────
// Configuração
// ─────────────────────────────────────────────────────────────────

const ASAAS_TOKEN   = Deno.env.get('ASAAS_ACCESS_TOKEN') ?? '';
const ASAAS_ENV     = Deno.env.get('ASAAS_ENV')          ?? 'sandbox';
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')        ?? '';
const SUPABASE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const ASAAS_BASE = ASAAS_ENV === 'production'
  ? 'https://api.asaas.com/api/v3'
  : 'https://sandbox.asaas.com/api/v3';

// ─────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────

interface CriarCobrancaPayload {
  plano_id: string;
  metodo?:  'PIX' | 'BOLETO' | 'CREDIT_CARD'; // padrão: PIX
}

// ─────────────────────────────────────────────────────────────────
// Asaas API helpers
// ─────────────────────────────────────────────────────────────────

export async function asaasRequest(path: string, method: string, body?: unknown) {
  if (!ASAAS_TOKEN) throw new Error('ASAAS_ACCESS_TOKEN não configurado');

  const resp = await fetch(`${ASAAS_BASE}${path}`, {
    method,
    headers: {
      'Content-Type':  'application/json',
      'access_token':  ASAAS_TOKEN,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await resp.json();

  if (!resp.ok) {
    const msg = data?.errors?.[0]?.description ?? data?.message ?? `Asaas ${resp.status}`;
    throw new Error(msg);
  }

  return data;
}

/** Busca cliente Asaas por email — retorna ID ou null */
export async function buscarClienteAsaas(email: string): Promise<string | null> {
  const data = await asaasRequest(`/customers?email=${encodeURIComponent(email)}&limit=1`, 'GET');
  return data?.data?.[0]?.id ?? null;
}

/** Cria cliente no Asaas */
export async function criarClienteAsaas(params: {
  nome:  string;
  email: string;
  cnpj?: string;
  fone?: string;
}): Promise<string> {
  const body: Record<string, string> = {
    name:  params.nome,
    email: params.email,
  };
  if (params.cnpj) body.cnpjCpf = params.cnpj.replace(/\D/g, '');
  if (params.fone) body.mobilePhone = params.fone.replace(/\D/g, '');

  const data = await asaasRequest('/customers', 'POST', body);
  return data.id;
}

/** Data de vencimento: amanhã */
export function dataVencimento(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────────────────────────

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'POST')   return errorResponse('Method Not Allowed', 405);

  // ── Auth: apenas usuários autenticados ────────────────────────
  const auth = await validarAuth(req);
  if (!auth.ok || auth.tipo !== 'usuario') {
    return errorResponse('Autenticação necessária', 401);
  }

  const userId = auth.userId;

  // ── Parse payload ─────────────────────────────────────────────
  let payload: CriarCobrancaPayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('JSON inválido', 400);
  }

  const { plano_id, metodo = 'PIX' } = payload;
  if (!plano_id) return errorResponse('"plano_id" é obrigatório', 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    // ── Busca plano ───────────────────────────────────────────────
    const { data: plano, error: errPlano } = await supabase
      .from('planos')
      .select('id, nome, preco, tipo')
      .eq('id', plano_id)
      .single();

    if (errPlano || !plano) return errorResponse('Plano não encontrado', 404);

    // ── Busca dados do usuário ────────────────────────────────────
    const [emailUsuario, { data: profile }, { data: pessoa }] = await Promise.all([
      buscarEmailUsuario(userId),
      supabase.from('profiles').select('nome, sobrenome, cnpj, asaas_customer_id').eq('id', userId).single(),
      supabase.from('pessoa').select('nome, telefone, email').eq('auth_user_id', userId).single(),
    ]);

    if (!emailUsuario) return errorResponse('Email do usuário não encontrado', 404);

    const nomeCompleto = [
      profile?.nome ?? pessoa?.nome ?? '',
      profile?.sobrenome ?? '',
    ].filter(Boolean).join(' ') || 'Usuário AGORA';

    const fone = pessoa?.telefone ?? undefined;
    const cnpj = profile?.cnpj    ?? undefined;

    // ── Obtém ou cria cliente no Asaas ────────────────────────────
    let asaasCustomerId: string = profile?.asaas_customer_id ?? '';

    if (!asaasCustomerId) {
      // Tenta buscar por email antes de criar
      const clienteExistente = await buscarClienteAsaas(emailUsuario);

      if (clienteExistente) {
        asaasCustomerId = clienteExistente;
      } else {
        asaasCustomerId = await criarClienteAsaas({
          nome:  nomeCompleto,
          email: emailUsuario,
          cnpj,
          fone,
        });
      }

      // Persiste asaas_customer_id para próximas compras
      await supabase
        .from('profiles')
        .update({ asaas_customer_id: asaasCustomerId })
        .eq('id', userId);
    }

    // ── Cria cobrança no Asaas ────────────────────────────────────
    const cobranca = await asaasRequest('/payments', 'POST', {
      customer:    asaasCustomerId,
      billingType: metodo,
      value:       Number(plano.preco),
      dueDate:     dataVencimento(),
      description: `${plano.nome} — AGORA Vilhena`,
      externalReference: userId,
    });

    // ── Salva pagamento no banco ──────────────────────────────────
    const { data: pagamento, error: errPag } = await supabase
      .from('pagamentos')
      .insert({
        usuario_id:  userId,
        plano_id:    plano.id,
        valor:       plano.preco,
        moeda:       'BRL',
        status:      'pendente',
        metodo,
        id_externo:  cobranca.id,
        vencimento:  dataVencimento(),
        criado_em:   new Date().toISOString(),
      })
      .select('id')
      .single();

    if (errPag) throw new Error(`Erro ao salvar pagamento: ${errPag.message}`);

    console.log(`[criar-cobranca] Cobrança criada — Asaas: ${cobranca.id} | Pagamento: ${pagamento.id}`);

    // ── Retorna link de pagamento ─────────────────────────────────
    return jsonResponse({
      ok:           true,
      pagamento_id: pagamento.id,
      asaas_id:     cobranca.id,
      link:         cobranca.invoiceUrl   ?? cobranca.bankSlipUrl ?? null,
      pix_copia_cola: cobranca.pixTransaction?.payload ?? null,
      valor:        plano.preco,
      vencimento:   dataVencimento(),
      status:       'pendente',
    });

  } catch (err) {
    console.error('[criar-cobranca] Erro:', err);
    return errorResponse(`Erro ao criar cobrança: ${String(err)}`, 502);
  }
}

if (!Deno.env.get('DENO_TESTING')) { serve(handler); }
