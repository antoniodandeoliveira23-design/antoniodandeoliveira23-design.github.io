import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';

interface Notificacao {
  id: string;
  tipo: 'evento' | 'sistema' | 'favorito';
  titulo: string;
  mensagem: string;
  horario: string;
  lida: boolean;
}

const DEMO_NOTIFICACOES: Notificacao[] = [
  {
    id: '1',
    tipo: 'evento',
    titulo: 'Festival de Música começa hoje!',
    mensagem: 'O evento que você favoritou começa às 19h. Não perca!',
    horario: '2h atrás',
    lida: false,
  },
  {
    id: '2',
    tipo: 'sistema',
    titulo: 'Bem-vindo ao AGORA!',
    mensagem: 'Explore eventos na sua cidade e conecte-se com quem está por perto.',
    horario: '1 dia atrás',
    lida: true,
  },
  {
    id: '3',
    tipo: 'favorito',
    titulo: 'Feira de Artesanato atualizada',
    mensagem: 'O organizador atualizou o horário do evento. Confira as novidades.',
    horario: '2 dias atrás',
    lida: true,
  },
];

const ICON_MAP: Record<string, { name: string; color: string }> = {
  evento: { name: 'calendar', color: CORES.laranja },
  sistema: { name: 'information-circle', color: CORES.roxoClaro },
  favorito: { name: 'heart', color: CORES.erro },
};

export default function NotificacoesScreen() {
  const router = useRouter();

  const renderNotificacao = ({ item }: { item: Notificacao }) => {
    const icon = ICON_MAP[item.tipo];
    return (
      <View style={[styles.card, !item.lida && styles.cardNaoLida]}>
        <View style={[styles.iconCircle, { backgroundColor: icon.color + '22' }]}>
          <Ionicons name={icon.name as any} size={20} color={icon.color} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitulo}>{item.titulo}</Text>
          <Text style={styles.cardMsg} numberOfLines={2}>{item.mensagem}</Text>
          <Text style={styles.cardHorario}>{item.horario}</Text>
        </View>
        {!item.lida && <View style={styles.unreadDot} />}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={CORES.branco} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notificações</Text>
        <TouchableOpacity>
          <Text style={styles.marcarLidas}>Marcar todas</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={DEMO_NOTIFICACOES}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={renderNotificacao}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={56} color={CORES.roxo} />
            <Text style={styles.emptyTitle}>Tudo em dia</Text>
            <Text style={styles.emptyText}>Você não tem notificações no momento.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.background, paddingTop: 50, paddingHorizontal: SPACING.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.lg },
  headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: 'bold', color: CORES.branco },
  marcarLidas: { color: CORES.roxoClaro, fontSize: FONT_SIZE.xs, fontWeight: '600' },

  list: { gap: SPACING.sm, paddingBottom: 40 },
  card: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, gap: SPACING.md },
  cardNaoLida: { borderLeftWidth: 3, borderLeftColor: CORES.laranja },
  iconCircle: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardTitulo: { color: CORES.branco, fontSize: FONT_SIZE.sm, fontWeight: '600', marginBottom: 3 },
  cardMsg: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs, lineHeight: 18, marginBottom: 4 },
  cardHorario: { color: CORES.cinza, fontSize: 11 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: CORES.laranja, marginTop: 6 },

  emptyState: { alignItems: 'center', marginTop: 80, gap: 8 },
  emptyTitle: { color: CORES.branco, fontSize: FONT_SIZE.lg, fontWeight: '600' },
  emptyText: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm },
});
