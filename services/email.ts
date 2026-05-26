/**
 * services/email.ts
 * Cliente para a Edge Function email-transacional.
 *
 * Chama via supabase.functions.invoke() — o JWT do usuário logado
 * é incluído automaticamente no header Authorization.
 *
 * Para chamadas sem usuário logado (ex: demo mode), usa fetch() direto
 * com ALERT_SECRET (disponível somente em Edge Functions — aqui é no-op).
 *
 * ── Uso ────────────────────────────────────────────────────────────
 *   import { emailService } from '@/services/email';
 *
 *   await emailService.boasVindas({ para: email, nome });
 *   await emailService.eventoPendente({ usuarioId, eventoNome, local, dataInicio });
 *   await emailService.eventoAprovado({ usuarioId, eventoNome, local, dataInicio });
 *   await emailService.eventoRejeitado({ usuarioId, eventoNome, motivo });
 *   await emailService.pagamentoConfirmado({ usuarioId, planoNome, valor, validade, metodo });
 *   await emailService.alertaDenuncia({ adminEmail, tipo, motivo, alvoId });
 */

import { supabase, supabaseConfigured } from './supabase';

// ─────────────────────────────────────────────────────────────────
// Tipos de payload por método
// ─────────────────────────────────────────────────────────────────

interface BoasVindasParams {
  para:  string;  // email do novo usuário
  nome:  string;
}

interface EventoPendenteParams {
  usuarioId:   string;
  eventoNome:  string;
  local?:      string;
  dataInicio?: string;
}

interface EventoAprovadoParams {
  usuarioId:   string;
  eventoNome:  string;
  local?:      string;
  dataInicio?: string;
}

interface EventoRejeitadoParams {
  usuarioId:  string;
  eventoNome: string;
  motivo:     string;
}

interface PagamentoConfirmadoParams {
  usuarioId:  string;
  planoNome:  string;
  valor:      string;
  validade:   string;
  metodo?:    string;
  idExterno?: string;
}

interface AlertaDenunciaParams {
  adminEmail: string;
  adminNome?: string;
  tipo:       string;
  motivo:     string;
  alvoId:     string;
}

interface NovaMensagemParams {
  usuarioId:     string;
  remetenteNome: string;
  preview:       string;
}

interface SenhaRedefinidaParams {
  para:  string;   // email do usuário
  nome:  string;
}

// ─────────────────────────────────────────────────────────────────
// Utilitário: invoca a Edge Function
// ─────────────────────────────────────────────────────────────────

interface InvokeOptions {
  tipo:        string;
  para?:       string;
  usuario_id?: string;
  nome?:       string;
  dados?:      Record<string, string>;
  idempotency_key?: string;
}

async function invocar(opts: InvokeOptions): Promise<void> {
  // Demo mode: apenas loga — não quebra nenhum fluxo
  if (!supabaseConfigured) {
    console.log(
      `[email:demo] tipo=${opts.tipo}`,
      opts.para ?? opts.usuario_id,
      opts.dados,
    );
    return;
  }

  try {
    const { error } = await supabase.functions.invoke('email-transacional', {
      body: opts,
    });

    if (error) {
      // Falhas de email nunca devem travar o fluxo principal
      console.warn(`[email] Falha silenciosa ao enviar "${opts.tipo}":`, error.message);
    }
  } catch (err) {
    console.warn(`[email] Exceção silenciosa ao enviar "${opts.tipo}":`, err);
  }
}

// ─────────────────────────────────────────────────────────────────
// Formatação de data para exibição
// ─────────────────────────────────────────────────────────────────

function fmtData(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ─────────────────────────────────────────────────────────────────
// API pública do serviço
// ─────────────────────────────────────────────────────────────────

export const emailService = {

  /**
   * Dispara email de boas-vindas após cadastro.
   * Chamado em: services/auth.ts → register()
   */
  async boasVindas({ para, nome }: BoasVindasParams): Promise<void> {
    await invocar({ tipo: 'boas_vindas', para, nome });
  },

  /**
   * Confirma recebimento de evento PJ para análise.
   * Chamado em: services/eventos.ts → criar() quando comercial=true
   */
  async eventoPendente({ usuarioId, eventoNome, local, dataInicio }: EventoPendenteParams): Promise<void> {
    await invocar({
      tipo:       'evento_pendente',
      usuario_id: usuarioId,
      dados: {
        evento_nome: eventoNome,
        local:       local ?? '',
        data_inicio: fmtData(dataInicio),
      },
      idempotency_key: `pendente-${usuarioId}-${eventoNome.slice(0, 20)}`,
    });
  },

  /**
   * Notifica criador que o evento foi aprovado pelo moderador.
   * Chamado em: services/moderacao.ts → notificarCriador('aprovado')
   */
  async eventoAprovado({ usuarioId, eventoNome, local, dataInicio }: EventoAprovadoParams): Promise<void> {
    await invocar({
      tipo:       'evento_aprovado',
      usuario_id: usuarioId,
      dados: {
        evento_nome: eventoNome,
        local:       local ?? '',
        data_inicio: fmtData(dataInicio),
      },
      idempotency_key: `aprovado-${usuarioId}-${eventoNome.slice(0, 20)}`,
    });
  },

  /**
   * Notifica criador sobre rejeição do evento com o motivo.
   * Chamado em: services/moderacao.ts → notificarCriador('rejeitado')
   */
  async eventoRejeitado({ usuarioId, eventoNome, motivo }: EventoRejeitadoParams): Promise<void> {
    await invocar({
      tipo:       'evento_rejeitado',
      usuario_id: usuarioId,
      dados: {
        evento_nome: eventoNome,
        motivo,
      },
      idempotency_key: `rejeitado-${usuarioId}-${eventoNome.slice(0, 20)}`,
    });
  },

  /**
   * Envia recibo de pagamento confirmado.
   * Chamado em: services/pagamentos.ts → confirmarPagamento() e Asaas webhook
   */
  async pagamentoConfirmado({
    usuarioId, planoNome, valor, validade, metodo, idExterno,
  }: PagamentoConfirmadoParams): Promise<void> {
    await invocar({
      tipo:       'pagamento_confirmado',
      usuario_id: usuarioId,
      dados: {
        plano_nome:  planoNome,
        valor,
        validade,
        metodo:      metodo ?? '',
        id_externo:  idExterno ?? '',
      },
      idempotency_key: `pag-${idExterno ?? usuarioId}-${Date.now()}`,
    });
  },

  /**
   * Alerta email de admin sobre denúncia crítica.
   * Chamado em: services/denuncias.ts → criar() para denúncias de usuário
   */
  async alertaDenuncia({ adminEmail, adminNome, tipo, motivo, alvoId }: AlertaDenunciaParams): Promise<void> {
    await invocar({
      tipo: 'alerta_denuncia',
      para: adminEmail,
      nome: adminNome ?? 'Administrador',
      dados: { tipo, motivo, alvo_id: alvoId },
    });
  },

  /**
   * Notificação de nova mensagem não lida por email.
   * Chamado em: services/chat.ts → enviarMensagem() com throttle
   */
  async novaMensagem({ usuarioId, remetenteNome, preview }: NovaMensagemParams): Promise<void> {
    await invocar({
      tipo:       'nova_mensagem',
      usuario_id: usuarioId,
      dados: {
        remetente_nome: remetenteNome,
        preview:        preview.slice(0, 120),
      },
      idempotency_key: `msg-${usuarioId}-${Date.now()}`,
    });
  },

  /**
   * Confirmação de que a senha foi redefinida com sucesso.
   * Chamado em: services/auth.ts → atualizarSenha() após updateUser()
   * Serve como alerta de segurança: usuário sabe que a senha foi alterada.
   */
  async senhaRedefinida({ para, nome }: SenhaRedefinidaParams): Promise<void> {
    await invocar({
      tipo: 'senha_redefinida',
      para,
      nome,
      idempotency_key: `senha-${para}-${Date.now()}`,
    });
  },

  /**
   * Envia código 2FA por e-mail para admins.
   * Chamado em: services/doisFA.ts → gerarCodigo()
   */
  async codigoAdmin2FA({ para, nome, codigo }: { para: string; nome: string; codigo: string }): Promise<void> {
    await invocar({
      tipo: 'codigo_2fa',
      para,
      nome,
      dados: { codigo },
      idempotency_key: `2fa-${para}-${Date.now()}`,
    });
  },
};
