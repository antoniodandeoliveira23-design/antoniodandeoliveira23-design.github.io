/**
 * services/chat.ts
 * Chat 1:1 com Supabase Realtime — channel().subscribe()
 *
 * Modo demo  → supabaseConfigured = false → dados in-memory
 * Modo real  → Supabase postgres_changes + RLS garante privacidade
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './supabase';
import { validacaoSemantica } from './validacao-semantica';
import { registrarAcao, registrarAnomalia } from './auditoria';
import { emailService } from './email';
import type { Conversa, Mensagem, User } from '@/types';

// Throttle de email por destinatário: evita spam se o Realtime channel
// não estiver ativo (usuário com app fechado). A Edge Function tem rate
// limit próprio de 2 min, mas bloqueamos já no cliente para não consumir
// invocations desnecessárias.
const _emailThrottle = new Map<string, number>(); // userId → timestamp

function _deveEnviarEmailMsg(destinatarioId: string): boolean {
  const agora = Date.now();
  const ultimo = _emailThrottle.get(destinatarioId) ?? 0;
  if (agora - ultimo < 5 * 60_000) return false; // 5 min de janela
  _emailThrottle.set(destinatarioId, agora);
  return true;
}

// ─────────────────────────────────────────────────────────────────
// Demo data (espelha mensagens.tsx antigo)
// ─────────────────────────────────────────────────────────────────

type ConversakDemo = {
  id: string;
  participante_ids: string[];
  participantes?: { id: string; nome: string; avatar_url?: string }[];
  ultima_mensagem?: string;
  atualizado_em: string;
  mensagens: Mensagem[];
};

let _demoConversas: ConversakDemo[] = [
  {
    id: 'c1',
    participante_ids: ['demo', 'demo-pj'],
    participantes: [
      { id: 'demo',    nome: 'Você' },
      { id: 'demo-pj', nome: 'Festival de Música' },
    ],
    ultima_mensagem: 'Olá! O evento começa às 19h, não esqueça!',
    atualizado_em: new Date(Date.now() - 30 * 60_000).toISOString(),
    mensagens: [
      { id: 'm1', conversa_id: 'c1', autor_id: 'demo',    texto: 'Gostaria de saber mais sobre o Festival.', lida: true,  criado_em: new Date(Date.now() - 50 * 60_000).toISOString() },
      { id: 'm2', conversa_id: 'c1', autor_id: 'demo-pj', texto: 'Será ao ar livre com bandas locais!',      lida: true,  criado_em: new Date(Date.now() - 40 * 60_000).toISOString() },
      { id: 'm3', conversa_id: 'c1', autor_id: 'demo-pj', texto: 'O evento começa às 19h, não esqueça! 🎵', lida: false, criado_em: new Date(Date.now() - 30 * 60_000).toISOString() },
    ],
  },
  {
    id: 'c2',
    participante_ids: ['demo', 'demo-gov'],
    participantes: [
      { id: 'demo',     nome: 'Você' },
      { id: 'demo-gov', nome: 'Feira de Artesanato' },
    ],
    ultima_mensagem: 'Ainda temos vagas para expositores.',
    atualizado_em: new Date(Date.now() - 3 * 3600_000).toISOString(),
    mensagens: [
      { id: 'm4', conversa_id: 'c2', autor_id: 'demo',     texto: 'Há vagas para expositores?',             lida: true,  criado_em: new Date(Date.now() - 3.5 * 3600_000).toISOString() },
      { id: 'm5', conversa_id: 'c2', autor_id: 'demo-gov', texto: 'Ainda temos vagas para expositores.',    lida: true,  criado_em: new Date(Date.now() - 3 * 3600_000).toISOString() },
    ],
  },
  {
    id: 'c3',
    participante_ids: ['demo', 'demo-pj2'],
    participantes: [
      { id: 'demo',     nome: 'Você' },
      { id: 'demo-pj2', nome: 'Workshop Fotografia' },
    ],
    ultima_mensagem: 'Traga sua câmera e um tripé!',
    atualizado_em: new Date(Date.now() - 24 * 3600_000).toISOString(),
    mensagens: [
      { id: 'm6', conversa_id: 'c3', autor_id: 'demo',     texto: 'Preciso levar algum equipamento?',       lida: true,  criado_em: new Date(Date.now() - 25 * 3600_000).toISOString() },
      { id: 'm7', conversa_id: 'c3', autor_id: 'demo-pj2', texto: 'Traga sua câmera e um tripé!',           lida: true,  criado_em: new Date(Date.now() - 24 * 3600_000).toISOString() },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────
// Tipos de callback
// ─────────────────────────────────────────────────────────────────

export type ConversaComParticipante = Conversa & {
  participante?: Pick<User, 'id' | 'nome' | 'sobrenome' | 'avatar_url' | 'username'>;
  naoLidas: number;
};

export type MensagemComAutor = Mensagem & {
  autor?: Pick<User, 'id' | 'nome' | 'avatar_url'>;
};

export type OnNovaMensagem = (msg: MensagemComAutor) => void;
export type OnConversaAtualizada = (conversaId: string, ultima: string, ts: string) => void;

// ─────────────────────────────────────────────────────────────────
// Utilitários
// ─────────────────────────────────────────────────────────────────

function formatarHora(iso: string): string {
  const d = new Date(iso);
  const agora = new Date();
  const diffDias = Math.floor((agora.getTime() - d.getTime()) / 86_400_000);
  if (diffDias === 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diffDias === 1) return 'Ontem';
  if (diffDias < 7)  return d.toLocaleDateString('pt-BR', { weekday: 'short' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// ─────────────────────────────────────────────────────────────────
// Service principal
// ─────────────────────────────────────────────────────────────────

export const chatService = {

  // ── Formata hora para exibição ──────────────────────────
  formatarHora,

  // ── Listar conversas do usuário ─────────────────────────
  async listarConversas(meuId: string): Promise<ConversaComParticipante[]> {
    if (!supabaseConfigured) {
      return _demoConversas
        .filter(c => c.participante_ids.includes(meuId) || meuId === 'demo')
        .map(c => {
          const outro = c.participantes?.find(p => p.id !== meuId) ?? c.participantes?.[0];
          const naoLidas = c.mensagens.filter(m => !m.lida && m.autor_id !== meuId).length;
          return {
            id:          c.id,
            participante_ids: c.participante_ids,
            ultima_mensagem: c.ultima_mensagem,
            atualizado_em:   c.atualizado_em,
            participante: outro
              ? { id: outro.id, nome: outro.nome, sobrenome: '', avatar_url: outro.avatar_url, username: outro.id }
              : undefined,
            naoLidas,
          } as ConversaComParticipante;
        })
        .sort((a, b) => new Date(b.atualizado_em).getTime() - new Date(a.atualizado_em).getTime());
    }

    // Busca conversas onde o usuário é participante
    const { data, error } = await supabase
      .from('conversas')
      .select(`
        id,
        participante_ids,
        ultima_mensagem,
        atualizado_em
      `)
      .contains('participante_ids', [meuId])
      .order('atualizado_em', { ascending: false });

    if (error) throw new Error(error.message);

    const conversas = data || [];

    // Para cada conversa, busca perfil do outro participante e conta não lidas
    const resultado: ConversaComParticipante[] = await Promise.all(
      conversas.map(async (c) => {
        const outroId = c.participante_ids.find((id: string) => id !== meuId);
        const [perfilRes, naoLidasRes] = await Promise.all([
          outroId
            ? supabase
                .from('profiles')
                .select('id, nome, sobrenome, avatar_url, username')
                .eq('id', outroId)
                .single()
            : Promise.resolve({ data: null }),
          supabase
            .from('mensagens')
            .select('id', { count: 'exact', head: true })
            .eq('conversa_id', c.id)
            .eq('lida', false)
            .neq('autor_id', meuId),
        ]);

        return {
          ...c,
          participante: perfilRes.data ?? undefined,
          naoLidas: (naoLidasRes as any).count ?? 0,
        };
      })
    );

    return resultado;
  },

  // ── Criar ou obter conversa existente ───────────────────
  async criarOuObterConversa(meuId: string, outroId: string): Promise<string> {
    if (!supabaseConfigured) {
      const existente = _demoConversas.find(
        c => c.participante_ids.includes(meuId) && c.participante_ids.includes(outroId)
      );
      if (existente) return existente.id;
      const nova: ConversakDemo = {
        id: 'c-' + Date.now(),
        participante_ids: [meuId, outroId],
        ultima_mensagem: undefined,
        atualizado_em: new Date().toISOString(),
        mensagens: [],
      };
      _demoConversas.unshift(nova);
      return nova.id;
    }

    // Verifica se já existe conversa entre os dois
    const { data: existentes } = await supabase
      .from('conversas')
      .select('id, participante_ids')
      .contains('participante_ids', [meuId, outroId]);

    if (existentes && existentes.length > 0) {
      // Confirma que tem exatamente os dois (sem terceiros)
      const exata = existentes.find(
        (c) => c.participante_ids.length === 2
          && c.participante_ids.includes(meuId)
          && c.participante_ids.includes(outroId)
      );
      if (exata) return exata.id;
    }

    // Cria nova conversa
    const { data, error } = await supabase
      .from('conversas')
      .insert({ participante_ids: [meuId, outroId], atualizado_em: new Date().toISOString() })
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    return data.id;
  },

  // ── Listar mensagens de uma conversa ────────────────────
  async listarMensagens(
    conversaId: string,
    opcoes: { pagina?: number; porPagina?: number } = {}
  ): Promise<MensagemComAutor[]> {
    const { pagina = 1, porPagina = 40 } = opcoes;
    const offset = (pagina - 1) * porPagina;

    if (!supabaseConfigured) {
      const conversa = _demoConversas.find(c => c.id === conversaId);
      const msgs = conversa?.mensagens ?? [];
      const paginada = msgs.slice(Math.max(0, msgs.length - porPagina - offset), msgs.length - offset);
      return paginada.map(m => ({
        ...m,
        autor: conversa?.participantes?.find(p => p.id === m.autor_id)
          ? { id: m.autor_id, nome: conversa?.participantes?.find(p => p.id === m.autor_id)?.nome ?? '', avatar_url: undefined }
          : undefined,
      })) as MensagemComAutor[];
    }

    const { data, error } = await supabase
      .from('mensagens')
      .select(`
        id,
        conversa_id,
        autor_id,
        texto,
        lida,
        criado_em,
        autor:profiles(id, nome, avatar_url)
      `)
      .eq('conversa_id', conversaId)
      .order('criado_em', { ascending: false })
      .range(offset, offset + porPagina - 1);

    if (error) throw new Error(error.message);
    // Retorna em ordem cronológica (mais antigas primeiro)
    return (data || []).reverse() as unknown as MensagemComAutor[];
  },

  // ── Enviar mensagem ─────────────────────────────────────
  async enviarMensagem(
    conversaId: string,
    texto: string,
    meuId: string,
  ): Promise<MensagemComAutor> {
    // Validação semântica
    const analise = validacaoSemantica.analisar(texto.trim(), 'mensagem');

    if (analise.bloqueado) {
      await registrarAnomalia({
        userId: meuId,
        tipo: 'conteudo_suspeito',
        descricao: `Mensagem bloqueada: ${analise.motivo}`,
        detalhes: { contexto: 'mensagem', conversa_id: conversaId, score: analise.score },
      });
      throw new Error(analise.motivo ?? 'CONTEUDO_BLOQUEADO');
    }

    if (!supabaseConfigured) {
      const nova: MensagemComAutor = {
        id: 'm-' + Date.now(),
        conversa_id: conversaId,
        autor_id: meuId,
        texto: texto.trim(),
        lida: true,
        criado_em: new Date().toISOString(),
      };
      const c = _demoConversas.find(cv => cv.id === conversaId);
      if (c) {
        c.mensagens.push(nova);
        c.ultima_mensagem = nova.texto;
        c.atualizado_em = nova.criado_em;
      }
      return nova;
    }

    const { data, error } = await supabase
      .from('mensagens')
      .insert({
        conversa_id: conversaId,
        autor_id: meuId,
        texto: texto.trim(),
        lida: false,
        criado_em: new Date().toISOString(),
      })
      .select('id, conversa_id, autor_id, texto, lida, criado_em, autor:profiles(id, nome, avatar_url)')
      .single();

    if (error) {
      await registrarAcao({ acao: 'mensagem_falha', categoria: 'auth', severidade: 'aviso', resultado: 'falha' });
      throw new Error(error.message);
    }

    // ── Notificação por email para o outro participante (throttled) ──
    // Busca quem é o destinatário e dispara email se não está ativo
    supabase
      .from('conversas')
      .select('participante_ids')
      .eq('id', conversaId)
      .single()
      .then(({ data: conv }) => {
        if (!conv) return;
        const destinatarioId = conv.participante_ids.find((id: string) => id !== meuId);
        if (!destinatarioId) return;
        if (!_deveEnviarEmailMsg(destinatarioId)) return;

        // Busca nome do remetente para email + push
        supabase
          .from('profiles')
          .select('nome')
          .eq('id', meuId)
          .single()
          .then(({ data: perfil }) => {
            const remetenteNome = perfil?.nome ?? 'Alguém';
            const preview       = texto.trim().slice(0, 100);

            // Email (fire-and-forget)
            emailService.novaMensagem({ usuarioId: destinatarioId, remetenteNome, preview });

            // Push notification (fire-and-forget)
            supabase.functions.invoke('enviar-push', {
              body: {
                usuario_id: destinatarioId,
                tipo:       'nova_mensagem',
                titulo:     `Nova mensagem de ${remetenteNome}`,
                mensagem:   preview,
                dados:      { remetente_id: meuId },
              },
            }).catch(() => {});
          });
      });

    return data as unknown as MensagemComAutor;
  },

  // ── Marcar mensagens como lidas ─────────────────────────
  async marcarLidas(conversaId: string, meuId: string): Promise<void> {
    if (!supabaseConfigured) {
      const c = _demoConversas.find(cv => cv.id === conversaId);
      if (c) c.mensagens.forEach(m => { if (m.autor_id !== meuId) m.lida = true; });
      return;
    }

    await supabase
      .from('mensagens')
      .update({ lida: true })
      .eq('conversa_id', conversaId)
      .neq('autor_id', meuId)
      .eq('lida', false);
  },

  // ── Contar total de não lidas ───────────────────────────
  async contarNaoLidas(meuId: string): Promise<number> {
    if (!supabaseConfigured) {
      return _demoConversas
        .filter(c => c.participante_ids.includes(meuId) || meuId === 'demo')
        .reduce((acc, c) => acc + c.mensagens.filter(m => !m.lida && m.autor_id !== meuId).length, 0);
    }

    // Busca ids das conversas do user
    const { data: convIds } = await supabase
      .from('conversas')
      .select('id')
      .contains('participante_ids', [meuId]);

    if (!convIds || convIds.length === 0) return 0;

    const { count } = await supabase
      .from('mensagens')
      .select('id', { count: 'exact', head: true })
      .in('conversa_id', convIds.map((c: { id: string }) => c.id))
      .neq('autor_id', meuId)
      .eq('lida', false);

    return count ?? 0;
  },

  // ─────────────────────────────────────────────────────────
  // REALTIME — Subscribe a mensagens de uma conversa
  //
  // Usa: supabase.channel(`chat:${conversaId}`)
  //        .on('postgres_changes', { event: 'INSERT', table: 'mensagens', filter })
  //        .subscribe()
  //
  // Retorna o RealtimeChannel para que o chamador possa
  // fazer unsubscribe() ao desmontar o componente.
  // ─────────────────────────────────────────────────────────
  subscribeConversa(
    conversaId: string,
    onNova: OnNovaMensagem,
  ): RealtimeChannel | null {
    if (!supabaseConfigured) {
      // Demo: sem realtime real — o chamador faz update local após enviarMensagem()
      return null;
    }

    const channel = supabase
      .channel(`chat:${conversaId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens',
          filter: `conversa_id=eq.${conversaId}`,
        },
        async (payload) => {
          const msg = payload.new as Mensagem;
          // Busca dados do autor para exibição
          const { data: autor } = await supabase
            .from('profiles')
            .select('id, nome, avatar_url')
            .eq('id', msg.autor_id)
            .single();

          onNova({ ...msg, autor: (autor ?? undefined) as any });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[chat] Canal chat:${conversaId} ativo`);
        }
        if (status === 'CHANNEL_ERROR') {
          console.warn(`[chat] Erro no canal chat:${conversaId}`);
        }
      });

    return channel;
  },

  // ─────────────────────────────────────────────────────────
  // REALTIME — Subscribe a atualizações de todas conversas do user
  //
  // Usa: supabase.channel(`user-chat:${meuId}`)
  //        .on('postgres_changes', { event: 'INSERT', table: 'mensagens' })
  //        .subscribe()
  //
  // Filtra client-side para conversas do usuário (arrays em Realtime
  // não suportam filtro @> nativamente).
  // ─────────────────────────────────────────────────────────
  subscribeConversas(
    meuId: string,
    conversaIds: string[],
    onAtualizar: OnConversaAtualizada,
  ): RealtimeChannel | null {
    if (!supabaseConfigured || conversaIds.length === 0) return null;

    const channel = supabase
      .channel(`user-chat:${meuId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens',
        },
        (payload) => {
          const msg = payload.new as Mensagem;
          // Filtra client-side: ignora mensagens de outras conversas
          if (!conversaIds.includes(msg.conversa_id)) return;
          // Ignora mensagens enviadas por mim (já são adicionadas otimisticamente)
          if (msg.autor_id === meuId) return;

          onAtualizar(msg.conversa_id, msg.texto, msg.criado_em);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[chat] Canal user-chat:${meuId} ativo — ${conversaIds.length} conversa(s)`);
        }
      });

    return channel;
  },

  // ── Cancelar subscription ───────────────────────────────
  async unsubscribe(channel: RealtimeChannel | null): Promise<void> {
    if (!channel) return;
    await supabase.removeChannel(channel);
  },
};
