import { supabase, supabaseConfigured } from './supabase';
import type { Evento } from '@/types';
import { _demoPendentes } from './eventos';

/**
 * R4 - Moderação de eventos comerciais.
 * Eventos PJ entram com status='pendente' e só ficam 'aprovado' após admin revisar.
 */
export const moderacaoService = {
  async listarPendentes(): Promise<Evento[]> {
    if (!supabaseConfigured) {
      return [..._demoPendentes];
    }

    const { data, error } = await supabase
      .from('eventos')
      .select('*, criador:profiles(*)')
      .eq('status', 'pendente')
      .order('criado_em', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

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
    if (error) throw new Error(error.message);
  },

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
    if (error) throw new Error(error.message);
  },
};
