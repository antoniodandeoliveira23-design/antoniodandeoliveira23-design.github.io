import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FONT_SIZE, RADIUS, SPACING, type Cores } from '@/constants/theme';
import { useCores } from '@/contexts/TemaContext';
import { useEventos } from '@/contexts/EventosContext';
import type { Evento } from '@/types';

const ICON_MAP: Record<string, string> = {
  musica: 'musical-notes', teatro: 'film', esporte: 'football', educacao: 'school',
  feira: 'storefront', cultura: 'library', gastronomia: 'restaurant',
  negocios: 'briefcase', religiao: 'heart', governo: 'flag', outro: 'calendar',
};

export default function CurtidasScreen() {
  const cores = useCores();
  const styles = createStyles(cores);
  const router = useRouter();
  const { eventos, favoritos, desfavoritarEvento } = useEventos();

  // Reutiliza a tabela favoritos — exibição com visual de "curtidas" (coração laranja)
  const eventosCurtidos = eventos.filter((e) => favoritos.includes(e.id));

  const renderEvento = ({ item }: { item: Evento }) => (
    <View style={styles.card}>
      <View style={styles.iconCircle}>
        <Ionicons name={(ICON_MAP[item.categoria] || 'calendar') as any} size={22} color={cores.laranja} />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardNome}>{item.nome}</Text>
        <View style={styles.cardMetaRow}>
          <Ionicons name="location-outline" size={12} color={cores.cinzaClaro} />
          <Text style={styles.cardLocal}>{item.local}</Text>
        </View>
        <View style={styles.cardMetaRow}>
          <Ionicons name="calendar-outline" size={12} color={cores.laranja} />
          <Text style={styles.cardData}>
            {new Date(item.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
      <TouchableOpacity style={styles.curtidaBtn} onPress={() => desfavoritarEvento(item.id)}>
        <Ionicons name="heart" size={22} color={cores.laranja} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={cores.branco} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Curtidos</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={styles.subtitulo}>{eventosCurtidos.length} evento(s) curtido(s)</Text>

      <FlatList
        data={eventosCurtidos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={renderEvento}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="heart-outline" size={56} color={cores.laranja} />
            <Text style={styles.emptyTitle}>Nenhuma curtida</Text>
            <Text style={styles.emptyText}>
              Toque no coração dos eventos para curtir e vê-los aqui.
            </Text>
          </View>
        }
      />
    </View>
  );
}

function createStyles(cores: Cores) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: cores.background, paddingTop: Platform.OS === 'web' ? 20 : 50, paddingHorizontal: SPACING.lg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
    headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: 'bold', color: cores.branco },
    subtitulo: { color: cores.cinzaClaro, fontSize: FONT_SIZE.xs, marginBottom: SPACING.lg },

    list: { gap: SPACING.sm, paddingBottom: 40 },
    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: cores.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, gap: SPACING.md },
    iconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: cores.background, justifyContent: 'center', alignItems: 'center' },
    cardInfo: { flex: 1 },
    cardNome: { color: cores.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },
    cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
    cardLocal: { color: cores.cinzaClaro, fontSize: FONT_SIZE.xs },
    cardData: { color: cores.laranja, fontSize: FONT_SIZE.xs, fontWeight: '600' },
    curtidaBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: cores.laranja + '22', justifyContent: 'center', alignItems: 'center' },

    emptyState: { alignItems: 'center', marginTop: 80, gap: 8 },
    emptyTitle: { color: cores.branco, fontSize: FONT_SIZE.lg, fontWeight: '600' },
    emptyText: { color: cores.cinzaClaro, fontSize: FONT_SIZE.sm, textAlign: 'center', maxWidth: 260, lineHeight: 22 },
  });
}
