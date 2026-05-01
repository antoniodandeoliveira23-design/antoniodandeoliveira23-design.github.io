import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { moderacaoService } from '@/services/moderacao';
import { denunciasService } from '@/services/denuncias';
import { doisFA } from '@/services/doisFA';
import Admin2FAChallenge from '@/components/Admin2FAChallenge';
import type { Evento, Denuncia } from '@/types';

// ─────────────────────────────────────────────────────────
// Tipos de aba
// ─────────────────────────────────────────────────────────
type Aba = 'eventos' | 'denuncias';

// ─────────────────────────────────────────────────────────
// Ícone e cor por tipo de denúncia
// ─────────────────────────────────────────────────────────
const TIPO_ICON: Record<string, { icon: string; label: string }> = {
  evento:   { icon: 'calendar',       label: 'Evento'   },
  usuario:  { icon: 'person',         label: 'Usuário'  },
  mensagem: { icon: 'chatbubble',     label: 'Mensagem' },
};

// ─────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────
export default function ModeracaoScreen() {
  const router = useRouter();
  const { user } = useAuth();
  // Força re-render após 2FA verificado
  const [, setRefresh] = useState(0);

  // ── Guard: apenas admin ────────────────────────────────
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

  return <ModeracaoContent />;
}

// ─────────────────────────────────────────────────────────
// Conteúdo principal (só renderiza se admin)
// ─────────────────────────────────────────────────────────
function ModeracaoContent() {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>('eventos');

  // ── Estado — Eventos ───────────────────────────────────
  const [pendentes, setPendentes] = useState<Evento[]>([]);
  const [totalEventos, setTotalEventos] = useState(0);
  const [paginaEventos, setPaginaEventos] = useState(1);
  const [temMaisEventos, setTemMaisEventos] = useState(false);
  const [loadingEventos, setLoadingEventos] = useState(true);
  const [processando, setProcessando] = useState<string | null>(null);

  // ── Modal rejeitar ─────────────────────────────────────
  const [modalRejeitar, setModalRejeitar] = useState(false);
  const [eventoParaRejeitar, setEventoParaRejeitar] = useState<Evento | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');

  // ── Estado — Denúncias ─────────────────────────────────
  const [denuncias, setDenuncias] = useState<Denuncia[]>([]);
  const [totalDenuncias, setTotalDenuncias] = useState(0);
  const [paginaDenuncias, setPaginaDenuncias] = useState(1);
  const [temMaisDenuncias, setTemMaisDenuncias] = useState(false);
  const [loadingDenuncias, setLoadingDenuncias] = useState(true);
  const [resolvendoDenuncia, setResolvendoDenuncia] = useState<string | null>(null);

  // ── Carregar eventos (página 1, substitui lista) ───────
  const carregarEventos = useCallback(async () => {
    setLoadingEventos(true);
    try {
      const res = await moderacaoService.listarPendentes(1, 10);
      setPendentes(res.dados);
      setTotalEventos(res.total);
      setPaginaEventos(1);
      setTemMaisEventos(res.temMais);
    } finally {
      setLoadingEventos(false);
    }
  }, []);

  // ── Carregar mais eventos (append) ─────────────────────
  const carregarMaisEventos = async () => {
    if (!temMaisEventos || loadingEventos) return;
    const proxPagina = paginaEventos + 1;
    setLoadingEventos(true);
    try {
      const res = await moderacaoService.listarPendentes(proxPagina, 10);
      setPendentes(prev => [...prev, ...res.dados]);
      setPaginaEventos(proxPagina);
      setTemMaisEventos(res.temMais);
    } finally {
      setLoadingEventos(false);
    }
  };

  // ── Carregar denúncias (página 1) ──────────────────────
  const carregarDenuncias = useCallback(async () => {
    setLoadingDenuncias(true);
    try {
      const res = await denunciasService.listar({ status: 'aberta', pagina: 1, porPagina: 15 });
      setDenuncias(res.dados);
      setTotalDenuncias(res.total);
      setPaginaDenuncias(1);
      setTemMaisDenuncias(res.temMais);
    } finally {
      setLoadingDenuncias(false);
    }
  }, []);

  // ── Carregar mais denúncias (append) ───────────────────
  const carregarMaisDenuncias = async () => {
    if (!temMaisDenuncias || loadingDenuncias) return;
    const proxPagina = paginaDenuncias + 1;
    setLoadingDenuncias(true);
    try {
      const res = await denunciasService.listar({ status: 'aberta', pagina: proxPagina, porPagina: 15 });
      setDenuncias(prev => [...prev, ...res.dados]);
      setPaginaDenuncias(proxPagina);
      setTemMaisDenuncias(res.temMais);
    } finally {
      setLoadingDenuncias(false);
    }
  };

  useEffect(() => { carregarEventos(); }, []);
  useEffect(() => { if (aba === 'denuncias') carregarDenuncias(); }, [aba]);

  // ── Aprovar evento ─────────────────────────────────────
  const handleAprovar = async (evento: Evento) => {
    setProcessando(evento.id);
    try {
      await moderacaoService.aprovar(evento.id);
      await moderacaoService.notificarCriador(evento.id, 'aprovado');
      setPendentes(prev => prev.filter(e => e.id !== evento.id));
      setTotalEventos(prev => Math.max(0, prev - 1));
      Alert.alert('✅ Aprovado', `"${evento.nome}" foi aprovado e o criador foi notificado.`);
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Erro ao aprovar evento.');
    } finally {
      setProcessando(null);
    }
  };

  // ── Abrir modal rejeitar ───────────────────────────────
  const abrirRejeitar = (evento: Evento) => {
    setEventoParaRejeitar(evento);
    setMotivoRejeicao('');
    setModalRejeitar(true);
  };

  // ── Confirmar rejeição ─────────────────────────────────
  const confirmarRejeitar = async () => {
    if (!eventoParaRejeitar || !motivoRejeicao.trim()) return;
    setProcessando(eventoParaRejeitar.id);
    try {
      await moderacaoService.rejeitar(eventoParaRejeitar.id, motivoRejeicao.trim());
      await moderacaoService.notificarCriador(
        eventoParaRejeitar.id,
        'rejeitado',
        motivoRejeicao.trim(),
      );
      setPendentes(prev => prev.filter(e => e.id !== eventoParaRejeitar.id));
      setTotalEventos(prev => Math.max(0, prev - 1));
      setModalRejeitar(false);
      setEventoParaRejeitar(null);
      Alert.alert('❌ Rejeitado', 'Evento rejeitado e criador notificado.');
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Erro ao rejeitar evento.');
    } finally {
      setProcessando(null);
    }
  };

  // ── Resolver denúncia ──────────────────────────────────
  const handleResolver = (denuncia: Denuncia, resolucao: 'resolvida' | 'descartada') => {
    Alert.alert(
      resolucao === 'resolvida' ? 'Resolver denúncia' : 'Descartar denúncia',
      resolucao === 'resolvida'
        ? 'Confirma que a denúncia foi investigada e resolvida?'
        : 'Confirma que esta denúncia não procede e deve ser descartada?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          style: resolucao === 'descartada' ? 'destructive' : 'default',
          onPress: async () => {
            setResolvendoDenuncia(denuncia.id);
            try {
              await denunciasService.resolver(denuncia.id, resolucao);
              setDenuncias(prev => prev.filter(d => d.id !== denuncia.id));
              setTotalDenuncias(prev => Math.max(0, prev - 1));
            } catch (e: any) {
              Alert.alert('Erro', e.message || 'Erro ao atualizar denúncia.');
            } finally {
              setResolvendoDenuncia(null);
            }
          },
        },
      ],
    );
  };

  // ── Render card de evento ──────────────────────────────
  const renderEvento = ({ item }: { item: Evento }) => {
    const isProcessing = processando === item.id;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.badgePJ}>
            <Ionicons name="business" size={12} color={CORES.laranja} />
            <Text style={styles.badgePJText}>Comercial PJ</Text>
          </View>
          <Text style={styles.cardData}>
            {new Date(item.data_inicio).toLocaleDateString('pt-BR', {
              day: '2-digit', month: 'short', year: '2-digit',
            })}
          </Text>
        </View>

        <Text style={styles.cardNome}>{item.nome}</Text>

        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={12} color={CORES.cinzaClaro} />
          <Text style={styles.cardLocal} numberOfLines={1}>{item.local}</Text>
        </View>

        {item.criador && (
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={12} color={CORES.cinzaClaro} />
            <Text style={styles.cardLocal}>
              {item.criador.nome} {item.criador.sobrenome}
              {item.criador.verificado ? ' ✓' : ''}
            </Text>
          </View>
        )}

        {item.descricao ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{item.descricao}</Text>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, styles.btnRejeitar]}
            onPress={() => abrirRejeitar(item)}
            disabled={isProcessing}
          >
            <Ionicons name="close" size={16} color={CORES.erro} />
            <Text style={styles.btnRejeitarText}>Rejeitar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnAprovar]}
            onPress={() => handleAprovar(item)}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color={CORES.branco} />
            ) : (
              <>
                <Ionicons name="checkmark" size={16} color={CORES.branco} />
                <Text style={styles.btnAprovarText}>Aprovar</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── Render card de denúncia ────────────────────────────
  const renderDenuncia = ({ item }: { item: Denuncia }) => {
    const tipoInfo = TIPO_ICON[item.tipo] || TIPO_ICON.evento;
    const isResolving = resolvendoDenuncia === item.id;
    const statusColor =
      item.status === 'aberta' ? CORES.erro :
      item.status === 'em_analise' ? '#F59E0B' : CORES.sucesso;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.badgePJ, { borderColor: statusColor }]}>
            <Ionicons name={tipoInfo.icon as any} size={12} color={statusColor} />
            <Text style={[styles.badgePJText, { color: statusColor }]}>
              {tipoInfo.label}
            </Text>
          </View>
          <Text style={styles.cardData}>
            {new Date(item.criado_em).toLocaleDateString('pt-BR', {
              day: '2-digit', month: 'short',
            })}
          </Text>
        </View>

        <Text style={styles.cardNome}>{item.motivo}</Text>

        {item.descricao ? (
          <Text style={styles.cardDesc} numberOfLines={3}>{item.descricao}</Text>
        ) : (
          <Text style={[styles.cardDesc, { fontStyle: 'italic' }]}>
            Sem descrição adicional
          </Text>
        )}

        <View style={styles.infoRow}>
          <Ionicons name="finger-print-outline" size={12} color={CORES.cinzaClaro} />
          <Text style={styles.cardLocal} numberOfLines={1}>
            Alvo: {item.alvo_id}
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, styles.btnRejeitar]}
            onPress={() => handleResolver(item, 'descartada')}
            disabled={isResolving}
          >
            <Ionicons name="trash-outline" size={15} color={CORES.erro} />
            <Text style={styles.btnRejeitarText}>Descartar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnAprovar]}
            onPress={() => handleResolver(item, 'resolvida')}
            disabled={isResolving}
          >
            {isResolving ? (
              <ActivityIndicator size="small" color={CORES.branco} />
            ) : (
              <>
                <Ionicons name="shield-checkmark" size={15} color={CORES.branco} />
                <Text style={styles.btnAprovarText}>Resolver</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── Footer de paginação ────────────────────────────────
  const FooterEventos = () =>
    temMaisEventos ? (
      <TouchableOpacity style={styles.loadMoreBtn} onPress={carregarMaisEventos}>
        {loadingEventos ? (
          <ActivityIndicator size="small" color={CORES.roxoClaro} />
        ) : (
          <>
            <Ionicons name="chevron-down" size={16} color={CORES.roxoClaro} />
            <Text style={styles.loadMoreText}>Carregar mais</Text>
          </>
        )}
      </TouchableOpacity>
    ) : null;

  const FooterDenuncias = () =>
    temMaisDenuncias ? (
      <TouchableOpacity style={styles.loadMoreBtn} onPress={carregarMaisDenuncias}>
        {loadingDenuncias ? (
          <ActivityIndicator size="small" color={CORES.roxoClaro} />
        ) : (
          <>
            <Ionicons name="chevron-down" size={16} color={CORES.roxoClaro} />
            <Text style={styles.loadMoreText}>Carregar mais</Text>
          </>
        )}
      </TouchableOpacity>
    ) : null;

  // ── Render ─────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={CORES.branco} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Moderação</Text>
          <Text style={styles.headerSub}>Painel de administrador</Text>
        </View>
        <TouchableOpacity onPress={aba === 'eventos' ? carregarEventos : carregarDenuncias}>
          <Ionicons name="refresh" size={22} color={CORES.roxoClaro} />
        </TouchableOpacity>
      </View>

      {/* Abas */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, aba === 'eventos' && styles.tabAtiva]}
          onPress={() => setAba('eventos')}
        >
          <Ionicons
            name="calendar"
            size={15}
            color={aba === 'eventos' ? CORES.branco : CORES.cinzaClaro}
          />
          <Text style={[styles.tabText, aba === 'eventos' && styles.tabTextAtiva]}>
            Eventos
          </Text>
          {totalEventos > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeNum}>{totalEventos}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, aba === 'denuncias' && styles.tabAtiva]}
          onPress={() => setAba('denuncias')}
        >
          <Ionicons
            name="flag"
            size={15}
            color={aba === 'denuncias' ? CORES.branco : CORES.cinzaClaro}
          />
          <Text style={[styles.tabText, aba === 'denuncias' && styles.tabTextAtiva]}>
            Denúncias
          </Text>
          {totalDenuncias > 0 && (
            <View style={[styles.badge, { backgroundColor: CORES.erro }]}>
              <Text style={styles.badgeNum}>{totalDenuncias}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Aba: Eventos pendentes */}
      {aba === 'eventos' && (
        loadingEventos && pendentes.length === 0 ? (
          <ActivityIndicator size="large" color={CORES.roxo} style={{ marginTop: SPACING.xl }} />
        ) : (
          <FlatList
            data={pendentes}
            keyExtractor={item => item.id}
            renderItem={renderEvento}
            contentContainerStyle={styles.list}
            ListFooterComponent={<FooterEventos />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="checkmark-done-circle" size={56} color={CORES.sucesso} />
                <Text style={styles.emptyText}>Fila vazia!</Text>
                <Text style={styles.emptySub}>Todos os eventos foram moderados.</Text>
              </View>
            }
          />
        )
      )}

      {/* Aba: Denúncias */}
      {aba === 'denuncias' && (
        loadingDenuncias && denuncias.length === 0 ? (
          <ActivityIndicator size="large" color={CORES.roxo} style={{ marginTop: SPACING.xl }} />
        ) : (
          <FlatList
            data={denuncias}
            keyExtractor={item => item.id}
            renderItem={renderDenuncia}
            contentContainerStyle={styles.list}
            ListFooterComponent={<FooterDenuncias />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="shield-checkmark" size={56} color={CORES.sucesso} />
                <Text style={styles.emptyText}>Sem denúncias abertas</Text>
                <Text style={styles.emptySub}>Nenhuma denúncia aguardando revisão.</Text>
              </View>
            }
          />
        )
      )}

      {/* Modal rejeitar evento */}
      <Modal visible={modalRejeitar} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="alert-circle" size={40} color={CORES.erro} />
            <Text style={styles.modalTitulo}>Rejeitar evento</Text>
            <Text style={styles.modalSub} numberOfLines={2}>
              {eventoParaRejeitar?.nome}
            </Text>

            <Text style={styles.modalLabel}>Motivo da rejeição</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Descreva por que o evento foi rejeitado..."
                placeholderTextColor={CORES.cinza}
                value={motivoRejeicao}
                onChangeText={setMotivoRejeicao}
                multiline
              />
            </View>

            <Text style={styles.notifHint}>
              <Ionicons name="notifications-outline" size={12} color={CORES.cinzaClaro} />
              {' '}O criador será notificado com este motivo.
            </Text>

            <TouchableOpacity
              style={[styles.ctaBtn, !motivoRejeicao.trim() && styles.ctaBtnDisabled]}
              onPress={confirmarRejeitar}
              disabled={!motivoRejeicao.trim() || processando !== null}
            >
              {processando ? (
                <ActivityIndicator size="small" color={CORES.branco} />
              ) : (
                <Text style={styles.ctaBtnText}>Confirmar rejeição</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setModalRejeitar(false)}>
              <Text style={styles.cancelarText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  guardText: { color: CORES.branco, fontSize: FONT_SIZE.lg, fontWeight: 'bold', textAlign: 'center' },
  guardBtn: { marginTop: SPACING.md, paddingHorizontal: SPACING.xl, paddingVertical: 12, backgroundColor: CORES.roxo, borderRadius: RADIUS.sm },
  guardBtnText: { color: CORES.branco, fontWeight: 'bold' },

  // Layout
  container: { flex: 1, backgroundColor: CORES.background, paddingTop: 50 },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl, gap: SPACING.md },

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
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
  },
  tabAtiva: { backgroundColor: CORES.roxo },
  tabText: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, fontWeight: '600' },
  tabTextAtiva: { color: CORES.branco },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: CORES.laranja,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeNum: { color: CORES.branco, fontSize: 10, fontWeight: 'bold' },

  // Cards
  card: {
    backgroundColor: CORES.backgroundCard,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  badgePJ: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CORES.background,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: CORES.laranja,
  },
  badgePJText: { color: CORES.laranja, fontSize: 10, fontWeight: '600' },
  cardData: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs },
  cardNome: { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold', marginBottom: 6 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  cardLocal: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs, flex: 1 },
  cardDesc: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs, lineHeight: 18, marginTop: SPACING.xs, marginBottom: SPACING.sm },

  // Actions
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
  },
  btnRejeitar: { backgroundColor: 'transparent', borderWidth: 1, borderColor: CORES.erro },
  btnRejeitarText: { color: CORES.erro, fontSize: FONT_SIZE.sm, fontWeight: '600' },
  btnAprovar: { backgroundColor: CORES.sucesso },
  btnAprovarText: { color: CORES.branco, fontSize: FONT_SIZE.sm, fontWeight: '600' },

  // Load more
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginTop: SPACING.sm,
    backgroundColor: CORES.backgroundCard,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CORES.border,
  },
  loadMoreText: { color: CORES.roxoClaro, fontSize: FONT_SIZE.sm, fontWeight: '600' },

  // Empty
  empty: { alignItems: 'center', marginTop: 60, gap: SPACING.sm },
  emptyText: { color: CORES.branco, fontSize: FONT_SIZE.lg, fontWeight: '600' },
  emptySub: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, textAlign: 'center' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalContent: {
    backgroundColor: CORES.backgroundCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.xs,
  },
  modalTitulo: { color: CORES.branco, fontSize: FONT_SIZE.xl, fontWeight: 'bold', marginTop: SPACING.sm },
  modalSub: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, marginBottom: SPACING.sm, textAlign: 'center' },
  modalLabel: { color: CORES.branco, fontSize: FONT_SIZE.sm, fontWeight: '600', alignSelf: 'flex-start', marginTop: SPACING.sm },
  inputWrapper: {
    width: '100%',
    backgroundColor: CORES.backgroundInput,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    minHeight: 90,
    marginBottom: SPACING.xs,
  },
  input: { color: CORES.branco, fontSize: FONT_SIZE.sm, textAlignVertical: 'top' },
  notifHint: { color: CORES.cinzaClaro, fontSize: 11, alignSelf: 'flex-start', marginBottom: SPACING.md },
  ctaBtn: {
    width: '100%',
    paddingVertical: 14,
    backgroundColor: CORES.erro,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  ctaBtnDisabled: { opacity: 0.45 },
  ctaBtnText: { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },
  cancelarText: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, fontWeight: '600', paddingVertical: 4 },
});
