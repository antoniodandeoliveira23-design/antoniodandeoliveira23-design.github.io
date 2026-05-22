/**
 * contexts/TemaContext.tsx
 *
 * Gerencia preferências globais persistidas:
 *   • modoEscuro         — alterna entre tema escuro/claro
 *   • notificacoesAtivas — habilita / desabilita push tokens
 *
 * Persiste em AsyncStorage. Deve ficar dentro de AuthProvider.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { CORES_CLARO, CORES_ESCURO, type Cores } from '@/constants/theme';
import { registrarPushToken, desativarPushTokens } from '@/services/notificacoes';
import { useAuth } from './AuthContext';

// ── Chaves AsyncStorage ────────────────────────────────────────────
const KEY_TEMA  = '@agora:modoEscuro';
const KEY_NOTIF = '@agora:notificacoes';

// ── Tipos ──────────────────────────────────────────────────────────
interface TemaContextData {
  modoEscuro:          boolean;
  notificacoesAtivas:  boolean;
  cores:               Cores;
  toggleTema:          () => void;
  toggleNotificacoes:  () => Promise<void>;
}

// ── Contexto ───────────────────────────────────────────────────────
const TemaContext = createContext<TemaContextData>({
  modoEscuro:         true,
  notificacoesAtivas: true,
  cores:              CORES_ESCURO,
  toggleTema:         () => {},
  toggleNotificacoes: async () => {},
});

// ── Provider ───────────────────────────────────────────────────────
export function TemaProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const [modoEscuro,         setModoEscuro]         = useState(true);
  const [notificacoesAtivas, setNotificacoesAtivas] = useState(true);
  const [carregado,          setCarregado]           = useState(false);

  // Lê preferências salvas na inicialização
  useEffect(() => {
    AsyncStorage.multiGet([KEY_TEMA, KEY_NOTIF])
      .then(pairs => {
        const [tema, notif] = pairs;
        if (tema[1]  !== null) setModoEscuro(tema[1]  === 'true');
        if (notif[1] !== null) setNotificacoesAtivas(notif[1] === 'true');
      })
      .catch(() => {})
      .finally(() => setCarregado(true));
  }, []);

  // ── Toggle: modo escuro ────────────────────────────────────────
  const toggleTema = useCallback(() => {
    setModoEscuro(prev => {
      const next = !prev;
      AsyncStorage.setItem(KEY_TEMA, String(next)).catch(() => {});
      return next;
    });
  }, []);

  // ── Toggle: notificações push ──────────────────────────────────
  const toggleNotificacoes = useCallback(async () => {
    const next = !notificacoesAtivas;
    setNotificacoesAtivas(next);
    AsyncStorage.setItem(KEY_NOTIF, String(next)).catch(() => {});

    // Apenas dispositivos nativos têm push token
    if (Platform.OS === 'web' || !user?.id) return;

    if (next) {
      // Reativa: re-registra o token (pede permissão se necessário)
      await registrarPushToken(user.id).catch(() => {});
    } else {
      // Desativa: marca tokens como inativos no banco
      await desativarPushTokens(user.id).catch(() => {});
    }
  }, [notificacoesAtivas, user?.id]);

  // Não renderiza filhos antes de carregar preferências
  // (evita flash de tema errado)
  if (!carregado) return null;

  const cores = modoEscuro ? CORES_ESCURO : CORES_CLARO;

  return (
    <TemaContext.Provider
      value={{ modoEscuro, notificacoesAtivas, cores, toggleTema, toggleNotificacoes }}
    >
      {children}
    </TemaContext.Provider>
  );
}

// ── Hooks ──────────────────────────────────────────────────────────

/** Acessa tema e preferências */
export function useTema() {
  return useContext(TemaContext);
}

/** Acessa só as cores ativas (atalho conveniente) */
export function useCores(): Cores {
  return useContext(TemaContext).cores;
}

/** Retorna se notificações push estão ativas */
export function useNotificacoesAtivas(): boolean {
  return useContext(TemaContext).notificacoesAtivas;
}
