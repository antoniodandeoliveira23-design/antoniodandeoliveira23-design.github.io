/**
 * services/inscricoes.ts
 *
 * CRUD de inscrições em eventos.
 * Persiste no banco, mantém total_inscritos atualizado via trigger,
 * e dispara push notification de confirmação.
 */

import { supabase, supabaseConfigured } from './supabase';

// ── Tipos ──────────────────────────────────────────────────────────

export interface Inscricao {
  id: string;
  usuario_id: string;
  evento_id: string;
  status: 'confirmada' | 'cancelada' | 'lista_espera';
  criado_em: string;
  atualizado_em: string;
}

export interface InscricaoComEvento extends Inscricao {
  eventos: {
    id: string;
    nome: string;
    local: string;
    data_inicio: string;
    imagem_url: string | null;
    categoria: string;
  };
}

// ── Demo fallback ──────────────────────────────────────────────────

const _demoInscritos = new Set<string>();

// ── Service ───────────────────────────────────────────────────────

export const inscricoesService = {

  /**
   * Inscreve o usuário em um evento.
   * Usa upsert para evitar duplicatas (idempotente).
   */
  async inscrever(eventoId: string, usuarioId: string): Promise<void> {
    if (!supabaseConfigured) {
      _demoInscritos.add(eventoId);
      return;
    }

    const { error } = await supabase
      .from('inscricoes')
      .upsert(
        { usuario_id: usuarioId, evento_id: eventoId, status: 'confirmada' },
        { onConflict: 'usuario_id,evento_id' }
      );

    if (error) throw new Error(error.message);

    // Push notification de confirmação (fire-and-forget)
    supabase.functions.invoke('enviar-push', {
      body: {
        usuario_id: usuarioId,
        tipo:       'inscricao_confirmada',
        titulo:     'Inscrição confirmada! 🎟️',
        mensagem:   'Você está inscrito. Fique atento às atualizações do evento.',
        dados:      { evento_id: eventoId },
      },
    }).catch(() => {});
  },

  /**
   * Cancela a inscrição do usuário em um evento.
   */
  async cancelar(eventoId: string, usuarioId: string): Promise<void> {
    if (!supabaseConfigured) {
      _demoInscritos.delete(eventoId);
      return;
    }

    const { error } = await supabase
      .from('inscricoes')
      .update({ status: 'cancelada' })
      .eq('usuario_id', usuarioId)
      .eq('evento_id', eventoId);

    if (error) throw new Error(error.message);
  },

  /**
   * Retorna Set com os IDs de eventos em que o usuário está inscrito.
   * Usado para inicializar o estado na HomeScreen.
   */
  async listarIds(usuarioId: string): Promise<Set<string>> {
    if (!supabaseConfigured) return new Set(_demoInscritos);

    const { data, error } = await supabase
      .from('inscricoes')
      .select('evento_id')
      .eq('usuario_id', usuarioId)
      .eq('status', 'confirmada');

    if (error) {
      console.warn('[inscricoes] Erro ao listar IDs:', error.message);
      return new Set();
    }

    return new Set((data ?? []).map((r: { evento_id: string }) => r.evento_id));
  },

  /**
   * Verifica se o usuário está inscrito em um evento específico.
   */
  async estaInscrito(eventoId: string, usuarioId: string): Promise<boolean> {
    if (!supabaseConfigured) return _demoInscritos.has(eventoId);

    const { count } = await supabase
      .from('inscricoes')
      .select('*', { count: 'exact', head: true })
      .eq('usuario_id', usuarioId)
      .eq('evento_id', eventoId)
      .eq('status', 'confirmada');

    return (count ?? 0) > 0;
  },

  /**
   * Lista inscrições completas do usuário com dados do evento.
   */
  async listarComEvento(usuarioId: string): Promise<InscricaoComEvento[]> {
    if (!supabaseConfigured) return [];

    const { data, error } = await supabase
      .from('inscricoes')
      .select(`
        *,
        eventos (
          id, nome, local, data_inicio, imagem_url, categoria
        )
      `)
      .eq('usuario_id', usuarioId)
      .eq('status', 'confirmada')
      .order('criado_em', { ascending: false });

    if (error) {
      console.warn('[inscricoes] Erro ao listar com evento:', error.message);
      return [];
    }

    return (data ?? []) as InscricaoComEvento[];
  },

  /**
   * Conta total de inscritos confirmados em um evento.
   */
  async contarInscritos(eventoId: string): Promise<number> {
    if (!supabaseConfigured) return 0;

    const { count } = await supabase
      .from('inscricoes')
      .select('*', { count: 'exact', head: true })
      .eq('evento_id', eventoId)
      .eq('status', 'confirmada');

    return count ?? 0;
  },

  /**
   * Toggle: inscreve se não estava, cancela se estava.
   * Retorna o novo estado (true = inscrito).
   */
  async toggle(eventoId: string, usuarioId: string, estaInscrito: boolean): Promise<boolean> {
    if (estaInscrito) {
      await inscricoesService.cancelar(eventoId, usuarioId);
      return false;
    } else {
      await inscricoesService.inscrever(eventoId, usuarioId);
      return true;
    }
  },
};
