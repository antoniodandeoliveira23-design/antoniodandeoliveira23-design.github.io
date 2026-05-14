import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import {
  listarAuditRecente,
  listarAnomalias,
  resolverAnomalia,
  contarAnomaliasPendentes,
  type AuditEntry,
  type AnomaliaEntry,
} from '@/services/auditoria';
import { moderacaoService } from '@/services/moderacao';
import { denunciasService } from '@/services/denuncias';
import { doisFA } from '@/services/doisFA';
import Admin2FAChallenge from '@/components/Admin2FAChallenge';

// ─────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────
type Aba = 'visao' | 'auditoria' | 'anomalias';

// ─────────────────────────────────────────────────────────
// Helpers de UI
// ─────────────────────────────────────────────────────────
const SEVERIDADE_COR: Record<string, string> = {
  info:    CORES.sucesso,
  aviso:   '#F59E0B',
  critico: CORES.erro,
};

const CATEGORIA_ICON: Record<string, string> = {
  auth:      'key-outline',
  evento:    'calendar-outline',
  moderacao: 'shield-outline',
  pagamento: 'card-outline',
  denuncia:  'flag-outline',
  admin:     'settings-outline',
  seguranca: 'lock-closed-outline',
};

const ANOMALIA_ICON: Record<string, string> = {
  login_falha_repetida: 'warning-outline',
  velocidade:           'speedometer-outline',
  conteudo_suspeito:    'alert-circle-outline',
  ip_duplicado:         'copy-outline',
  evento_clonado:       'duplicate-outline',
  multiplas_denuncias:  'flag-outline',
};

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─────────────────────────────────────────────────────────
// Componente principal — guard de admin
// ─────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [, setRefresh] = useState(0);

  useEffect(() => {
    if (user && user.tipo_conta !== 'admin') {
      Alert.alert(
        'Acesso negado',
        'Esta área é restrita a administradores.',
        [{ text: 'Voltar', onPress: () => router.replace('/(tabs)') }],
      );
    }
  }, [user]);

  if (!user || user.tipo_conta !== 'admin') {
    return (
      <View style={styles.guardContainer}>
        <Ionicons name="lock-closed" size={48} color={CORES.erro} />
        <Text style={styles.guardText}>Acesso restrito a administradores</Text>
        <TouchableOpacity style={styles.guardBtn} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.guardBtnText}>Voltar ao início</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Guard: 2FA obrigatório para admin ─────────────────
  if (!doisFA.estaVerificado()) {
    return (
      <Admin2FAChallenge
        onVerificado={() => setRefresh(n => n + 1)}
      />
    );
  }

  return <DashboardContent />;
}

// ─────────────────────────────────────────────────────────
// Conteúdo (só renderiza quando admin confirmado)
// ─────────────────────────────────────────────────────────
function DashboardContent() {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>('visao');

  // ── KPIs ──────────────────────────────────────────────
  const [kpis, setKpis] = useState({
    eventosPendentes: 0,
    denunciasAbertas: 0,
    anomaliasPendentes: 0,
    auditUltimas24h: 0,
  });
  const [loadingKpis, setLoadingKpis] = useState(true);

  // ── Auditoria ─────────────────────────────────────────
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // ── Anomalias ─────────────────────────────────────────
  const [anomalias, setAnomalias] = useState<AnomaliaEntry[]>([]);
  const [loadingAnomalias, setLoadingAnomalias] = useState(false);
  const [resolvendoId, setResolvendoId] = useState<string | null>(null);

  // ── Refresh ───────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);

  // ── Carregar KPIs ─────────────────────────────────────
  const carregarKpis = useCallback(async () => {
    setLoadingKpis(true);
    try {
      const [
        resEventos,
        denunciasAbertas,
        anomaliasPendentes,
        auditEntries,
      ] = await Promise.allSettled([
        moderacaoService.listarPendentes(1, 1),
        denunciasService.contarAbertas(),
        contarAnomaliasPendentes(),
        listarAuditRecente(200),
      ]);

      const eventosPendentes =
        resEventos.status === 'fulfilled' ? resEventos.value.total : 0;
      const abertasCount =
        denunciasAbertas.status === 'fulfilled' ? denunciasAbertas.value : 0;
      const anomaliasCount =
        anomaliasPendentes.status === 'fulfilled' ? anomaliasPendentes.value : 0;

      // Conta entradas de auditoria das últimas 24h
      const agora = Date.now();
      const UM_DIA = 24 * 60 * 60 * 1000;
      const recentes =
        auditEntries.status === 'fulfilled'
          ? auditEntries.value.filter(
              e => agora - new Date(e.created_at).getTime() < UM_DIA,
            ).length
          : 0;

      setKpis({
        eventosPendentes,
        denunciasAbertas: abertasCount,
        anomaliasPendentes: anomaliasCount,
        auditUltimas24h: recentes,
      });
    } finally {
      setLoadingKpis(false);
    }
  }, []);

  // ── Carregar auditoria ────────────────────────────────
  const carregarAudit = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const dados = await listarAuditRecente(100);
      setAuditLog(dados);
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao carregar auditoria.');
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  // ── Carregar anomalias ────────────────────────────────
  const carregarAnomalias = useCallback(async () => {
    setLoadingAnomalias(true);
    try {
      const dados = await listarAnomalias(true);
      setAnomalias(dados);
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao carregar anomalias.');
    } finally {
      setLoadingAnomalias(false);
    }
  }, []);

  // ── Resolver anomalia ─────────────────────────────────
  const handleResolverAnomalia = (anomalia: AnomaliaEntry) => {
    Alert.alert(
      'Resolver anomalia',
      `Marcar "${anomalia.tipo.replace(/_/g, ' ')}" como resolvida?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Resolver',
          onPress: async () => {
            setResolvendoId(anomalia.id);
            try {
              await resolverAnomalia(anomalia.id);
              setAnomalias(prev => prev.filter(a => a.id !== anomalia.id));
              setKpis(prev => ({
                ...prev,
                anomaliasPendentes: Math.max(0, prev.anomaliasPendentes - 1),
              }));
            } catch (e: any) {
              Alert.alert('Erro', e.message || 'Falha ao resolver anomalia.');
            } finally {
              setResolvendoId(null);
            }
          },
        },
      ],
    );
  };

  // ── Pull-to-refresh ───────────────────────────────────
  const handleRefresh = async () => {
    setRefreshing(true);
    await carregarKpis();
    if (aba === 'auditoria') await carregarAudit();
    if (aba === 'anomalias') await carregarAnomalias();
    setRefreshing(false);
  };

  // ── Efeitos iniciais ──────────────────────────────────
  useEffect(() => { carregarKpis(); }, []);
  useEffect(() => {
    if (aba === 'auditoria' && auditLog.length === 0) carregarAudit();
    if (aba === 'anomalias' && anomalias.length === 0) carregarAnomalias();
  }, [aba]);

  // ── Renders ───────────────────────────────────────────

  const renderKpiCard = (
    icon: string,
    label: string,
    valor: number,
    cor: string,
    rota?: string,
  ) => (
    <TouchableOpacity
      key={label}
      style={[styles.kpiCard, { borderLeftColor: cor }]}
      onPress={() => rota && router.push(rota as any)}
      activeOpacity={rota ? 0.7 : 1}
    >
      <View style={[styles.kpiIconBox, { backgroundColor: cor + '22' }]}>
        <Ionicons name={icon as any} size={22} color={cor} />
      </View>
      <View style={styles.kpiTextos}>
        <Text style={[styles.kpiValor, { color: cor }]}>{valor}</Text>
        <Text style={styles.kpiLabel}>{label}</Text>
      </View>
      {rota && <Ionicons name="chevron-forward" size={16} color={CORES.cinza} />}
    </TouchableOpacity>
  );

  const renderAuditItem = ({ item }: { item: AuditEntry }) => {
    const cor = SEVERIDADE_COR[item.severidade] || CORES.cinzaClaro;
    const icon = CATEGORIA_ICON[item.categoria] || 'ellipse-outline';
    return (
      <View style={styles.logItem}>
        <View style={[styles.logIconBox, { backgroundColor: cor + '22' }]}>
          <Ionicons name={icon as any} size={16} color={cor} />
        </View>
        <View style={styles.logTextos}>
          <View style={styles.logHeaderRow}>
            <Text style={styles.logAcao} numberOfLines={1}>{item.acao.replace(/_/g, ' ')}</Text>
            <View style={[styles.sevBadge, { backgroundColor: cor + '33', borderColor: cor }]}>
              <Text style={[styles.sevText, { color: cor }]}>{item.severidade}</Text>
            </View>
          </View>
          <Text style={styles.logMeta}>
            {item.categoria}
            {item.tabela ? ` · ${item.tabela}` : ''}
            {item.resultado === 'falha' ? ' · ❌ falha' : ''}
          </Text>
          <Text style={styles.logData}>{formatarData(item.created_at)}</Text>
        </View>
      </View>
    );
  };

  const renderAnomalia = ({ item }: { item: AnomaliaEntry }) => {
    const icon = ANOMALIA_ICON[item.tipo] || 'warning-outline';
    const isResolvendo = resolvendoId === item.id;
    return (
      <View style={styles.anomaliaCard}>
        <View style={styles.anomaliaHeader}>
          <View style={styles.anomaliaIconBox}>
            <Ionicons name={icon as any} size={20} color={CORES.erro} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.anomaliaTipo}>{item.tipo.replace(/_/g, ' ')}</Text>
            {(item.usuario_nome || item.tipo_conta) && (
              <Text style={styles.anomaliaUsuario}>
                {item.usuario_nome || ''}
                {item.tipo_conta ? ` (${item.tipo_conta})` : ''}
              </Text>
            )}
          </View>
          <Text style={styles.anomaliaData}>{formatarData(item.created_at)}</Text>
        </View>

        <Text style={styles.anomaliaDesc}>{item.descricao}</Text>

        {Object.keys(item.detalhes || {}).length > 0 && (
          <View style={styles.detalhesBox}>
            {Object.entries(item.detalhes).map(([k, v]) => (
              <Text key={k} style={styles.detalheItem}>
                <Text style={styles.detalheKey}>{k}: </Text>
                {String(v)}
              </Text>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={styles.resolverBtn}
          onPress={() => handleResolverAnomalia(item)}
          disabled={isResolvendo}
        >
          {isResolvendo ? (
            <ActivityIndicator size="small" color={CORES.sucesso} />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={16} color={CORES.sucesso} />
              <Text style={styles.resolverText}>Marcar como resolvida</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  // ── Visão Geral ───────────────────────────────────────
  const TabVisaoGeral = () => (
    <ScrollView
      style={styles.tabContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={CORES.roxoClaro}
        />
      }
    >
      <Text style={styles.sectionTitle}>Métricas em tempo real</Text>

      {loadingKpis ? (
        <ActivityIndicator size="large" color={CORES.roxo} style={{ marginTop: SPACING.xl }} />
      ) : (
        <View style={styles.kpiGrid}>
          {renderKpiCard(
            'calendar',
            'Eventos pendentes',
            kpis.eventosPendentes,
            CORES.laranja,
            '/admin/moderacao',
          )}
          {renderKpiCard(
            'flag',
            'Denúncias abertas',
            kpis.denunciasAbertas,
            CORES.erro,
            '/admin/moderacao',
          )}
          {renderKpiCard(
            'warning',
            'Anomalias ativas',
            kpis.anomaliasPendentes,
            '#F59E0B',
          )}
          {renderKpiCard(
            'pulse',
            'Ações (24h)',
            kpis.auditUltimas24h,
            CORES.roxoClaro,
          )}
        </View>
      )}

      <Text style={[styles.sectionTitle, { marginTop: SPACING.xl }]}>Acesso rápido</Text>

      <View style={styles.acessoRapido}>
        <TouchableOpacity
          style={styles.acessoItem}
          onPress={() => router.push('/admin/moderacao')}
        >
          <Ionicons name="shield-checkmark" size={24} color={CORES.laranja} />
          <Text style={styles.acessoLabel}>Moderação</Text>
          <Text style={styles.acessoSub}>Aprovar / rejeitar eventos</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.acessoItem}
          onPress={() => setAba('auditoria')}
        >
          <Ionicons name="document-text" size={24} color={CORES.roxoClaro} />
          <Text style={styles.acessoLabel}>Auditoria</Text>
          <Text style={styles.acessoSub}>Log de ações do sistema</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.acessoItem}
          onPress={() => setAba('anomalias')}
        >
          <Ionicons name="bug" size={24} color={CORES.erro} />
          <Text style={styles.acessoLabel}>Anomalias</Text>
          <Text style={styles.acessoSub}>Comportamentos suspeitos</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={16} color={CORES.cinzaClaro} />
        <Text style={styles.infoText}>
          Dashboard atualizado automaticamente. Puxe para baixo para recarregar os KPIs.
        </Text>
      </View>
    </ScrollView>
  );

  // ── Tab Auditoria ─────────────────────────────────────
  const TabAuditoria = () => (
    loadingAudit && auditLog.length === 0 ? (
      <ActivityIndicator size="large" color={CORES.roxo} style={{ marginTop: SPACING.xl }} />
    ) : (
      <FlatList
        data={auditLog}
        keyExtractor={item => item.id}
        renderItem={renderAuditItem}
        contentContainerStyle={styles.logList}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={CORES.roxoClaro}
          />
        }
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>Log de auditoria</Text>
            <Text style={styles.listSub}>{auditLog.length} entradas recentes</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={56} color={CORES.cinzaClaro} />
            <Text style={styles.emptyText}>Nenhum log disponível</Text>
          </View>
        }
      />
    )
  );

  // ── Tab Anomalias ─────────────────────────────────────
  const TabAnomalias = () => (
    loadingAnomalias && anomalias.length === 0 ? (
      <ActivityIndicator size="large" color={CORES.roxo} style={{ marginTop: SPACING.xl }} />
    ) : (
      <FlatList
        data={anomalias}
        keyExtractor={item => item.id}
        renderItem={renderAnomalia}
        contentContainerStyle={styles.logList}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={CORES.roxoClaro}
          />
        }
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>Anomalias ativas</Text>
            <Text style={styles.listSub}>{anomalias.length} pendentes de revisão</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="shield-checkmark" size={56} color={CORES.sucesso} />
            <Text style={styles.emptyText}>Nenhuma anomalia ativa</Text>
            <Text style={styles.emptySub}>O sistema está operando normalmente.</Text>
          </View>
        }
      />
    )
  );

  // ── Render principal ──────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)')}>
          <Ionicons name="arrow-back" size={24} color={CORES.branco} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Dashboard</Text>
          <Text style={styles.headerSub}>Painel analítico · Admin</Text>
        </View>
        <TouchableOpacity onPress={handleRefresh}>
          <Ionicons name="refresh" size={22} color={CORES.roxoClaro} />
        </TouchableOpacity>
      </View>

      {/* Abas */}
      <View style={styles.tabRow}>
        {(
          [
            { id: 'visao',     icon: 'stats-chart', label: 'Visão Geral' },
            { id: 'auditoria', icon: 'document-text', label: 'Auditoria' },
            { id: 'anomalias', icon: 'bug', label: 'Anomalias',
              badge: kpis.anomaliasPendentes },
          ] as const
        ).map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, aba === tab.id && styles.tabAtiva]}
            onPress={() => setAba(tab.id)}
          >
            <Ionicons
              name={tab.icon as any}
              size={14}
              color={aba === tab.id ? CORES.branco : CORES.cinzaClaro}
            />
            <Text style={[styles.tabText, aba === tab.id && styles.tabTextAtiva]}>
              {tab.label}
            </Text>
            {'badge' in tab && tab.badge > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: CORES.erro }]}>
                <Text style={styles.tabBadgeNum}>{tab.badge}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Conteúdo da aba */}
      {aba === 'visao'     && <TabVisaoGeral />}
      {aba === 'auditoria' && <TabAuditoria />}
      {aba === 'anomalias' && <TabAnomalias />}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Guard
  guardContainer: {
    flex: 1,
    backgroundColor: CORES.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.xl,
  },
  guardText: {
    color: CORES.branco,
    fontSize: FONT_SIZE.lg,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  guardBtn: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingVertical: 12,
    backgroundColor: CORES.roxo,
    borderRadius: RADIUS.sm,
  },
  guardBtnText: { color: CORES.branco, fontWeight: 'bold' },

  // Layout
  container: { flex: 1, backgroundColor: CORES.background, paddingTop: 50 },
  tabContent: { flex: 1, paddingHorizontal: SPACING.lg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: 'bold', color: CORES.branco },
  headerSub: { fontSize: FONT_SIZE.xs, color: CORES.cinzaClaro, marginTop: 2 },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    backgroundColor: CORES.backgroundCard,
    borderRadius: RADIUS.md,
    padding: 4,
    gap: 3,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: RADIUS.sm,
  },
  tabAtiva: { backgroundColor: CORES.roxo },
  tabText: { color: CORES.cinzaClaro, fontSize: 11, fontWeight: '600' },
  tabTextAtiva: { color: CORES.branco },
  tabBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  tabBadgeNum: { color: CORES.branco, fontSize: 9, fontWeight: 'bold' },

  // KPI
  sectionTitle: {
    color: CORES.branco,
    fontSize: FONT_SIZE.md,
    fontWeight: 'bold',
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  kpiGrid: { gap: SPACING.sm },
  kpiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CORES.backgroundCard,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderLeftWidth: 4,
    gap: SPACING.md,
  },
  kpiIconBox: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kpiTextos: { flex: 1 },
  kpiValor: { fontSize: FONT_SIZE.xxl, fontWeight: 'bold' },
  kpiLabel: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs, marginTop: 2 },

  // Acesso rápido
  acessoRapido: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  acessoItem: {
    flex: 1,
    backgroundColor: CORES.backgroundCard,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    gap: SPACING.xs,
  },
  acessoLabel: { color: CORES.branco, fontSize: FONT_SIZE.xs, fontWeight: 'bold', textAlign: 'center' },
  acessoSub: { color: CORES.cinzaClaro, fontSize: 10, textAlign: 'center' },

  // Info box
  infoBox: {
    flexDirection: 'row',
    gap: SPACING.sm,
    backgroundColor: CORES.backgroundCard,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.xl,
    alignItems: 'flex-start',
  },
  infoText: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs, flex: 1, lineHeight: 18 },

  // Audit log
  logList: { paddingHorizontal: SPACING.lg, paddingBottom: 80, gap: SPACING.sm },
  listHeader: { marginBottom: SPACING.sm },
  listSub: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs },
  logItem: {
    flexDirection: 'row',
    gap: SPACING.sm,
    backgroundColor: CORES.backgroundCard,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'flex-start',
  },
  logIconBox: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  logTextos: { flex: 1 },
  logHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 2 },
  logAcao: { color: CORES.branco, fontSize: FONT_SIZE.sm, fontWeight: '600', flex: 1 },
  sevBadge: {
    borderRadius: RADIUS.full,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sevText: { fontSize: 10, fontWeight: '700' },
  logMeta: { color: CORES.cinzaClaro, fontSize: 11 },
  logData: { color: CORES.cinza, fontSize: 10, marginTop: 2 },

  // Anomalias
  anomaliaCard: {
    backgroundColor: CORES.backgroundCard,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: CORES.erro,
  },
  anomaliaHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.sm },
  anomaliaIconBox: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: CORES.erro + '22',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  anomaliaTipo: { color: CORES.branco, fontSize: FONT_SIZE.sm, fontWeight: 'bold', textTransform: 'capitalize' },
  anomaliaUsuario: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs, marginTop: 2 },
  anomaliaData: { color: CORES.cinza, fontSize: 10 },
  anomaliaDesc: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs, lineHeight: 18, marginBottom: SPACING.sm },
  detalhesBox: {
    backgroundColor: CORES.background,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    gap: 2,
  },
  detalheItem: { color: CORES.cinzaClaro, fontSize: 11 },
  detalheKey: { color: CORES.branco, fontWeight: '600' },

  resolverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: CORES.sucesso,
    marginTop: SPACING.xs,
  },
  resolverText: { color: CORES.sucesso, fontSize: FONT_SIZE.sm, fontWeight: '600' },

  // Empty
  empty: { alignItems: 'center', marginTop: 60, gap: SPACING.sm },
  emptyText: { color: CORES.branco, fontSize: FONT_SIZE.lg, fontWeight: '600' },
  emptySub: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, textAlign: 'center' },
});
