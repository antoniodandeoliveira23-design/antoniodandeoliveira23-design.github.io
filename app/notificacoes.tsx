import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { useNotificacoes } from '@/contexts/NotificacoesContext';
import { TipoNotificacao, tempoRelativo } from '@/services/notificacoes';

// ── Ícone por tipo ────────────────────────────────────────────────

const ICONE_MAP: Record<TipoNotificacao, { name: string; cor: string }> = {
  nova_mensagem:              { name: 'chatbubble',         cor: CORES.roxoClaro },
  evento_aprovado:            { name: 'checkmark-circle',   cor: '#4CAF50' },
  evento_rejeitado:           { name: 'close-circle',       cor: CORES.erro },
  pagamento_confirmado:       { name: 'card',               cor: '#4CAF50' },
  evento_favorito_atualizado: { name: 'heart',              cor: CORES.erro },
  inscricao_confirmada:       { name: 'ticket',             cor: CORES.laranja },
  sistema:                    { name: 'information-circle', cor: CORES.cinzaClaro },
  alerta_admin:               { name: 'warning',            cor: '#FF9800' },
};

// ── Tela ──────────────────────────────────────────────────────────

export default function NotificacoesScreen() {
  const router = useRouter();
  const { notificacoes, loading, recarregar, marcarLida, marcarTodasLidas } =
    useNotificacoes();

  useEffect(() => { recarregar(); }, []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={CORES.branco} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notificações</Text>
        <TouchableOpacity onPress={marcarTodasLidas} hitSlop={8}>
          <Text style={styles.marcarLidas}>Marcar todas</Text>
        </TouchableOpacity>
      </View>

      {/* Loading inicial */}
      {loading && notificacoes.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={CORES.roxo} />
        </View>
      ) : (
        <FlatList
          data={notificacoes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={recarregar}
          renderItem={({ item }) => {
            const icon = ICONE_MAP[item.tipo] ?? ICONE_MAP.sistema;
            return (
              <TouchableOpacity
                style={[styles.card, !item.lida && styles.cardNaoLida]}
                onPress={() => !item.lida && marcarLida(item.id)}
                activeOpacity={0.75}
              >
                <View style={[styles.iconCircle, { backgroundColor: icon.cor + '22' }]}>
                  <Ionicons name={icon.name as any} size={20} color={icon.cor} />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitulo}>{item.titulo}</Text>
                  <Text style={styles.cardMsg} numberOfLines={2}>{item.mensagem}</Text>
                  <Text style={styles.cardHorario}>{tempoRelativo(item.criado_em)}</Text>
                </View>
                {!item.lida && <View style={styles.unreadDot} />}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="notifications-off-outline" size={56} color={CORES.roxo} />
              <Text style={styles.emptyTitle}>Tudo em dia</Text>
              <Text style={styles.emptyText}>Você não tem notificações no momento.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CORES.background,
    paddingTop: 50,
    paddingHorizontal: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: 'bold', color: CORES.branco },
  marcarLidas: { color: CORES.roxoClaro, fontSize: FONT_SIZE.xs, fontWeight: '600' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { gap: SPACING.sm, paddingBottom: 40 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: CORES.backgroundCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.md,
  },
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
