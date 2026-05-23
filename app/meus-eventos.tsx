import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FONT_SIZE, RADIUS, SPACING, type Cores } from '@/constants/theme';
import { useCores } from '@/contexts/TemaContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEventos } from '@/contexts/EventosContext';
import { _demoPendentes } from '@/services/eventos';
import type { Evento } from '@/types';

const ICON_MAP: Record<string, string> = {
  musica: 'musical-notes', teatro: 'film', esporte: 'football', educacao: 'school',
  feira: 'storefront', cultura: 'library', gastronomia: 'restaurant', negocios: 'briefcase',
  religiao: 'heart', governo: 'flag', outro: 'ellipsis-horizontal',
};

const STATUS_LABELS: Record<string, string> = {
  aprovado: 'Publicado',
  pendente: 'Em análise',
  rejeitado: 'Rejeitado',
  rascunho: 'Rascunho',
};

export default function MeusEventos() {
  const cores = useCores();
  const styles = createStyles(cores);
  const router = useRouter();
  const { user } = useAuth();
  const { eventos, carregarEventos } = useEventos();

  const STATUS_COLORS: Record<string, string> = {
    aprovado: cores.sucesso,
    pendente: cores.laranja,
    rejeitado: cores.erro,
    rascunho: cores.cinza,
  };

  useEffect(() => {
    carregarEventos();
  }, []);

  // Combinar eventos aprovados + pendentes do usuário
  const todosEventos = [...eventos, ..._demoPendentes];
  const meusEventos = todosEventos.filter(ev => ev.criador_id === user?.id || ev.criador_id === 'demo' || ev.criador_id === 'demo-pj');

  const renderEvento = (item: Evento) => {
    const statusColor = STATUS_COLORS[item.status] || cores.cinza;
    const statusLabel = STATUS_LABELS[item.status] || item.status;

    return (
      <TouchableOpacity key={item.id} style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.iconCircle}>
            <Ionicons name={(ICON_MAP[item.categoria] || 'calendar') as any} size={22} color={cores.laranja} />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardNome} numberOfLines={1}>{item.nome}</Text>
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={12} color={cores.cinzaClaro} />
              <Text style={styles.metaText} numberOfLines={1}>{item.local}</Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={12} color={cores.laranja} />
              <Text style={styles.metaDate}>
                {new Date(item.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '22' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        {/* Ações */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn}>
            <Ionicons name="create-outline" size={16} color={cores.roxoClaro} />
            <Text style={styles.actionText}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <Ionicons name="stats-chart" size={16} color={cores.laranja} />
            <Text style={[styles.actionText, { color: cores.laranja }]}>Estatísticas</Text>
          </TouchableOpacity>
          {item.comercial && !item.pago && (
            <TouchableOpacity style={[styles.actionBtn, styles.actionPagar]} onPress={() => router.push({ pathname: '/pagamento', params: { eventoId: item.id, eventoNome: item.nome } })}>
              <Ionicons name="card" size={16} color={cores.branco} />
              <Text style={[styles.actionText, { color: cores.branco }]}>Pagar</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={cores.branco} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meus Eventos</Text>
        <TouchableOpacity onPress={() => router.push('/criar-evento')}>
          <Ionicons name="add-circle" size={28} color={cores.roxo} />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{meusEventos.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: cores.sucesso }]}>
            {meusEventos.filter(e => e.status === 'aprovado').length}
          </Text>
          <Text style={styles.statLabel}>Publicados</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: cores.laranja }]}>
            {meusEventos.filter(e => e.status === 'pendente').length}
          </Text>
          <Text style={styles.statLabel}>Pendentes</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {meusEventos.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={cores.cinza} />
            <Text style={styles.emptyTitle}>Nenhum evento criado</Text>
            <Text style={styles.emptyDesc}>Crie seu primeiro evento e ele aparecerá aqui.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/criar-evento')}>
              <Text style={styles.emptyBtnText}>Criar evento</Text>
            </TouchableOpacity>
          </View>
        ) : (
          meusEventos.map(renderEvento)
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(cores: Cores) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: cores.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'web' ? 20 : 50, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
    headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: 'bold', color: cores.branco },

    statsRow: { flexDirection: 'row', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md, gap: SPACING.sm },
    statBox: { flex: 1, backgroundColor: cores.backgroundCard, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center' },
    statNum: { fontSize: FONT_SIZE.xxl, fontWeight: 'bold', color: cores.branco },
    statLabel: { fontSize: FONT_SIZE.xs, color: cores.cinzaClaro, marginTop: 2 },

    listContent: { paddingHorizontal: SPACING.lg, paddingBottom: 40, gap: SPACING.md },

    card: { backgroundColor: cores.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    iconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: cores.background, justifyContent: 'center', alignItems: 'center' },
    cardInfo: { flex: 1, gap: 2 },
    cardNome: { color: cores.branco, fontSize: FONT_SIZE.sm, fontWeight: 'bold' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { color: cores.cinzaClaro, fontSize: 11, flex: 1 },
    metaDate: { color: cores.laranja, fontSize: 11, fontWeight: '600' },

    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusText: { fontSize: 10, fontWeight: '700' },

    actionsRow: { flexDirection: 'row', marginTop: SPACING.sm, gap: SPACING.sm, borderTopWidth: 1, borderTopColor: cores.border, paddingTop: SPACING.sm },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8 },
    actionPagar: { backgroundColor: cores.roxo, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 6 },
    actionText: { color: cores.roxoClaro, fontSize: FONT_SIZE.xs, fontWeight: '600' },

    emptyState: { alignItems: 'center', paddingTop: 60 },
    emptyTitle: { color: cores.branco, fontSize: FONT_SIZE.lg, fontWeight: 'bold', marginTop: SPACING.md },
    emptyDesc: { color: cores.cinzaClaro, fontSize: FONT_SIZE.sm, marginTop: SPACING.xs, textAlign: 'center' },
    emptyBtn: { backgroundColor: cores.roxo, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.xl, paddingVertical: 12, marginTop: SPACING.lg },
    emptyBtnText: { color: cores.branco, fontWeight: 'bold' },
  });
}
