import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { moderacaoService } from '@/services/moderacao';
import type { Evento } from '@/types';

/**
 * R4 - Painel admin de moderação.
 * Lista eventos comerciais pendentes e permite aprovar/rejeitar.
 */
export default function ModeracaoScreen() {
  const router = useRouter();
  const [pendentes, setPendentes] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState<string | null>(null);

  const [modalRejeitar, setModalRejeitar] = useState(false);
  const [eventoParaRejeitar, setEventoParaRejeitar] = useState<Evento | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');

  const carregar = async () => {
    setLoading(true);
    try {
      const data = await moderacaoService.listarPendentes();
      setPendentes(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const handleAprovar = async (evento: Evento) => {
    setProcessando(evento.id);
    try {
      await moderacaoService.aprovar(evento.id);
      setPendentes((prev) => prev.filter((e) => e.id !== evento.id));
    } finally {
      setProcessando(null);
    }
  };

  const abrirRejeitar = (evento: Evento) => {
    setEventoParaRejeitar(evento);
    setMotivoRejeicao('');
    setModalRejeitar(true);
  };

  const confirmarRejeitar = async () => {
    if (!eventoParaRejeitar || !motivoRejeicao.trim()) return;
    setProcessando(eventoParaRejeitar.id);
    try {
      await moderacaoService.rejeitar(eventoParaRejeitar.id, motivoRejeicao.trim());
      setPendentes((prev) => prev.filter((e) => e.id !== eventoParaRejeitar.id));
      setModalRejeitar(false);
      setEventoParaRejeitar(null);
    } finally {
      setProcessando(null);
    }
  };

  const renderItem = ({ item }: { item: Evento }) => {
    const isProcessing = processando === item.id;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.badgePJ}>
            <Ionicons name="business" size={12} color={CORES.laranja} />
            <Text style={styles.badgePJText}>Comercial PJ</Text>
          </View>
          <Text style={styles.cardData}>
            {new Date(item.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
          </Text>
        </View>

        <Text style={styles.cardNome}>{item.nome}</Text>
        <Text style={styles.cardLocal}>
          <Ionicons name="location-outline" size={12} color={CORES.cinzaClaro} /> {item.local}
        </Text>
        {item.descricao ? <Text style={styles.cardDesc}>{item.descricao}</Text> : null}

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={CORES.branco} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Moderação</Text>
          <Text style={styles.headerSub}>
            {pendentes.length} evento(s) aguardando aprovação
          </Text>
        </View>
        <TouchableOpacity onPress={carregar}>
          <Ionicons name="refresh" size={22} color={CORES.roxoClaro} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={CORES.roxo} style={{ marginTop: SPACING.xl }} />
      ) : (
        <FlatList
          data={pendentes}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-circle" size={48} color={CORES.sucesso} />
              <Text style={styles.emptyText}>Fila vazia!</Text>
              <Text style={styles.emptySub}>Todos os eventos foram moderados.</Text>
            </View>
          }
        />
      )}

      {/* Modal rejeitar */}
      <Modal visible={modalRejeitar} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="alert-circle" size={40} color={CORES.erro} />
            <Text style={styles.modalTitulo}>Rejeitar evento</Text>
            <Text style={styles.modalSub}>{eventoParaRejeitar?.nome}</Text>

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

            <TouchableOpacity
              style={[styles.ctaBtn, !motivoRejeicao.trim() && styles.ctaBtnDisabled]}
              onPress={confirmarRejeitar}
              disabled={!motivoRejeicao.trim()}
            >
              <Text style={styles.ctaBtnText}>Confirmar rejeição</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.background, paddingTop: 50, paddingHorizontal: SPACING.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.lg },
  headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: 'bold', color: CORES.branco },
  headerSub: { fontSize: FONT_SIZE.xs, color: CORES.cinzaClaro, marginTop: 2 },

  list: { paddingBottom: SPACING.xl, gap: SPACING.md },

  card: { backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  badgePJ: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: CORES.background, borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 4 },
  badgePJText: { color: CORES.laranja, fontSize: 10, fontWeight: '600' },
  cardData: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs },
  cardNome: { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold', marginBottom: 4 },
  cardLocal: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs, marginBottom: SPACING.xs },
  cardDesc: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs, lineHeight: 18, marginBottom: SPACING.md },

  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: RADIUS.sm },
  btnRejeitar: { backgroundColor: 'transparent', borderWidth: 1, borderColor: CORES.erro },
  btnRejeitarText: { color: CORES.erro, fontSize: FONT_SIZE.sm, fontWeight: '600' },
  btnAprovar: { backgroundColor: CORES.sucesso },
  btnAprovarText: { color: CORES.branco, fontSize: FONT_SIZE.sm, fontWeight: '600' },

  empty: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyText: { color: CORES.branco, fontSize: FONT_SIZE.lg, fontWeight: '600' },
  emptySub: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: SPACING.lg },
  modalContent: { backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.xl, alignItems: 'center' },
  modalTitulo: { color: CORES.branco, fontSize: FONT_SIZE.xl, fontWeight: 'bold', marginTop: SPACING.md },
  modalSub: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, marginBottom: SPACING.md, textAlign: 'center' },
  modalLabel: { color: CORES.branco, fontSize: FONT_SIZE.sm, fontWeight: '600', alignSelf: 'flex-start', marginBottom: SPACING.xs },
  inputWrapper: { width: '100%', backgroundColor: CORES.backgroundInput, borderRadius: RADIUS.sm, padding: SPACING.md, minHeight: 80, marginBottom: SPACING.md },
  input: { color: CORES.branco, fontSize: FONT_SIZE.sm, textAlignVertical: 'top' },
  ctaBtn: { width: '100%', paddingVertical: 14, backgroundColor: CORES.erro, borderRadius: RADIUS.sm, alignItems: 'center', marginBottom: SPACING.sm },
  ctaBtnDisabled: { opacity: 0.5 },
  ctaBtnText: { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },
  cancelarText: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, fontWeight: '600' },
});
