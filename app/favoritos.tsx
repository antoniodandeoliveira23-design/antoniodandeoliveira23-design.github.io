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
import { useEventos } from '@/contexts/EventosContext';
import type { Evento } from '@/types';

const ICON_MAP: Record<string, string> = {
  musica: 'musical-notes', teatro: 'film', esporte: 'football', educacao: 'school',
  feira: 'storefront', cultura: 'library', gastronomia: 'restaurant',
  negocios: 'briefcase', religiao: 'heart', governo: 'flag', outro: 'calendar',
};

export default function FavoritosScreen() {
  const router = useRouter();
  const { eventos, favoritos, desfavoritarEvento } = useEventos();

  const eventosFavoritos = eventos.filter((e) => favoritos.includes(e.id));

  const renderEvento = ({ item }: { item: Evento }) => (
    <View style={styles.card}>
      <View style={styles.iconCircle}>
        <Ionicons name={(ICON_MAP[item.categoria] || 'calendar') as any} size={22} color={CORES.laranja} />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardNome}>{item.nome}</Text>
        <View style={styles.cardMetaRow}>
          <Ionicons name="location-outline" size={12} color={CORES.cinzaClaro} />
          <Text style={styles.cardLocal}>{item.local}</Text>
        </View>
        <View style={styles.cardMetaRow}>
          <Ionicons name="calendar-outline" size={12} color={CORES.laranja} />
          <Text style={styles.cardData}>
            {new Date(item.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
      <TouchableOpacity style={styles.removeBtn} onPress={() => desfavoritarEvento(item.id)}>
        <Ionicons name="heart" size={20} color={CORES.erro} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={CORES.branco} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Favoritos</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={styles.subtitulo}>{eventosFavoritos.length} evento(s) salvos</Text>

      <FlatList
        data={eventosFavoritos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={renderEvento}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="heart-outline" size={56} color={CORES.roxo} />
            <Text style={styles.emptyTitle}>Nenhum favorito</Text>
            <Text style={styles.emptyText}>
              Toque no coração dos eventos para salvá-los aqui.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.background, paddingTop: 50, paddingHorizontal: SPACING.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: 'bold', color: CORES.branco },
  subtitulo: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs, marginBottom: SPACING.lg },

  list: { gap: SPACING.sm, paddingBottom: 40 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, gap: SPACING.md },
  iconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: CORES.background, justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardNome: { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  cardLocal: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs },
  cardData: { color: CORES.laranja, fontSize: FONT_SIZE.xs, fontWeight: '600' },
  removeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: CORES.background, justifyContent: 'center', alignItems: 'center' },

  emptyState: { alignItems: 'center', marginTop: 80, gap: 8 },
  emptyTitle: { color: CORES.branco, fontSize: FONT_SIZE.lg, fontWeight: '600' },
  emptyText: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, textAlign: 'center', maxWidth: 260, lineHeight: 22 },
});
