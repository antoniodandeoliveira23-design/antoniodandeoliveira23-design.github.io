import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { pagamentosService } from '@/services/pagamentos';
import type { Plano } from '@/types';

/**
 * R3: Tela de pagamento para PJ.
 * Fluxo: listar planos -> selecionar -> confirmar pagamento (mock) -> voltar.
 */
export default function PagamentoScreen() {
  const router = useRouter();
  const { eventoId, eventoNome } = useLocalSearchParams<{ eventoId?: string; eventoNome?: string }>();

  const [planos, setPlanos] = useState<Plano[]>([]);
  const [planoSelecionado, setPlanoSelecionado] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [modalSucesso, setModalSucesso] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await pagamentosService.listarPlanos();
        setPlanos(data);
        if (data.length > 0) setPlanoSelecionado(data[1]?.id || data[0].id);
      } catch (e: any) {
        setErro(e.message || 'Erro ao carregar planos.');
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  const handlePagar = async () => {
    if (!planoSelecionado) return;
    setProcessando(true);
    setErro('');
    try {
      const pagamento = await pagamentosService.criarPagamento(eventoId || 'demo', planoSelecionado);
      // Mock de gateway: confirmar imediatamente
      await pagamentosService.confirmarPagamento(pagamento.id);
      setModalSucesso(true);
    } catch (e: any) {
      setErro(e.message || 'Erro ao processar pagamento.');
    } finally {
      setProcessando(false);
    }
  };

  if (carregando) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={CORES.roxo} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={CORES.branco} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pagamento</Text>
          <View style={{ width: 24 }} />
        </View>

        {eventoNome ? (
          <View style={styles.eventoBox}>
            <Ionicons name="calendar" size={18} color={CORES.laranja} />
            <Text style={styles.eventoText} numberOfLines={1}>{eventoNome}</Text>
          </View>
        ) : null}

        <Text style={styles.subtitulo}>Escolha um plano para publicar seu evento comercial</Text>

        {planos.map((plano) => {
          const ativo = planoSelecionado === plano.id;
          return (
            <TouchableOpacity
              key={plano.id}
              style={[styles.planoCard, ativo && styles.planoCardAtivo]}
              onPress={() => setPlanoSelecionado(plano.id)}
            >
              <View style={styles.planoHeader}>
                <View>
                  <Text style={styles.planoNome}>{plano.nome}</Text>
                  <Text style={styles.planoDesc}>{plano.descricao}</Text>
                </View>
                <View style={styles.planoPrecoBox}>
                  <Text style={styles.planoMoeda}>R$</Text>
                  <Text style={styles.planoPreco}>{plano.preco.toFixed(2).replace('.', ',')}</Text>
                </View>
              </View>
              <View style={styles.planoFeatures}>
                <View style={styles.planoFeature}>
                  <Ionicons name="checkmark-circle" size={14} color={CORES.sucesso} />
                  <Text style={styles.planoFeatureText}>{plano.max_eventos} evento(s)</Text>
                </View>
                {plano.destaque_incluso && (
                  <View style={styles.planoFeature}>
                    <Ionicons name="star" size={14} color={CORES.laranja} />
                    <Text style={styles.planoFeatureText}>Destaque no mapa</Text>
                  </View>
                )}
              </View>
              {ativo && (
                <View style={styles.planoCheck}>
                  <Ionicons name="checkmark" size={16} color={CORES.branco} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={16} color={CORES.roxoClaro} />
          <Text style={styles.infoText}>
            Seu evento só será publicado após o pagamento ser confirmado e passar pela aprovação da moderação.
          </Text>
        </View>

        {erro ? <Text style={styles.erroText}>{erro}</Text> : null}

        <TouchableOpacity
          style={[styles.ctaBtn, (processando || !planoSelecionado) && styles.ctaBtnDisabled]}
          onPress={handlePagar}
          disabled={processando || !planoSelecionado}
        >
          {processando ? (
            <ActivityIndicator color={CORES.branco} />
          ) : (
            <Text style={styles.ctaBtnText}>Confirmar pagamento</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Sucesso */}
      <Modal visible={modalSucesso} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.sucessoIcon}>
              <Ionicons name="checkmark" size={48} color={CORES.branco} />
            </View>
            <Text style={styles.modalTitulo}>Pagamento aprovado!</Text>
            <Text style={styles.modalTexto}>
              Seu evento foi enviado para moderação. Você receberá uma notificação assim que for aprovado.
            </Text>
            <TouchableOpacity
              style={styles.ctaBtn}
              onPress={() => {
                setModalSucesso(false);
                router.replace('/(tabs)');
              }}
            >
              <Text style={styles.ctaBtnText}>Voltar ao início</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.background },
  center: { justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: SPACING.lg, paddingTop: 50, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.lg },
  headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: 'bold', color: CORES.branco },

  eventoBox: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.sm, padding: SPACING.md, marginBottom: SPACING.md },
  eventoText: { flex: 1, color: CORES.branco, fontSize: FONT_SIZE.sm, fontWeight: '600' },

  subtitulo: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, marginBottom: SPACING.lg },

  planoCard: { backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 2, borderColor: 'transparent', position: 'relative' },
  planoCardAtivo: { borderColor: CORES.laranja },
  planoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  planoNome: { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },
  planoDesc: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs, marginTop: 4, maxWidth: 200 },
  planoPrecoBox: { flexDirection: 'row', alignItems: 'flex-start' },
  planoMoeda: { color: CORES.laranja, fontSize: FONT_SIZE.xs, fontWeight: '600', marginTop: 4 },
  planoPreco: { color: CORES.laranja, fontSize: FONT_SIZE.xl, fontWeight: 'bold', marginLeft: 2 },
  planoFeatures: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm },
  planoFeature: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  planoFeatureText: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs },
  planoCheck: { position: 'absolute', top: 12, right: 12, width: 22, height: 22, borderRadius: 11, backgroundColor: CORES.laranja, justifyContent: 'center', alignItems: 'center' },

  infoBox: { flexDirection: 'row', gap: SPACING.sm, backgroundColor: CORES.backgroundInput, borderRadius: RADIUS.sm, padding: SPACING.md, marginTop: SPACING.sm, marginBottom: SPACING.md },
  infoText: { flex: 1, color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs, lineHeight: 16 },

  erroText: { color: CORES.erro, fontSize: FONT_SIZE.xs, marginBottom: SPACING.sm },

  ctaBtn: { paddingVertical: 14, backgroundColor: CORES.roxo, borderRadius: RADIUS.sm, alignItems: 'center' },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaBtnText: { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: SPACING.lg },
  modalContent: { backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.xl, alignItems: 'center' },
  sucessoIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: CORES.sucesso, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md },
  modalTitulo: { color: CORES.branco, fontSize: FONT_SIZE.xl, fontWeight: 'bold', textAlign: 'center', marginBottom: SPACING.md },
  modalTexto: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.lg },
});
