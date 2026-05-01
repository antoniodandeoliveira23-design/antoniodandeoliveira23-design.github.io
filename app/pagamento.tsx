import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { pagamentosService, ResultadoCobranca } from '@/services/pagamentos';
import type { Plano } from '@/types';

/**
 * Tela de pagamento — integração real com Asaas.
 * Fluxo: listar planos → selecionar → criar cobrança → mostrar PIX/link → polling de status.
 */
export default function PagamentoScreen() {
  const router = useRouter();
  const { eventoNome } = useLocalSearchParams<{ eventoNome?: string }>();

  const [planos, setPlanos]               = useState<Plano[]>([]);
  const [planoSelecionado, setPlano]      = useState<string | null>(null);
  const [metodo, setMetodo]               = useState<'PIX' | 'BOLETO'>('PIX');
  const [carregando, setCarregando]       = useState(true);
  const [processando, setProcessando]     = useState(false);
  const [cobranca, setCobranca]           = useState<ResultadoCobranca | null>(null);
  const [statusPagamento, setStatus]      = useState<string>('pendente');
  const [erro, setErro]                   = useState('');
  const pollingRef                        = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    pagamentosService.listarPlanos()
      .then((data) => {
        setPlanos(data);
        if (data.length > 0) setPlano(data[0].id);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));

    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  // Polling: verifica status a cada 5s após criar cobrança
  function iniciarPolling(pagamentoId: string) {
    pollingRef.current = setInterval(async () => {
      try {
        const status = await pagamentosService.consultarStatus(pagamentoId);
        setStatus(status);
        if (status === 'pago') {
          clearInterval(pollingRef.current!);
        }
      } catch { /* ignora falhas de rede no polling */ }
    }, 5000);
  }

  const handleCriarCobranca = async () => {
    if (!planoSelecionado) return;
    setProcessando(true);
    setErro('');
    try {
      const resultado = await pagamentosService.criarCobranca(planoSelecionado, metodo);
      setCobranca(resultado);
      iniciarPolling(resultado.pagamento_id);
    } catch (e: any) {
      setErro(e.message || 'Erro ao criar cobrança.');
    } finally {
      setProcessando(false);
    }
  };

  const handleAbrirLink = () => {
    if (cobranca?.link) Linking.openURL(cobranca.link);
  };

  const handleCopiarPix = () => {
    if (cobranca?.pix_copia_cola) {
      Clipboard.setString(cobranca.pix_copia_cola);
      Alert.alert('Copiado!', 'Código PIX copiado para a área de transferência.');
    }
  };

  if (carregando) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={CORES.roxo} />
      </View>
    );
  }

  // ── Tela de cobrança gerada ──────────────────────────────────
  if (cobranca) {
    const pago = statusPagamento === 'pago';
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => { if (pollingRef.current) clearInterval(pollingRef.current); router.back(); }}>
              <Ionicons name="arrow-back" size={24} color={CORES.branco} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{pago ? 'Pago ✅' : 'Aguardando pagamento'}</Text>
            <View style={{ width: 24 }} />
          </View>

          {pago ? (
            <View style={styles.sucessoBox}>
              <View style={styles.sucessoIcon}>
                <Ionicons name="checkmark" size={48} color={CORES.branco} />
              </View>
              <Text style={styles.modalTitulo}>Pagamento confirmado!</Text>
              <Text style={styles.modalTexto}>Seu plano está ativo. Obrigado!</Text>
              <TouchableOpacity style={styles.ctaBtn} onPress={() => router.replace('/(tabs)')}>
                <Text style={styles.ctaBtnText}>Voltar ao início</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.infoBox}>
                <ActivityIndicator size="small" color={CORES.roxoClaro} />
                <Text style={styles.infoText}>Aguardando confirmação do pagamento...</Text>
              </View>

              <Text style={styles.subtitulo}>Valor: R$ {Number(cobranca.valor).toFixed(2).replace('.', ',')}</Text>
              <Text style={[styles.subtitulo, { marginTop: 4 }]}>Vencimento: {cobranca.vencimento}</Text>

              {cobranca.pix_copia_cola && (
                <TouchableOpacity style={[styles.ctaBtn, { marginTop: SPACING.lg, backgroundColor: CORES.sucesso }]} onPress={handleCopiarPix}>
                  <Ionicons name="copy-outline" size={18} color={CORES.branco} style={{ marginRight: 8 }} />
                  <Text style={styles.ctaBtnText}>Copiar código PIX</Text>
                </TouchableOpacity>
              )}

              {cobranca.link && (
                <TouchableOpacity style={[styles.ctaBtn, { marginTop: SPACING.md }]} onPress={handleAbrirLink}>
                  <Ionicons name="open-outline" size={18} color={CORES.branco} style={{ marginRight: 8 }} />
                  <Text style={styles.ctaBtnText}>Abrir página de pagamento</Text>
                </TouchableOpacity>
              )}

              <Text style={[styles.subtitulo, { textAlign: 'center', marginTop: SPACING.lg, fontSize: FONT_SIZE.xs }]}>
                Esta tela atualiza automaticamente ao confirmar o pagamento.
              </Text>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Tela de seleção de plano ─────────────────────────────────
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
              onPress={() => setPlano(plano.id)}
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

        {/* Método de pagamento */}
        <Text style={[styles.subtitulo, { marginTop: SPACING.md }]}>Forma de pagamento</Text>
        <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md }}>
          {(['PIX', 'BOLETO'] as const).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.planoCard, { flex: 1, marginBottom: 0 }, metodo === m && styles.planoCardAtivo]}
              onPress={() => setMetodo(m)}
            >
              <Text style={[styles.planoNome, { textAlign: 'center' }]}>
                {m === 'PIX' ? '⚡ PIX' : '🏦 Boleto'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={16} color={CORES.roxoClaro} />
          <Text style={styles.infoText}>
            Seu plano será ativado automaticamente após a confirmação do pagamento pelo Asaas.
          </Text>
        </View>

        {erro ? <Text style={styles.erroText}>{erro}</Text> : null}

        <TouchableOpacity
          style={[styles.ctaBtn, (processando || !planoSelecionado) && styles.ctaBtnDisabled]}
          onPress={handleCriarCobranca}
          disabled={processando || !planoSelecionado}
        >
          {processando ? (
            <ActivityIndicator color={CORES.branco} />
          ) : (
            <Text style={styles.ctaBtnText}>Gerar cobrança</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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

  infoBox: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center', backgroundColor: CORES.backgroundInput, borderRadius: RADIUS.sm, padding: SPACING.md, marginTop: SPACING.sm, marginBottom: SPACING.md },
  infoText: { flex: 1, color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs, lineHeight: 16 },

  erroText: { color: CORES.erro, fontSize: FONT_SIZE.xs, marginBottom: SPACING.sm },

  ctaBtn: { flexDirection: 'row', paddingVertical: 14, backgroundColor: CORES.roxo, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaBtnText: { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },

  sucessoBox: { alignItems: 'center', paddingTop: SPACING.xl },
  sucessoIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: CORES.sucesso, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md },
  modalTitulo: { color: CORES.branco, fontSize: FONT_SIZE.xl, fontWeight: 'bold', textAlign: 'center', marginBottom: SPACING.md },
  modalTexto: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.lg },
});
