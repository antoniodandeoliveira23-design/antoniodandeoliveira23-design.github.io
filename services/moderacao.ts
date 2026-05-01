import { supabase, supabaseConfigured } from './supabase';
import type { Evento } from '@/types';
import { _demoPendentes } from './eventos';
import { registrarAcao } from './auditoria';
import { emailService } from './email';

// ─────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────

export interface RespostaPaginadaPendentes {
  dados: Evento[];
  total: number;
  pagina: number;
  porPagina: number;
  temMais: boolean;
}

/**
 * R4 — Moderação de eventos comerciais.
 * Eventos PJ entram com status='pendente' e só ficam 'aprovado' após admin revisar.
 */
export const moderacaoService = {

  // ── LISTAR PENDENTES com paginação ────────────────────
  async listarPendentes(
    pagina = 1,
    porPagina = 10,
  ): Promise<RespostaPaginadaPendentes> {
    const offset = (pagina - 1) * porPagina;

    if (!supabaseConfigured) {
      const todos = [..._demoPendentes];
      const total = todos.length;
      return {
        dados: todos.slice(offset, offset + porPagina),
        total,
        pagina,
        porPagina,
        temMais: offset + porPagina < total,
      };
    }

    const { data, error, count } = await supabase
      .from('eventos')
      .select('*, criador:profiles(*)', { count: 'exact' })
      .eq('status', 'pendente')
      .order('criado_em', { ascending: false })
      .range(offset, offset + porPagina - 1);

    if (error) throw new Error(error.message);

    const total = count ?? 0;
    return {
      dados: data || [],
      total,
      pagina,
      porPagina,
      temMais: offset + porPagina < total,
    };
  },

  // ── APROVAR ────────────────────────────────────────────
  async aprovar(eventoId: string): Promise<void> {
    if (!supabaseConfigured) {
      const idx = _demoPendentes.findIndex((e) => e.id === eventoId);
      if (idx >= 0) {
        _demoPendentes[idx].status = 'aprovado';
        _demoPendentes.splice(idx, 1);
      }
      return;
    }

    const { error } = await supabase
      .from('eventos')
      .update({ status: 'aprovado' })
      .eq('id', eventoId);

    if (error) {
      await registrarAcao({
        acao: 'evento_aprovacao_falha',
        categoria: 'moderacao',
        severidade: 'aviso',
        tabela: 'eventos',
        registroId: eventoId,
        detalhes: { motivo: error.message },
        resultado: 'falha',
      });
      throw new Error(error.message);
    }

    await registrarAcao({
      acao: 'evento_aprovado',
      categoria: 'moderacao',
      severidade: 'info',
      tabela: 'eventos',
      registroId: eventoId,
      resultado: 'sucesso',
    });
  },

  // ── REJEITAR ───────────────────────────────────────────
  async rejeitar(eventoId: string, motivo: string): Promise<void> {
    if (!supabaseConfigured) {
      const idx = _demoPendentes.findIndex((e) => e.id === eventoId);
      if (idx >= 0) {
        _demoPendentes[idx].status = 'rejeitado';
        _demoPendentes.splice(idx, 1);
      }
      return;
    }

    const { error } = await supabase
      .from('eventos')
      .update({ status: 'rejeitado', motivo_rejeicao: motivo } as any)
      .eq('id', eventoId);

    if (error) {
      await registrarAcao({
        acao: 'evento_rejeicao_falha',
        categoria: 'moderacao',
        severidade: 'aviso',
        tabela: 'eventos',
        registroId: eventoId,
        detalhes: { motivo: error.message },
        resultado: 'falha',
      });
      throw new Error(error.message);
    }

    await registrarAcao({
      acao: 'evento_rejeitado',
      categoria: 'moderacao',
      severidade: 'aviso',
      tabela: 'eventos',
      registroId: eventoId,
      detalhes: { motivo_rejeicao: motivo },
      resultado: 'sucesso',
    });
  },

  // ── NOTIFICAR CRIADOR via email (aprovação / rejeição) ────
  async notificarCriador(
    eventoId: string,
    tipo: 'aprovado' | 'rejeitado',
    motivo?: string,
  ): Promise<void> {
    if (!supabaseConfigured) {
      console.log(`[demo] Email de ${tipo} para criador do evento ${eventoId}`);
      return;
    }

    try {
      const { data: evento } = await supabase
        .from('eventos')
        .select('criador_id, nome, local, data_inicio')
        .eq('id', eventoId)
        .single();

      if (!evento?.criador_id) return;

      if (tipo === 'aprovado') {
        // ── Fire-and-forget: email de aprovação ─────────────
        emailService.eventoAprovado({
          usuarioId:   evento.criador_id,
          eventoNome:  evento.nome,
          local:       evento.local,
          dataInicio:  evento.data_inicio,
        });
      } else {
        // ── Fire-and-forget: email de rejeição ──────────────
        emailService.eventoRejeitado({
          usuarioId:  evento.criador_id,
          eventoNome: evento.nome,
          motivo:     motivo || 'Não informado. Entre em contato com o suporte.',
        });
      }

      await registrarAcao({
        acao: `email_${tipo}_enviado`,
        categoria: 'moderacao',
        severidade: 'info',
        tabela: 'eventos',
        registroId: eventoId,
        detalhes: { criador_id: evento.criador_id, tipo },
        resultado: 'sucesso',
      });
    } catch (err) {
      // Notificação nunca deve quebrar o fluxo de moderação
      console.warn('[moderacao] notificarCriador falhou:', err);
    }
  },
};
