/**
 * services/notificacoes.ts
 *
 * Gerencia push tokens e notificações in-app via Supabase.
 * Push nativo usa Expo Notifications (iOS/Android).
 * Web usa apenas notificações in-app via Realtime.
 */

import { Platform } from 'react-native';
import { supabase, supabaseConfigured } from './supabase';

// ── Tipos ──────────────────────────────────────────────────────────

export type TipoNotificacao =
  | 'nova_mensagem'
  | 'evento_aprovado'
  | 'evento_rejeitado'
  | 'pagamento_confirmado'
  | 'evento_favorito_atualizado'
  | 'inscricao_confirmada'
  | 'sistema'
  | 'alerta_admin';

export interface Notificacao {
  id: string;
  usuario_id: string;
  tipo: TipoNotificacao;
  titulo: string;
  mensagem: string;
  dados: Record<string, string>;
  lida: boolean;
  criado_em: string;
}

// ── Helpers de tempo relativo ──────────────────────────────────────

export function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60000);
  const h    = Math.floor(diff / 3600000);
  const d    = Math.floor(diff / 86400000);
  if (min < 1)  return 'agora';
  if (min < 60) return `${min}min atrás`;
  if (h   < 24) return `${h}h atrás`;
  if (d   < 7)  return `${d}d atrás`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

// ── Registro de Push Token ─────────────────────────────────────────

/**
 * Registra o token Expo Push do dispositivo no banco.
 * Chamado em _layout.tsx após login bem-sucedido.
 * Silencioso em web e demo mode.
 */
export async function registrarPushToken(usuarioId: string): Promise<void> {
  if (Platform.OS === 'web' || !supabaseConfigured) return;

  try {
    // Importação dinâmica para evitar erros em web
    const Notifications = await import('expo-notifications');

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[push] Permissão negada pelo usuário');
      return;
    }

    // Configurar handler de notificações recebidas em foreground
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge:  true,
        shouldShowBanner: true,
        shouldShowList:   true,
      }),
    });

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'agora-vilhena', // Substituir pelo EAS projectId real se configurado
    });

    const token = tokenData.data;
    const plataforma = Platform.OS as 'ios' | 'android';

    // Upsert — evita duplicatas
    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        { usuario_id: usuarioId, token, plataforma, ativo: true },
        { onConflict: 'usuario_id,token' }
      );

    if (error) console.warn('[push] Erro ao salvar token:', error.message);
    else console.log('[push] Token registrado com sucesso');

  } catch (err) {
    console.warn('[push] Falha ao registrar token (silencioso):', err);
  }
}

/**
 * Desativa tokens do usuário ao fazer logout.
 */
export async function desativarPushTokens(usuarioId: string): Promise<void> {
  if (!supabaseConfigured) return;
  try {
    await supabase
      .from('push_tokens')
      .update({ ativo: false })
      .eq('usuario_id', usuarioId);
  } catch (err) {
    console.warn('[push] Erro ao desativar tokens:', err);
  }
}

// ── CRUD de Notificações ───────────────────────────────────────────

/**
 * Busca notificações do usuário (mais recentes primeiro, limite 50).
 */
export async function buscarNotificacoes(usuarioId: string): Promise<Notificacao[]> {
  if (!supabaseConfigured) return DEMO_NOTIFICACOES;

  const { data, error } = await supabase
    .from('notificacoes')
    .select('*')
    .eq('usuario_id', usuarioId)
    .order('criado_em', { ascending: false })
    .limit(50);

  if (error) {
    console.warn('[notificacoes] Erro ao buscar:', error.message);
    return DEMO_NOTIFICACOES;
  }

  return (data ?? []) as Notificacao[];
}

/**
 * Conta notificações não lidas.
 */
export async function contarNaoLidas(usuarioId: string): Promise<number> {
  if (!supabaseConfigured) return DEMO_NOTIFICACOES.filter(n => !n.lida).length;

  const { count, error } = await supabase
    .from('notificacoes')
    .select('*', { count: 'exact', head: true })
    .eq('usuario_id', usuarioId)
    .eq('lida', false);

  if (error) return 0;
  return count ?? 0;
}

/**
 * Marca uma notificação como lida.
 */
export async function marcarComoLida(notificacaoId: string): Promise<void> {
  if (!supabaseConfigured) return;
  await supabase
    .from('notificacoes')
    .update({ lida: true })
    .eq('id', notificacaoId);
}

/**
 * Marca todas as notificações do usuário como lidas.
 */
export async function marcarTodasComoLidas(usuarioId: string): Promise<void> {
  if (!supabaseConfigured) return;
  await supabase
    .from('notificacoes')
    .update({ lida: true })
    .eq('usuario_id', usuarioId)
    .eq('lida', false);
}

/**
 * Cria uma notificação in-app diretamente (uso interno / admin).
 * Para notificações externas, use a Edge Function enviar-push.
 */
export async function criarNotificacao(params: {
  usuarioId: string;
  tipo: TipoNotificacao;
  titulo: string;
  mensagem: string;
  dados?: Record<string, string>;
}): Promise<void> {
  if (!supabaseConfigured) return;
  const { error } = await supabase.from('notificacoes').insert({
    usuario_id: params.usuarioId,
    tipo:       params.tipo,
    titulo:     params.titulo,
    mensagem:   params.mensagem,
    dados:      params.dados ?? {},
  });
  if (error) console.warn('[notificacoes] Erro ao criar:', error.message);
}

// ── Dados demo ────────────────────────────────────────────────────

const DEMO_NOTIFICACOES: Notificacao[] = [
  {
    id: '1',
    usuario_id: 'demo',
    tipo: 'evento_aprovado',
    titulo: 'Evento aprovado! 🎉',
    mensagem: 'Seu "Festival de Música" foi aprovado e está ao vivo no AGORA.',
    dados: {},
    lida: false,
    criado_em: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    id: '2',
    usuario_id: 'demo',
    tipo: 'nova_mensagem',
    titulo: 'Nova mensagem de Ana',
    mensagem: 'Olá! Ainda tem ingressos disponíveis para o evento?',
    dados: {},
    lida: false,
    criado_em: new Date(Date.now() - 5 * 3600000).toISOString(),
  },
  {
    id: '3',
    usuario_id: 'demo',
    tipo: 'pagamento_confirmado',
    titulo: 'Pagamento confirmado ✅',
    mensagem: 'Seu plano Profissional foi ativado com sucesso.',
    dados: {},
    lida: true,
    criado_em: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: '4',
    usuario_id: 'demo',
    tipo: 'sistema',
    titulo: 'Bem-vindo ao AGORA!',
    mensagem: 'Explore eventos em Vilhena e conecte-se com quem está por perto.',
    dados: {},
    lida: true,
    criado_em: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
];
