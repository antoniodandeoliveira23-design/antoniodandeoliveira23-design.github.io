import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useRef, useState, useMemo, Suspense } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
const DateTimePicker = React.lazy(() =>
  import('@react-native-community/datetimepicker').then((mod) => ({ default: mod.default }))
);
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useEventos } from '@/contexts/EventosContext';
import { validacaoSemantica } from '@/services/validacao-semantica';
import { registrarAnomalia } from '@/services/auditoria';
import { localizacaoService, COORDS_PADRAO, type Coordenadas } from '@/services/localizacao';
import { storageService } from '@/services/storage';
import ImageUpload from '@/components/ImageUpload';
import type { CategoriaEvento } from '@/types';

const CATEGORIAS: { value: CategoriaEvento; label: string; icon: string }[] = [
  { value: 'musica', label: 'Música', icon: 'musical-notes' },
  { value: 'teatro', label: 'Teatro', icon: 'film' },
  { value: 'esporte', label: 'Esporte', icon: 'football' },
  { value: 'educacao', label: 'Educação', icon: 'school' },
  { value: 'feira', label: 'Feira', icon: 'storefront' },
  { value: 'cultura', label: 'Cultura', icon: 'library' },
  { value: 'gastronomia', label: 'Gastronomia', icon: 'restaurant' },
  { value: 'negocios', label: 'Negócios', icon: 'briefcase' },
  { value: 'religiao', label: 'Religião', icon: 'heart' },
  { value: 'outro', label: 'Outro', icon: 'ellipsis-horizontal' },
];

export default function CriarEvento() {
  const router = useRouter();
  const { user } = useAuth();
  const { criarEvento } = useEventos();

  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [local, setLocal] = useState('');
  const [categoria, setCategoria] = useState<CategoriaEvento>('outro');
  const [exclusivoMulheres, setExclusivoMulheres] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [modalSucesso, setModalSucesso] = useState(false);

  // ── DateTimePicker nativo ─────────────────────────────────────
  // Web usa <input type="datetime-local"> diretamente no JSX
  const [dataObj, setDataObj]                   = useState<Date | null>(null);
  const [dataInicioWeb, setDataInicioWeb]       = useState('');          // só web
  const [pickerVisivel, setPickerVisivel]       = useState(false);
  const [pickerModo, setPickerModo]             = useState<'date' | 'time'>('date');
  // Valor temporário iOS (o picker iOS não fecha ao selecionar — aguarda OK)
  const [pickerTempIOS, setPickerTempIOS]       = useState<Date>(new Date());

  /** Texto legível exibido no campo */
  const dataFormatada = dataObj
    ? dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' às ' +
      dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : 'Toque para selecionar';

  /** Abre o picker de data (primeiro passo) */
  const abrirPickerData = () => {
    setPickerTempIOS(dataObj ?? new Date());
    setPickerModo('date');
    setPickerVisivel(true);
  };

  /**
   * Handler unificado Android.
   * Android fecha automaticamente ao pressionar OK → onChange dispara uma vez.
   * Encadeamos: data → depois hora → fecha tudo.
   */
  const onChangeAndroid = (_evt: DateTimePickerEvent, selected?: Date) => {
    setPickerVisivel(false);
    if (!selected) return;

    if (pickerModo === 'date') {
      const base = dataObj ? new Date(dataObj) : new Date();
      base.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setDataObj(base);
      // Abre imediatamente o picker de hora
      setTimeout(() => {
        setPickerModo('time');
        setPickerVisivel(true);
      }, 80);
    } else {
      // hora selecionada
      const base = dataObj ? new Date(dataObj) : new Date();
      base.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setDataObj(base);
    }
  };

  /**
   * Handler iOS — o picker spinner é inline, não fecha sozinho.
   * Captura valor temporário; confirma via botão "OK".
   */
  const onChangeIOS = (_evt: DateTimePickerEvent, selected?: Date) => {
    if (selected) setPickerTempIOS(selected);
  };

  const confirmarPickerIOS = () => {
    if (pickerModo === 'date') {
      const base = dataObj ? new Date(dataObj) : new Date();
      base.setFullYear(pickerTempIOS.getFullYear(), pickerTempIOS.getMonth(), pickerTempIOS.getDate());
      setDataObj(base);
      // Avança para hora no mesmo modal
      setPickerModo('time');
      setPickerTempIOS(base);
    } else {
      const base = dataObj ? new Date(dataObj) : new Date();
      base.setHours(pickerTempIOS.getHours(), pickerTempIOS.getMinutes(), 0, 0);
      setDataObj(base);
      setPickerVisivel(false);
      setPickerModo('date');
    }
  };

  const cancelarPickerIOS = () => {
    setPickerVisivel(false);
    setPickerModo('date');
  };

  // Geocoding: GPS ao focar + Nominatim ao sair do campo (maior precisão)
  const coordsRef            = useRef<Coordenadas>(COORDS_PADRAO);
  const geocodadoPorNominatim = useRef(false);

  const geocodificarEndereco = async (texto: string) => {
    if (!texto.trim()) return;
    try {
      const q = encodeURIComponent(texto + ', Rondônia, Brasil');
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } },
      );
      const data = await res.json();
      if (data?.[0]?.lat && data?.[0]?.lon) {
        coordsRef.current = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        geocodadoPorNominatim.current = true;
      }
    } catch {
      // Nominatim indisponível — mantém GPS ou COORDS_PADRAO
    }
  };

  // Imagem do evento
  const [imagemUrl, setImagemUrl] = useState<string | undefined>();
  const campoCaminhoImagem = useMemo(
    () => storageService.gerarCaminho(user?.id || 'demo'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // R2: Modal de bloqueio comercial
  const [modalBloqueio, setModalBloqueio] = useState(false);
  const [termosComerciais, setTermosComerciais] = useState<string[]>([]);
  // R7: Modal de conta Gov não verificada
  const [modalGovNaoVerificado, setModalGovNaoVerificado] = useState(false);

  const handleCriar = async () => {
    setErro('');

    if (!nome.trim() || !local.trim()) {
      setErro('Preencha nome e endereço do evento.');
      return;
    }

    // R7: Conta Gov precisa estar verificada antes de publicar
    if (user?.tipo_conta === 'gov' && !user?.verificado) {
      setModalGovNaoVerificado(true);
      return;
    }

    // R1/R6: Validação semântica completa (comercial + spam + ódio)
    const textoCompleto = nome + ' ' + descricao;

    // Para PF/Gov: bloqueia conteúdo comercial via analisar('evento')
    if (user?.tipo_conta === 'pf' || user?.tipo_conta === 'gov') {
      const analise = validacaoSemantica.analisar(textoCompleto, 'evento');

      if (analise.bloqueado) {
        const termos = analise.termosComerciais.length > 0
          ? analise.termosComerciais
          : analise.alertas;
        setTermosComerciais(termos);
        setModalBloqueio(true);

        // Registra anomalia quando conteúdo comercial é detectado em conta PF/Gov
        registrarAnomalia({
          userId: user?.id,
          tipo: 'conteudo_suspeito',
          descricao: `Evento bloqueado por conteúdo comercial detectado em conta ${user.tipo_conta.toUpperCase()}`,
          detalhes: {
            contexto: 'evento',
            nome_evento: nome.trim().substring(0, 80),
            tipo_conta: user.tipo_conta,
            score: analise.score,
            termos: termos.slice(0, 5),
          },
        });
        return;
      }
    } else {
      // Para PJ/Admin: apenas spam + ódio (comercial é permitido)
      const analise = validacaoSemantica.analisar(textoCompleto, 'produto');
      if (analise.bloqueado) {
        setErro(analise.motivo ?? 'Conteúdo não permitido. Revise o nome e descrição.');
        registrarAnomalia({
          userId: user?.id,
          tipo: 'conteudo_suspeito',
          descricao: `Evento bloqueado por conteúdo ofensivo/spam em conta ${user?.tipo_conta?.toUpperCase()}`,
          detalhes: {
            contexto: 'evento',
            nome_evento: nome.trim().substring(0, 80),
            score: analise.score,
            motivos: analise.alertas.slice(0, 3),
          },
        });
        return;
      }
    }

    setCarregando(true);
    try {
      // Usa GPS real se disponível; senão usa coordenadas padrão de Vilhena-RO
      const { lat: latitude, lng: longitude } = coordsRef.current;

      const eventoCriado = await criarEvento(
        {
          nome: nome.trim(),
          descricao: descricao.trim(),
          local: local.trim(),
          lat: latitude,
          lng: longitude,
          categoria,
          data_inicio: Platform.OS === 'web'
            ? (dataInicioWeb ? new Date(dataInicioWeb).toISOString() : new Date().toISOString())
            : (dataObj ? dataObj.toISOString() : new Date().toISOString()),
          exclusivo_mulheres: exclusivoMulheres,
          imagem_url: imagemUrl,
        },
        user?.tipo_conta as 'pf' | 'pj' | 'gov' | 'admin' | undefined,
        user?.verificado,
      );

      if (user?.tipo_conta === 'pj') {
        // R3: PJ precisa pagar -> redirecionar para tela de pagamento
        router.replace({
          pathname: '/pagamento',
          params: { eventoId: eventoCriado?.id || 'novo', eventoNome: nome.trim() },
        });
      } else {
        setModalSucesso(true);
      }
    } catch (e: any) {
      if (e.message === 'BLOQUEIO_COMERCIAL') {
        setModalBloqueio(true);
      } else {
        setErro(e.message || 'Erro ao criar evento.');
      }
    } finally {
      setCarregando(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={CORES.branco} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Criar Evento</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Tipo de conta badge */}
        {user?.tipo_conta === 'pj' && (
          <View style={styles.badge}>
            <MaterialCommunityIcons name="office-building" size={14} color={CORES.laranja} />
            <Text style={styles.badgeText}>Evento Comercial (PJ)</Text>
          </View>
        )}

        {/* Imagem de capa do evento */}
        <Text style={styles.label}>Foto de capa</Text>
        <View style={styles.imagemCapaWrapper}>
          <ImageUpload
            bucket="eventos"
            caminho={campoCaminhoImagem}
            urlAtual={imagemUrl}
            onUpload={setImagemUrl}
            shape="rect"
            width={320}
            height={160}
            label="Adicionar foto de capa"
          />
        </View>

        {/* Form */}
        <Text style={styles.label}>Nome do evento</Text>
        <View style={styles.inputWrapper}>
          <TextInput style={styles.input} placeholder="Ex: Festival de Música" placeholderTextColor={CORES.cinza} value={nome} onChangeText={setNome} />
        </View>

        <Text style={styles.label}>Descrição</Text>
        <View style={[styles.inputWrapper, { height: 100, alignItems: 'flex-start', paddingTop: 12 }]}>
          <TextInput style={[styles.input, { textAlignVertical: 'top' }]} placeholder="Descreva o evento..." placeholderTextColor={CORES.cinza} value={descricao} onChangeText={setDescricao} multiline />
        </View>

        <Text style={styles.label}>Endereço</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="location-outline" size={18} color={CORES.cinza} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Av. Brasil, 123 - Vilhena, RO"
            placeholderTextColor={CORES.cinza}
            value={local}
            onChangeText={(text) => { setLocal(text); geocodadoPorNominatim.current = false; }}
            onFocus={() => {
              if (!geocodadoPorNominatim.current) {
                localizacaoService.obterPosicao().then((pos) => {
                  if (pos && !geocodadoPorNominatim.current) coordsRef.current = pos;
                });
              }
            }}
            onBlur={() => geocodificarEndereco(local)}
          />
        </View>

        <Text style={styles.label}>Data e hora</Text>

        {/* ── Web: input nativo HTML ─────────────────────────── */}
        {Platform.OS === 'web' ? (
          <View style={styles.inputWrapper}>
            <Ionicons name="calendar-outline" size={18} color={CORES.cinza} style={styles.inputIcon} />
            <input
              type="datetime-local"
              value={dataInicioWeb}
              onChange={(e: any) => setDataInicioWeb(e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#FFFFFF',
                fontSize: 14,
                fontFamily: 'inherit',
                colorScheme: 'dark',
              }}
            />
          </View>
        ) : (
          /* ── iOS / Android: DateTimePicker nativo ─────────── */
          <TouchableOpacity style={styles.inputWrapper} onPress={abrirPickerData} activeOpacity={0.8}>
            <Ionicons name="calendar-outline" size={18} color={CORES.cinza} style={styles.inputIcon} />
            <Text style={[styles.input, !dataObj && { color: CORES.cinza }]}>
              {dataFormatada}
            </Text>
            <Ionicons name="chevron-down" size={16} color={CORES.cinza} />
          </TouchableOpacity>
        )}

        {/* ── Android: DateTimePicker renderizado fora do modal ─ */}
        {Platform.OS === 'android' && pickerVisivel && (
          <Suspense fallback={null}>
            <DateTimePicker
              value={dataObj ?? new Date()}
              mode={pickerModo}
              display="default"
              onChange={onChangeAndroid}
              minimumDate={new Date()}
            />
          </Suspense>
        )}

        {/* ── iOS: Modal com spinner + botões Cancelar / OK ──── */}
        {Platform.OS === 'ios' && (
          <Modal visible={pickerVisivel} transparent animationType="slide">
            <View style={styles.pickerOverlay}>
              <View style={styles.pickerContainer}>
                {/* Cabeçalho */}
                <View style={styles.pickerHeader}>
                  <TouchableOpacity onPress={cancelarPickerIOS}>
                    <Text style={styles.pickerCancelar}>Cancelar</Text>
                  </TouchableOpacity>
                  <Text style={styles.pickerTitulo}>
                    {pickerModo === 'date' ? '📅 Escolha a data' : '🕐 Escolha o horário'}
                  </Text>
                  <TouchableOpacity onPress={confirmarPickerIOS}>
                    <Text style={styles.pickerConfirmar}>
                      {pickerModo === 'date' ? 'Próximo' : 'OK'}
                    </Text>
                  </TouchableOpacity>
                </View>
                {/* Spinner */}
                <Suspense fallback={null}>
                  <DateTimePicker
                    value={pickerTempIOS}
                    mode={pickerModo}
                    display="spinner"
                    onChange={onChangeIOS}
                    minimumDate={pickerModo === 'date' ? new Date() : undefined}
                    locale="pt-BR"
                    textColor="#FFFFFF"
                    themeVariant="dark"
                    style={styles.pickerSpinner}
                  />
                </Suspense>
              </View>
            </View>
          </Modal>
        )}

        {/* Categoria */}
        <Text style={styles.label}>Categoria</Text>
        <View style={styles.catGrid}>
          {CATEGORIAS.map((cat) => (
            <TouchableOpacity
              key={cat.value}
              style={[styles.catChip, categoria === cat.value && styles.catChipAtivo]}
              onPress={() => setCategoria(cat.value)}
            >
              <Ionicons name={cat.icon as any} size={16} color={categoria === cat.value ? CORES.laranja : CORES.cinza} />
              <Text style={[styles.catChipText, categoria === cat.value && styles.catChipTextAtivo]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* R9: Exclusivo mulheres */}
        <View style={styles.switchRow}>
          <View style={styles.switchInfo}>
            <Text style={styles.switchLabel}>Exclusivo para mulheres</Text>
            <Text style={styles.switchDesc}>Evento visível apenas para usuárias femininas.</Text>
          </View>
          <Switch
            value={exclusivoMulheres}
            onValueChange={setExclusivoMulheres}
            trackColor={{ false: CORES.border, true: CORES.roxo }}
            thumbColor={exclusivoMulheres ? CORES.laranja : CORES.cinza}
          />
        </View>

        {erro ? <Text style={styles.erroText}>{erro}</Text> : null}

        <TouchableOpacity style={[styles.ctaBtn, carregando && styles.ctaBtnDisabled]} onPress={handleCriar} disabled={carregando}>
          {carregando ? (
            <ActivityIndicator color={CORES.branco} />
          ) : (
            <Text style={styles.ctaBtnText}>
              {user?.tipo_conta === 'pj' ? 'Criar e Pagar' : 'Publicar Evento'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* ==================== R2: Modal de Bloqueio Comercial ==================== */}
      <Modal visible={modalBloqueio} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="alert-circle" size={48} color={CORES.laranja} />
            <Text style={styles.modalTitulo}>Conteúdo comercial detectado</Text>
            <Text style={styles.modalTexto}>
              {user?.tipo_conta === 'gov'
                ? 'Identificamos linguagem comercial. Contas Governamentais só podem divulgar eventos públicos, não comerciais.'
                : 'Identificamos linguagem comercial no seu evento. Contas de Pessoa Física não podem publicar conteúdo comercial.'}
            </Text>

            {termosComerciais.length > 0 && (
              <View style={styles.termosBox}>
                <Text style={styles.termosLabel}>Termos detectados:</Text>
                <Text style={styles.termosLista}>{termosComerciais.join(', ')}</Text>
              </View>
            )}

            {user?.tipo_conta === 'gov' ? (
              <Text style={styles.modalTexto}>
                Remova termos comerciais do seu evento ou use uma conta Empresarial (PJ) para divulgar conteúdo comercial.
              </Text>
            ) : (
              <>
                <Text style={styles.modalTexto}>
                  Para divulgar eventos comerciais, crie uma conta Empresarial (PJ).
                </Text>
                <TouchableOpacity style={styles.ctaBtn} onPress={() => { setModalBloqueio(false); router.push('/register'); }}>
                  <Text style={styles.ctaBtnText}>Criar conta Empresarial</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.modalFechar} onPress={() => setModalBloqueio(false)}>
              <Text style={styles.modalFecharText}>Editar meu evento</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ==================== Modal de Sucesso ==================== */}
      <Modal visible={modalSucesso} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="checkmark-circle" size={56} color={CORES.sucesso} />
            <Text style={styles.modalTitulo}>Evento publicado!</Text>
            <Text style={styles.modalTexto}>
              Seu evento já está visível no mapa para todos os usuários da região.
            </Text>
            <TouchableOpacity style={[styles.ctaBtn, { backgroundColor: CORES.sucesso }]} onPress={() => { setModalSucesso(false); router.back(); }}>
              <Text style={styles.ctaBtnText}>Voltar ao início</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ==================== R7: Modal Gov não verificado ==================== */}
      <Modal visible={modalGovNaoVerificado} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="shield-checkmark-outline" size={48} color={CORES.laranja} />
            <Text style={styles.modalTitulo}>Conta não verificada</Text>
            <Text style={styles.modalTexto}>
              Contas Governamentais precisam passar por um processo de verificação antes de publicar eventos.
            </Text>
            <Text style={styles.modalTexto}>
              Nossa equipe irá validar seu vínculo institucional. Você receberá uma notificação quando a verificação for concluída.
            </Text>
            <TouchableOpacity style={styles.ctaBtn} onPress={() => setModalGovNaoVerificado(false)}>
              <Text style={styles.ctaBtnText}>Entendi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.background },
  scroll: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingTop: 50, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xl },
  headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: 'bold', color: CORES.branco },
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, gap: 6, marginBottom: SPACING.lg },
  badgeText: { color: CORES.laranja, fontSize: FONT_SIZE.xs, fontWeight: '600' },

  imagemCapaWrapper: { alignItems: 'center', marginBottom: SPACING.lg },

  label: { color: CORES.branco, fontSize: FONT_SIZE.sm, fontWeight: '600', marginBottom: SPACING.xs },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: CORES.backgroundInput, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, height: 48, marginBottom: SPACING.md },
  inputIcon: { marginRight: SPACING.sm },
  input: { flex: 1, color: CORES.branco, fontSize: FONT_SIZE.sm },

  // Categorias
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.lg },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderWidth: 1, borderColor: 'transparent' },
  catChipAtivo: { borderColor: CORES.laranja },
  catChipText: { color: CORES.cinza, fontSize: FONT_SIZE.xs },
  catChipTextAtivo: { color: CORES.laranja },

  // Switch R9
  switchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg },
  switchInfo: { flex: 1 },
  switchLabel: { color: CORES.branco, fontSize: FONT_SIZE.sm, fontWeight: '600' },
  switchDesc: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs, marginTop: 4 },

  erroText: { color: CORES.erro, fontSize: FONT_SIZE.xs, marginBottom: SPACING.sm },

  // DateTimePicker iOS modal
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: '#1E0F38',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  pickerTitulo: {
    color: CORES.branco,
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
  },
  pickerCancelar: {
    color: CORES.cinzaClaro,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  pickerConfirmar: {
    color: CORES.roxoClaro,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
  pickerSpinner: {
    height: 200,
  },

  ctaBtn: { paddingVertical: 14, backgroundColor: CORES.roxo, borderRadius: RADIUS.sm, alignItems: 'center', marginTop: SPACING.sm },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaBtnText: { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },

  // Modal R2
  modalOverlay: { flex: 1, backgroundColor: CORES.overlay, justifyContent: 'center', padding: SPACING.lg },
  modalContent: { backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.xl, alignItems: 'center' },
  modalTitulo: { color: CORES.branco, fontSize: FONT_SIZE.xl, fontWeight: 'bold', textAlign: 'center', marginTop: SPACING.md, marginBottom: SPACING.md },
  modalTexto: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.md },
  termosBox: { backgroundColor: CORES.background, borderRadius: RADIUS.sm, padding: SPACING.md, width: '100%', marginBottom: SPACING.md },
  termosLabel: { color: CORES.laranja, fontSize: FONT_SIZE.xs, fontWeight: '600', marginBottom: 4 },
  termosLista: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs },
  modalFechar: { marginTop: SPACING.sm },
  modalFecharText: { color: CORES.roxoClaro, fontSize: FONT_SIZE.sm, fontWeight: '600' },
});
