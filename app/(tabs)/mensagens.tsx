import { Ionicons } from '@expo/vector-icons';
import React, { useState, useRef } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import ModalDenuncia from '@/components/ModalDenuncia';

interface Mensagem {
  id: string;
  texto: string;
  remetente: 'eu' | 'outro';
  horario: string;
}

interface Conversa {
  id: string;
  nome: string;
  iniciais: string;
  ultimaMensagem: string;
  horario: string;
  naoLidas: number;
  online: boolean;
  eventoId?: string;
  mensagens: Mensagem[];
}

const DEMO_CONVERSAS: Conversa[] = [
  {
    id: '1',
    nome: 'Festival de Música',
    iniciais: 'FM',
    ultimaMensagem: 'Olá! O evento começa às 19h, não esqueça!',
    horario: '14:30',
    naoLidas: 2,
    online: true,
    eventoId: '1',
    mensagens: [
      { id: 'm1', texto: 'Olá! Gostaria de saber mais sobre o Festival.', remetente: 'eu', horario: '14:20' },
      { id: 'm2', texto: 'Claro! Será ao ar livre com bandas locais.', remetente: 'outro', horario: '14:25' },
      { id: 'm3', texto: 'Olá! O evento começa às 19h, não esqueça!', remetente: 'outro', horario: '14:30' },
    ],
  },
  {
    id: '2',
    nome: 'Feira de Artesanato',
    iniciais: 'FA',
    ultimaMensagem: 'Ainda temos vagas para expositores.',
    horario: '10:15',
    naoLidas: 0,
    online: false,
    eventoId: '2',
    mensagens: [
      { id: 'm4', texto: 'Há vagas para expositores?', remetente: 'eu', horario: '10:00' },
      { id: 'm5', texto: 'Ainda temos vagas para expositores.', remetente: 'outro', horario: '10:15' },
    ],
  },
  {
    id: '3',
    nome: 'Workshop Fotografia',
    iniciais: 'WF',
    ultimaMensagem: 'Traga sua câmera e um tripé!',
    horario: 'Ontem',
    naoLidas: 0,
    online: true,
    eventoId: '4',
    mensagens: [
      { id: 'm6', texto: 'Preciso levar algum equipamento?', remetente: 'eu', horario: '09:00' },
      { id: 'm7', texto: 'Traga sua câmera e um tripé!', remetente: 'outro', horario: '09:10' },
    ],
  },
  {
    id: '4',
    nome: 'Teatro Municipal',
    iniciais: 'TM',
    ultimaMensagem: 'Ingressos confirmados para sábado.',
    horario: 'Seg',
    naoLidas: 1,
    online: false,
    eventoId: '3',
    mensagens: [
      { id: 'm8', texto: 'Reservei 2 ingressos para sábado.', remetente: 'eu', horario: '15:00' },
      { id: 'm9', texto: 'Ingressos confirmados para sábado.', remetente: 'outro', horario: '15:30' },
    ],
  },
];

export default function MensagensScreen() {
  const [busca, setBusca] = useState('');
  const [conversas, setConversas] = useState(DEMO_CONVERSAS);
  const [conversaAberta, setConversaAberta] = useState<Conversa | null>(null);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [denunciaVisivel, setDenunciaVisivel] = useState(false);
  const [denunciaAlvoId, setDenunciaAlvoId] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const conversasFiltradas = busca.trim()
    ? conversas.filter((c) => c.nome.toLowerCase().includes(busca.toLowerCase()))
    : conversas;

  const enviarMensagem = () => {
    if (!novaMensagem.trim() || !conversaAberta) return;
    const msg: Mensagem = {
      id: 'm-' + Date.now(),
      texto: novaMensagem.trim(),
      remetente: 'eu',
      horario: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };
    const updated = conversas.map(c => {
      if (c.id === conversaAberta.id) {
        return { ...c, mensagens: [...c.mensagens, msg], ultimaMensagem: msg.texto, horario: msg.horario };
      }
      return c;
    });
    setConversas(updated);
    setConversaAberta(prev => prev ? { ...prev, mensagens: [...prev.mensagens, msg] } : null);
    setNovaMensagem('');
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const renderConversa = ({ item }: { item: Conversa }) => (
    <TouchableOpacity style={styles.conversaCard} onPress={() => { setConversaAberta(item); }}>
      <View style={styles.avatarContainer}>
        <View style={[styles.avatar, item.naoLidas > 0 && styles.avatarAtivo]}>
          <Text style={styles.avatarText}>{item.iniciais}</Text>
        </View>
        {item.online && <View style={styles.onlineDot} />}
      </View>

      <View style={styles.conversaInfo}>
        <View style={styles.conversaHeader}>
          <Text style={styles.conversaNome} numberOfLines={1}>{item.nome}</Text>
          <Text style={[styles.conversaHorario, item.naoLidas > 0 && { color: CORES.laranja }]}>
            {item.horario}
          </Text>
        </View>
        <View style={styles.conversaFooter}>
          <Text style={styles.conversaMsg} numberOfLines={1}>{item.ultimaMensagem}</Text>
          {item.naoLidas > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.naoLidas}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderMensagem = ({ item }: { item: Mensagem }) => (
    <View style={[styles.msgRow, item.remetente === 'eu' && styles.msgRowEu]}>
      <View style={[styles.msgBubble, item.remetente === 'eu' ? styles.msgBubbleEu : styles.msgBubbleOutro]}>
        <Text style={styles.msgTexto}>{item.texto}</Text>
        <Text style={styles.msgHorario}>{item.horario}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Mensagens</Text>

      {/* Barra de busca */}
      <View style={styles.searchWrapper}>
        <Ionicons name="search" size={18} color={CORES.cinza} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar conversas..."
          placeholderTextColor={CORES.cinza}
          value={busca}
          onChangeText={setBusca}
        />
      </View>

      <FlatList
        data={conversasFiltradas}
        keyExtractor={(item) => item.id}
        renderItem={renderConversa}
        contentContainerStyle={styles.lista}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={64} color={CORES.roxo} />
            <Text style={styles.emptyTitle}>Nenhuma conversa encontrada</Text>
            <Text style={styles.emptyText}>
              Suas conversas com organizadores de eventos aparecerão aqui.
            </Text>
          </View>
        }
      />

      {/* Modal Chat */}
      <Modal visible={!!conversaAberta} animationType="slide" onRequestClose={() => setConversaAberta(null)}>
        <KeyboardAvoidingView style={styles.chatContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Chat Header */}
          <View style={styles.chatHeader}>
            <TouchableOpacity onPress={() => setConversaAberta(null)}>
              <Ionicons name="arrow-back" size={24} color={CORES.branco} />
            </TouchableOpacity>
            <View style={styles.chatHeaderInfo}>
              <View style={[styles.chatAvatar, conversaAberta?.online && styles.chatAvatarOnline]}>
                <Text style={styles.chatAvatarText}>{conversaAberta?.iniciais}</Text>
              </View>
              <View>
                <Text style={styles.chatHeaderNome}>{conversaAberta?.nome}</Text>
                <Text style={styles.chatHeaderStatus}>
                  {conversaAberta?.online ? 'Online' : 'Offline'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => {
              if (conversaAberta) {
                setDenunciaAlvoId(conversaAberta.id);
                setDenunciaVisivel(true);
              }
            }}>
              <Ionicons name="flag-outline" size={20} color={CORES.erro} />
            </TouchableOpacity>
          </View>

          {/* Event link */}
          {conversaAberta?.eventoId && (
            <View style={styles.chatEventBanner}>
              <Ionicons name="calendar" size={14} color={CORES.laranja} />
              <Text style={styles.chatEventText}>Conversa sobre: {conversaAberta.nome}</Text>
            </View>
          )}

          {/* Messages */}
          <FlatList
            ref={flatListRef}
            data={conversaAberta?.mensagens || []}
            keyExtractor={(item) => item.id}
            renderItem={renderMensagem}
            contentContainerStyle={styles.chatMessages}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />

          {/* Input */}
          <View style={styles.chatInputRow}>
            <View style={styles.chatInputWrapper}>
              <TextInput
                style={styles.chatInput}
                placeholder="Digite uma mensagem..."
                placeholderTextColor={CORES.cinza}
                value={novaMensagem}
                onChangeText={setNovaMensagem}
                onSubmitEditing={enviarMensagem}
                returnKeyType="send"
              />
            </View>
            <TouchableOpacity style={styles.chatSendBtn} onPress={enviarMensagem}>
              <Ionicons name="send" size={20} color={CORES.branco} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* R8: Modal Denúncia */}
      <ModalDenuncia
        visivel={denunciaVisivel}
        onFechar={() => setDenunciaVisivel(false)}
        tipo="mensagem"
        alvoId={denunciaAlvoId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.background, paddingTop: 60, paddingHorizontal: SPACING.lg },
  titulo: { fontSize: FONT_SIZE.xxl, fontWeight: 'bold', color: CORES.branco, marginBottom: SPACING.md },

  searchWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, height: 44, gap: SPACING.sm, marginBottom: SPACING.lg },
  searchInput: { flex: 1, color: CORES.branco, fontSize: FONT_SIZE.sm },

  lista: { paddingBottom: 100 },

  conversaCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, gap: SPACING.md },

  avatarContainer: { position: 'relative' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: CORES.background, justifyContent: 'center', alignItems: 'center' },
  avatarAtivo: { backgroundColor: CORES.roxo },
  avatarText: { color: CORES.branco, fontSize: FONT_SIZE.sm, fontWeight: 'bold' },
  onlineDot: { position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: CORES.sucesso, borderWidth: 2, borderColor: CORES.backgroundCard },

  conversaInfo: { flex: 1 },
  conversaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  conversaNome: { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: '600', flex: 1, marginRight: SPACING.sm },
  conversaHorario: { color: CORES.cinza, fontSize: FONT_SIZE.xs },

  conversaFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  conversaMsg: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, flex: 1, marginRight: SPACING.sm },

  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: CORES.laranja, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  badgeText: { color: CORES.branco, fontSize: 11, fontWeight: 'bold' },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyTitle: { color: CORES.branco, fontSize: FONT_SIZE.lg, fontWeight: 'bold', marginTop: SPACING.lg },
  emptyText: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, textAlign: 'center', marginTop: SPACING.sm, maxWidth: 280, lineHeight: 22 },

  // Chat modal
  chatContainer: { flex: 1, backgroundColor: CORES.background },
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'web' ? 16 : 50, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, backgroundColor: CORES.backgroundCard },
  chatHeaderInfo: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1, marginLeft: SPACING.md },
  chatAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: CORES.background, justifyContent: 'center', alignItems: 'center' },
  chatAvatarOnline: { borderWidth: 2, borderColor: CORES.sucesso },
  chatAvatarText: { color: CORES.branco, fontSize: 12, fontWeight: 'bold' },
  chatHeaderNome: { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: '600' },
  chatHeaderStatus: { color: CORES.cinzaClaro, fontSize: 11 },

  chatEventBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: CORES.backgroundCard, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: CORES.border },
  chatEventText: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs },

  chatMessages: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: SPACING.sm },
  msgRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  msgRowEu: { justifyContent: 'flex-end' },
  msgBubble: { maxWidth: '75%', borderRadius: RADIUS.md, padding: SPACING.md },
  msgBubbleOutro: { backgroundColor: CORES.backgroundCard, borderBottomLeftRadius: 4 },
  msgBubbleEu: { backgroundColor: CORES.roxo, borderBottomRightRadius: 4 },
  msgTexto: { color: CORES.branco, fontSize: FONT_SIZE.sm, lineHeight: 20 },
  msgHorario: { color: CORES.cinzaClaro, fontSize: 10, marginTop: 4, textAlign: 'right' },

  chatInputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: SPACING.sm, backgroundColor: CORES.backgroundCard, borderTopWidth: 1, borderTopColor: CORES.border },
  chatInputWrapper: { flex: 1, backgroundColor: CORES.background, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, height: 44, justifyContent: 'center' },
  chatInput: { color: CORES.branco, fontSize: FONT_SIZE.sm },
  chatSendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: CORES.roxo, justifyContent: 'center', alignItems: 'center' },
});
