/**
 * contexts/ChatContext.tsx
 * Gerencia lista de conversas, badge de não-lidas e subscription global.
 *
 * Providers: envolve o app em _layout.tsx, dentro de AuthProvider.
 * Consumers: (tabs)/_layout.tsx (badge), (tabs)/mensagens.tsx (lista).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useAuth } from './AuthContext';
import {
  chatService,
  type ConversaComParticipante,
  type MensagemComAutor,
} from '@/services/chat';

// ─────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────

interface ChatContextData {
  // Estado
  conversas:     ConversaComParticipante[];
  totalNaoLidas: number;
  loading:       boolean;

  // Ações
  carregarConversas:    () => Promise<void>;
  criarOuObterConversa: (outroId: string) => Promise<string>;

  // Chamado quando uma mensagem nova chega ou é enviada (para reordenar lista)
  atualizarConversa: (conversaId: string, ultimaMsg: string, ts: string) => void;

  // Badge local: decrementa quando o chat é aberto
  marcarConversaLida: (conversaId: string) => void;
}

// ─────────────────────────────────────────────────────────────────
// Contexto
// ─────────────────────────────────────────────────────────────────

const ChatContext = createContext<ChatContextData>({} as ChatContextData);

// ─────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const [conversas,     setConversas]     = useState<ConversaComParticipante[]>([]);
  const [totalNaoLidas, setTotalNaoLidas] = useState(0);
  const [loading,       setLoading]       = useState(false);

  // Ref para o canal global (conversas do usuário)
  const canalGlobalRef = useRef<RealtimeChannel | null>(null);

  // ── Carrega lista de conversas ────────────────────────────
  const carregarConversas = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const lista = await chatService.listarConversas(user.id);
      setConversas(lista);
      setTotalNaoLidas(lista.reduce((acc, c) => acc + c.naoLidas, 0));
    } catch (err) {
      console.warn('[ChatContext] Erro ao carregar conversas:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // ── Cria ou obtém conversa com outro usuário ──────────────
  const criarOuObterConversa = useCallback(async (outroId: string): Promise<string> => {
    if (!user?.id) throw new Error('Não autenticado');
    const id = await chatService.criarOuObterConversa(user.id, outroId);
    // Recarrega lista para incluir a nova conversa
    await carregarConversas();
    return id;
  }, [user?.id, carregarConversas]);

  // ── Reordena conversa no topo e atualiza ultima_mensagem ──
  const atualizarConversa = useCallback((conversaId: string, ultimaMsg: string, ts: string) => {
    setConversas(prev => {
      const idx = prev.findIndex(c => c.id === conversaId);
      if (idx === -1) return prev;
      const atualizada = { ...prev[idx], ultima_mensagem: ultimaMsg, atualizado_em: ts };
      const nova = [atualizada, ...prev.filter((_, i) => i !== idx)];
      return nova;
    });
    // Incrementa badge
    setTotalNaoLidas(t => t + 1);
  }, []);

  // ── Zera badge da conversa quando o chat é aberto ────────
  const marcarConversaLida = useCallback((conversaId: string) => {
    setConversas(prev =>
      prev.map(c => {
        if (c.id !== conversaId || c.naoLidas === 0) return c;
        setTotalNaoLidas(t => Math.max(0, t - c.naoLidas));
        return { ...c, naoLidas: 0 };
      })
    );
  }, []);

  // ── Subscription global quando usuário loga ──────────────
  useEffect(() => {
    if (!user?.id) {
      setConversas([]);
      setTotalNaoLidas(0);
      return;
    }

    carregarConversas();

    // Cleanup anterior
    return () => {
      if (canalGlobalRef.current) {
        chatService.unsubscribe(canalGlobalRef.current);
        canalGlobalRef.current = null;
      }
    };
  }, [user?.id]);

  // ── Re-subscribe quando lista de conversas muda ───────────
  // (precisamos dos IDs atuais para filtragem client-side)
  useEffect(() => {
    if (!user?.id || conversas.length === 0) return;

    // Cancela canal anterior antes de criar novo
    if (canalGlobalRef.current) {
      chatService.unsubscribe(canalGlobalRef.current);
      canalGlobalRef.current = null;
    }

    const ids = conversas.map(c => c.id);
    const canal = chatService.subscribeConversas(
      user.id,
      ids,
      (conversaId, ultimaMsg, ts) => {
        atualizarConversa(conversaId, ultimaMsg, ts);
      }
    );
    canalGlobalRef.current = canal;

    return () => {
      if (canalGlobalRef.current) {
        chatService.unsubscribe(canalGlobalRef.current);
        canalGlobalRef.current = null;
      }
    };
  }, [user?.id, conversas.length]);

  return (
    <ChatContext.Provider
      value={{
        conversas,
        totalNaoLidas,
        loading,
        carregarConversas,
        criarOuObterConversa,
        atualizarConversa,
        marcarConversaLida,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat deve estar dentro de ChatProvider');
  return ctx;
}
