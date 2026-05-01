/**
 * app/(tabs)/mensagens.tsx
 * Chat 1:1 com Supabase Realtime — channel().subscribe()
 *
 * Fluxo:
 *  1. Lista de conversas (ChatContext)
 *  2. Tap → abre ChatModal (RealtimeChannel por conversa)
 *  3. chatService.subscribeConversa() → mensagens em tempo real
 *  4. unsubscribe() ao fechar modal
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import ModalDenuncia from '@/components/ModalDenuncia';
import { chatService, type ConversaComParticipante, type MensagemComAutor } from '@/services/chat';
import { validacaoSemantica } from '@/services/validacao-semantica';
import { registrarAnomalia } from '@/services/auditoria';

// ─────────────────────────────────────────────────────────────────
// Sub-component: ChatModal — conversa individual com Realtime
// ─────────────────────────────────────────────────────────────────

interface ChatModalProps {
  conversa: ConversaComParticipante;
  meuId: string;
  onFechar: () => void;
}

function ChatModal({ conversa, meuId, onFechar }: ChatModalProps) {
  const [mensagens,     setMensagens]     = useState<MensagemComAutor[]>([]);
  const [loadingMsgs,   setLoadingMsgs]   = useState(true);
  const [texto,         setTexto]         = useState('');
  const [enviando,      setEnviando]      = useState(false);
  const [alertaMsg,     setAlertaMsg]     = useState('');
  const [msgBloqueada,  setMsgBloqueada]  = useState(false);
  const [denunciaOpen,  setDenunciaOpen]  = useState(false);

  const flatListRef = useRef<FlatList<MensagemComAutor>>(null);
  const canalRef    = useRef<RealtimeChannel | null>(null);

  const outro = conversa.participante;
  const iniciais = outro
    ? (outro.nome?.[0] ?? '?').toUpperCase()
    : '?';

  // ── Carrega mensagens iniciais ──────────────────────────
  useEffect(() => {
    let cancelado = false;

    const carregar = async () => {
      setLoadingMsgs(true);
      try {
        const msgs = await chatService.listarMensagens(conversa.id);
        if (!cancelado) setMensagens(msgs);
        // Marca como lidas
        chatService.marcarLidas(conversa.id, meuId);
      } catch (err) {
        console.warn('[ChatModal] Erro ao carregar mensagens:', err);
      } finally {
        if (!cancelado) setLoadingMsgs(false);
      }
    };

    carregar();

    // ── Realtime: inscreве no canal desta conversa ────────
    const canal = chatService.subscribeConversa(
      conversa.id,
      (novaMsg) => {
        // Ignora mensagens enviadas por mim (já adicionadas otimisticamente)
        if (novaMsg.autor_id === meuId) return;
        setMensagens(prev => [...prev, novaMsg]);
        // Scroll para o fim
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
        // Marca imediatamente como lida (usuário está vendo)
        chatService.marcarLidas(conversa.id, meuId);
      }
    );
    canalRef.current = canal;

    return () => {
      cancelado = true;
      // ── Cleanup: cancela subscription ao fechar ────────
      chatService.unsubscribe(canalRef.current);
      canalRef.current = null;
    };
  }, [conversa.id, meuId]);

  // Scroll para o fim quando mensagens carregam
  useEffect(() => {
    if (!loadingMsgs && mensagens.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 80);
    }
  }, [loadingMsgs]);

  // ── Validação semântica inline ────────────────────────
  const handleChangeTexto = (val: string) => {
    setTexto(val);
    if (!val.trim() || val.length < 12) {
      setAlertaMsg(''); setMsgBloqueada(false); return;
    }
    const res = validacaoSemantica.analisar(val, 'mensagem');
    if (res.bloqueado) {
      setMsgBloqueada(true);
      setAlertaMsg(res.motivo ?? 'Conteúdo não permitido.');
    } else if (res.alertas.length > 0) {
      setMsgBloqueada(false);
      setAlertaMsg(res.alertas[0]);
    } else {
      setMsgBloqueada(false); setAlertaMsg('');
    }
  };

  // ── Enviar mensagem ───────────────────────────────────
  const enviar = useCallback(async () => {
    const txt = texto.trim();
    if (!txt || msgBloqueada || enviando) return;

    // Validação final (mesmo a inline pode ter sido ignorada)
    const res = validacaoSemantica.analisar(txt, 'mensagem');
    if (res.bloqueado) {
      await registrarAnomalia({
        userId: meuId,
        tipo: 'conteudo_suspeito',
        descricao: `Mensagem bloqueada: ${res.motivo}`,
        detalhes: { contexto: 'mensagem', conversa_id: conversa.id },
      });
      setMsgBloqueada(true);
      setAlertaMsg(res.motivo ?? 'Conteúdo não permitido.');
      return;
    }

    // Insere otimisticamente na UI
    const otimista: MensagemComAutor = {
      id: 'tmp-' + Date.now(),
      conversa_id: conversa.id,
      autor_id:    meuId,
      texto:       txt,
      lida:        true,
      criado_em:   new Date().toISOString(),
    };
    setMensagens(prev => [...prev, otimista]);
    setTexto('');
    setAlertaMsg('');
    setMsgBloqueada(false);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);

    setEnviando(true);
    try {
      const real = await chatService.enviarMensagem(conversa.id, txt, meuId);
      // Substitui mensagem otimista pelo dado real
      setMensagens(prev => prev.map(m => m.id === otimista.id ? real : m));
    } catch (err: any) {
      // Reverte se falhou
      setMensagens(prev => prev.filter(m => m.id !== otimista.id));
      setAlertaMsg(err.message ?? 'Erro ao enviar mensagem.');
      setTexto(txt);
    } finally {
      setEnviando(false);
    }
  }, [texto, msgBloqueada, enviando, conversa.id, meuId]);

  // ── Render mensagem ───────────────────────────────────
  const renderMensagem = useCallback(({ item }: { item: MensagemComAutor }) => {
    const euEnviei = item.autor_id === meuId;
    const pendente = item.id.startsWith('tmp-');

    return (
      <View style={[styles.msgRow, euEnviei && styles.msgRowEu]}>
        {/* Avatar do outro (lado esquerdo) */}
        {!euEnviei && (
          item.autor?.avatar_url ? (
            <Image source={{ uri: item.autor.avatar_url }} style={styles.msgAvatar} contentFit="cover" />
          ) : (
            <View style={[styles.msgAvatar, styles.msgAvatarFallback]}>
              <Text style={styles.msgAvatarText}>{(item.autor?.nome?.[0] ?? '?').toUpperCase()}</Text>
            </View>
          )
        )}

        <View style={[
          styles.msgBubble,
          euEnviei ? styles.msgBubbleEu : styles.msgBubbleOutro,
          pendente && styles.msgBubblePendente,
        ]}>
          <Text style={styles.msgTexto}>{item.texto}</Text>
          <View style={styles.msgMeta}>
            <Text style={styles.msgHorario}>
              {chatService.formatarHora(item.criado_em)}
            </Text>
            {euEnviei && (
              <Ionicons
                name={pendente ? 'time-outline' : item.lida ? 'checkmark-done' : 'checkmark'}
                size={12}
                color={item.lida ? CORES.roxoClaro : CORES.cinzaClaro}
                style={{ marginLeft: 3 }}
              />
            )}
          </View>
        </View>
      </View>
    );
  }, [meuId]);

  return (
    <View style={styles.chatContainer}>
      {/* Header */}
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={onFechar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={24} color={CORES.branco} />
        </TouchableOpacity>

        <View style={styles.chatHeaderInfo}>
          {outro?.avatar_url ? (
            <Image source={{ uri: outro.avatar_url }} style={styles.chatAvatar} contentFit="cover" />
          ) : (
            <View style={[styles.chatAvatar, styles.chatAvatarFallback]}>
              <Text style={styles.chatAvatarText}>{iniciais}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.chatHeaderNome} numberOfLines={1}>
              {outro?.nome ?? 'Usuário'}
            </Text>
            <Text style={styles.chatHeaderSub}>
              {outro?.username ? `@${outro.username}` : 'Online agora'}
            </Text>
          </View>
        </View>

        <TouchableOpacity onPress={() => setDenunciaOpen(true)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="flag-outline" size={20} color={CORES.erro} />
        </TouchableOpacity>
      </View>

      {/* Mensagens */}
      {loadingMsgs ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={CORES.roxo} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={mensagens}
          keyExtractor={item => item.id}
          renderItem={renderMensagem}
          contentContainerStyle={styles.chatMessages}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Ionicons name="chatbubble-ellipses-outline" size={48} color={CORES.cinza} />
              <Text style={styles.emptyChatText}>Seja o primeiro a enviar uma mensagem!</Text>
            </View>
          }
          onContentSizeChange={() => {
            if (mensagens.length > 0) {
              flatListRef.current?.scrollToEnd({ animated: false });
            }
          }}
        />
      )}

      {/* Alerta semântico inline */}
      {!!alertaMsg && (
        <View style={[styles.alertaSemantico, msgBloqueada ? styles.alertaBloqueado : styles.alertaAviso]}>
          <Ionicons
            name={msgBloqueada ? 'ban' : 'warning-outline'}
            size={14}
            color={msgBloqueada ? CORES.erro : '#F59E0B'}
          />
          <Text style={[styles.alertaText, { color: msgBloqueada ? CORES.erro : '#F59E0B' }]} numberOfLines={2}>
            {alertaMsg}
          </Text>
        </View>
      )}

      {/* Input */}
      <View style={[styles.inputRow, msgBloqueada && styles.inputRowBloqueado]}>
        <TextInput
          style={styles.chatInput}
          placeholder="Digite uma mensagem..."
          placeholderTextColor={CORES.cinza}
          value={texto}
          onChangeText={handleChangeTexto}
          onSubmitEditing={enviar}
          returnKeyType="send"
          multiline
          maxLength={1000}
          editable={!enviando}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (msgBloqueada || enviando) && styles.sendBtnDisabled]}
          onPress={enviar}
          disabled={msgBloqueada || enviando || !texto.trim()}
        >
          {enviando
            ? <ActivityIndicator size="small" color={CORES.branco} />
            : <Ionicons name={msgBloqueada ? 'ban' : 'send'} size={20} color={CORES.branco} />
          }
        </TouchableOpacity>
      </View>

      {/* Modal Denúncia */}
      <ModalDenuncia
        visivel={denunciaOpen}
        onFechar={() => setDenunciaOpen(false)}
        tipo="mensagem"
        alvoId={conversa.id}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// Tela principal: lista de conversas
// ─────────────────────────────────────────────────────────────────

export default function MensagensScreen() {
  const { user } = useAuth();
  const { conversas, loading, carregarConversas, marcarConversaLida } = useChat();

  const [busca,          setBusca]          = useState('');
  const [conversaAberta, setConversaAberta] = useState<ConversaComParticipante | null>(null);

  // Recarrega ao focar a tab
  useEffect(() => { carregarConversas(); }, []);

  const abrirConversa = (c: ConversaComParticipante) => {
    marcarConversaLida(c.id);
    setConversaAberta(c);
  };

  const fecharConversa = () => {
    setConversaAberta(null);
    carregarConversas(); // atualiza naoLidas após sair
  };

  // Filtro por busca (nome do outro participante ou última mensagem)
  const conversasFiltradas = busca.trim()
    ? conversas.filter(c =>
        c.participante?.nome.toLowerCase().includes(busca.toLowerCase()) ||
        c.ultima_mensagem?.toLowerCase().includes(busca.toLowerCase())
      )
    : conversas;

  // ── Render card de conversa ───────────────────────────
  const renderConversa = ({ item }: { item: ConversaComParticipante }) => {
    const outro    = item.participante;
    const iniciais = (outro?.nome?.[0] ?? '?').toUpperCase();
    const temBadge = item.naoLidas > 0;

    return (
      <TouchableOpacity style={styles.conversaCard} onPress={() => abrirConversa(item)} activeOpacity={0.75}>
        {/* Avatar */}
        <View style={styles.avatarWrap}>
          {outro?.avatar_url ? (
            <Image source={{ uri: outro.avatar_url }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, temBadge && styles.avatarAtivo]}>
              <Text style={styles.avatarText}>{iniciais}</Text>
            </View>
          )}
          {temBadge && <View style={styles.onlineDot} />}
        </View>

        {/* Info */}
        <View style={styles.conversaInfo}>
          <View style={styles.conversaHeader}>
            <Text style={styles.conversaNome} numberOfLines={1}>
              {outro?.nome ?? 'Usuário'}
            </Text>
            <Text style={[styles.conversaHora, temBadge && { color: CORES.laranja }]}>
              {chatService.formatarHora(item.atualizado_em)}
            </Text>
          </View>
          <View style={styles.conversaFooter}>
            <Text style={[styles.conversaUltima, temBadge && { color: CORES.branco }]} numberOfLines={1}>
              {item.ultima_mensagem ?? 'Nenhuma mensagem ainda'}
            </Text>
            {temBadge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.naoLidas > 9 ? '9+' : item.naoLidas}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Se há conversa aberta, mostra ChatModal full-screen ──
  if (conversaAberta && user?.id) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ChatModal
          conversa={conversaAberta}
          meuId={user.id}
          onFechar={fecharConversa}
        />
      </KeyboardAvoidingView>
    );
  }

  // ── Lista de conversas ────────────────────────────────
  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Mensagens</Text>

      {/* Busca */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={CORES.cinza} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar conversas..."
          placeholderTextColor={CORES.cinza}
          value={busca}
          onChangeText={setBusca}
          returnKeyType="search"
        />
        {busca.length > 0 && (
          <TouchableOpacity onPress={() => setBusca('')}>
            <Ionicons name="close-circle" size={18} color={CORES.cinza} />
          </TouchableOpacity>
        )}
      </View>

      {loading && conversas.length === 0 ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={CORES.roxo} />
        </View>
      ) : (
        <FlatList
          data={conversasFiltradas}
          keyExtractor={item => item.id}
          renderItem={renderConversa}
          contentContainerStyle={styles.lista}
          refreshing={loading}
          onRefresh={carregarConversas}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={64} color={CORES.roxo} />
              <Text style={styles.emptyTitle}>
                {busca ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
              </Text>
              <Text style={styles.emptyText}>
                {busca
                  ? `Nenhum resultado para "${busca}"`
                  : 'Entre em contato com organizadores de eventos pelo botão de chat no card do evento.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// Estilos
// ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Tela principal ────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: CORES.background,
    paddingTop: Platform.OS === 'web' ? 20 : 60,
    paddingHorizontal: SPACING.lg,
  },
  titulo: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: CORES.branco,
    marginBottom: SPACING.md,
  },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CORES.backgroundCard,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    height: 44,
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  searchInput: { flex: 1, color: CORES.branco, fontSize: FONT_SIZE.sm },

  lista: { paddingBottom: 120, gap: SPACING.xs },

  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Card de conversa ──────────────────────────────────────
  conversaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CORES.backgroundCard,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  avatarWrap:  { position: 'relative' },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: CORES.background,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarAtivo: { backgroundColor: CORES.roxo },
  avatarText:  { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: CORES.laranja,
    borderWidth: 2,
    borderColor: CORES.backgroundCard,
  },
  conversaInfo:   { flex: 1 },
  conversaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  conversaNome:   { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: '600', flex: 1, marginRight: 8 },
  conversaHora:   { color: CORES.cinza, fontSize: FONT_SIZE.xs },
  conversaFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  conversaUltima: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, flex: 1, marginRight: 8 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: CORES.laranja,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: CORES.branco, fontSize: 11, fontWeight: 'bold' },

  // ── Empty state ───────────────────────────────────────────
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80, gap: SPACING.sm },
  emptyTitle: { color: CORES.branco, fontSize: FONT_SIZE.lg, fontWeight: 'bold', textAlign: 'center' },
  emptyText:  { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, textAlign: 'center', maxWidth: 280, lineHeight: 22 },

  // ── ChatModal: container e header ─────────────────────────
  chatContainer: {
    flex: 1,
    backgroundColor: CORES.background,
    paddingTop: Platform.OS === 'web' ? 0 : 0,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'web' ? 16 : 50,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: CORES.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: CORES.border,
  },
  chatHeaderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
    marginHorizontal: SPACING.md,
  },
  chatAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
  },
  chatAvatarFallback: {
    backgroundColor: CORES.roxo,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatAvatarText:  { color: CORES.branco, fontSize: 14, fontWeight: 'bold' },
  chatHeaderNome:  { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: '600' },
  chatHeaderSub:   { color: CORES.cinzaClaro, fontSize: 11, marginTop: 1 },

  // ── ChatModal: mensagens ──────────────────────────────────
  chatMessages: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
    flexGrow: 1,
  },
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    gap: SPACING.sm,
  },
  emptyChatText: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, textAlign: 'center', maxWidth: 240 },

  msgRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.xs },
  msgRowEu: { justifyContent: 'flex-end' },

  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 4,
  },
  msgAvatarFallback: { backgroundColor: CORES.backgroundCard, justifyContent: 'center', alignItems: 'center' },
  msgAvatarText: { color: CORES.branco, fontSize: 10, fontWeight: 'bold' },

  msgBubble: {
    maxWidth: '72%',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  msgBubbleOutro:   { backgroundColor: CORES.backgroundCard, borderBottomLeftRadius: 4 },
  msgBubbleEu:      { backgroundColor: CORES.roxo, borderBottomRightRadius: 4 },
  msgBubblePendente:{ opacity: 0.7 },

  msgTexto:   { color: CORES.branco, fontSize: FONT_SIZE.sm, lineHeight: 20 },
  msgMeta:    { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 3 },
  msgHorario: { color: 'rgba(255,255,255,0.55)', fontSize: 10 },

  // ── ChatModal: input ──────────────────────────────────────
  alertaSemantico: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
  },
  alertaBloqueado: { backgroundColor: CORES.erro + '18' },
  alertaAviso:     { backgroundColor: '#F59E0B18' },
  alertaText:      { flex: 1, fontSize: 11, lineHeight: 16 },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    backgroundColor: CORES.backgroundCard,
    borderTopWidth: 1,
    borderTopColor: CORES.border,
    paddingBottom: Platform.OS === 'ios' ? SPACING.lg : SPACING.sm,
  },
  inputRowBloqueado: { borderTopColor: CORES.erro },
  chatInput: {
    flex: 1,
    backgroundColor: CORES.background,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    color: CORES.branco,
    fontSize: FONT_SIZE.sm,
    maxHeight: 100,
    lineHeight: 20,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CORES.roxo,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: CORES.cinza },
});
