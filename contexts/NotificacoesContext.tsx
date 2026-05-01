/**
 * contexts/NotificacoesContext.tsx
 *
 * Gerencia estado global de notificações:
 * - Conta não lidas (badge)
 * - Lista em tempo real via Supabase Realtime
 * - Ações: marcar lida, marcar todas, recarregar
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { supabase, supabaseConfigured } from '@/services/supabase';
import {
  Notificacao,
  buscarNotificacoes,
  contarNaoLidas,
  marcarComoLida,
  marcarTodasComoLidas,
} from '@/services/notificacoes';
import { useAuth } from './AuthContext';

// ── Contexto ───────────────────────────────────────────────────────

interface NotificacoesContextData {
  notificacoes:       Notificacao[];
  totalNaoLidas:      number;
  loading:            boolean;
  recarregar:         () => Promise<void>;
  marcarLida:         (id: string) => Promise<void>;
  marcarTodasLidas:   () => Promise<void>;
}

const NotificacoesContext = createContext<NotificacoesContextData>({
  notificacoes:     [],
  totalNaoLidas:    0,
  loading:          false,
  recarregar:       async () => {},
  marcarLida:       async () => {},
  marcarTodasLidas: async () => {},
});

// ── Provider ───────────────────────────────────────────────────────

export function NotificacoesProvider({ children }: { children: React.ReactNode }) {
  const { user, signed } = useAuth();
  const [notificacoes, setNotificacoes]   = useState<Notificacao[]>([]);
  const [totalNaoLidas, setTotalNaoLidas] = useState(0);
  const [loading, setLoading]             = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const recarregar = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [lista, count] = await Promise.all([
        buscarNotificacoes(user.id),
        contarNaoLidas(user.id),
      ]);
      setNotificacoes(lista);
      setTotalNaoLidas(count);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const marcarLida = useCallback(async (id: string) => {
    await marcarComoLida(id);
    setNotificacoes(prev =>
      prev.map(n => n.id === id ? { ...n, lida: true } : n)
    );
    setTotalNaoLidas(prev => Math.max(0, prev - 1));
  }, []);

  const marcarTodasLidas = useCallback(async () => {
    if (!user?.id) return;
    await marcarTodasComoLidas(user.id);
    setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })));
    setTotalNaoLidas(0);
  }, [user?.id]);

  // Carrega e subscreve ao Realtime quando usuário loga
  useEffect(() => {
    if (!signed || !user?.id) {
      setNotificacoes([]);
      setTotalNaoLidas(0);
      return;
    }

    recarregar();

    if (!supabaseConfigured) return;

    // Realtime: nova notificação chega → adiciona ao topo
    const channel = supabase
      .channel(`notificacoes:${user.id}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'notificacoes',
          filter: `usuario_id=eq.${user.id}`,
        },
        (payload) => {
          const nova = payload.new as Notificacao;
          setNotificacoes(prev => [nova, ...prev]);
          setTotalNaoLidas(prev => prev + 1);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [signed, user?.id]);

  return (
    <NotificacoesContext.Provider
      value={{
        notificacoes,
        totalNaoLidas,
        loading,
        recarregar,
        marcarLida,
        marcarTodasLidas,
      }}
    >
      {children}
    </NotificacoesContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────

export function useNotificacoes() {
  return useContext(NotificacoesContext);
}
