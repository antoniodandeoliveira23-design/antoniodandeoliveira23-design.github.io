import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { FONT_SIZE, RADIUS, SPACING, type Cores } from '@/constants/theme';
import { useCores } from '@/contexts/TemaContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEventos } from '@/contexts/EventosContext';
import ModalDenuncia from '@/components/ModalDenuncia';
import MapaInterativo from '@/components/MapaInterativo';
import { produtosService } from '@/services/produtos';
import { localizacaoService, COORDS_PADRAO, type Coordenadas } from '@/services/localizacao';
import { inscricoesService } from '@/services/inscricoes';
import type { Evento, CategoriaEvento, FiltroTemporal, Produto } from '@/types';

const ICON_MAP: Record<string, string> = {
  musica: 'musical-notes',
  teatro: 'film',
  esporte: 'football',
  educacao: 'school',
  feira: 'storefront',
  cultura: 'library',
  gastronomia: 'restaurant',
  negocios: 'briefcase',
  religiao: 'heart',
  governo: 'flag',
  outro: 'ellipsis-horizontal',
};

// Categorias alinhadas ao fluxograma
const FILTROS: { value: CategoriaEvento | null; label: string; icon: string }[] = [
  { value: null, label: 'Todos', icon: 'apps' },
  { value: 'cultura', label: 'Eventos sociais', icon: 'people' },
  { value: 'musica', label: 'Cultura e lazer', icon: 'musical-notes' },
  { value: 'gastronomia', label: 'Gastronomia', icon: 'restaurant' },
  { value: 'esporte', label: 'Esporte e bem-estar', icon: 'fitness' },
  { value: 'governo', label: 'Eventos públicos', icon: 'flag' },
  { value: 'educacao', label: 'Educação profissional', icon: 'school' },
  { value: 'feira', label: 'Feiras', icon: 'storefront' },
  { value: 'negocios', label: 'Negócios', icon: 'briefcase' },
];

// Filtros temporais do fluxograma (Hoje, Semana, Mês, Semestre)
const FILTROS_TEMPO: { value: FiltroTemporal; label: string; icon: string }[] = [
  { value: 'hoje', label: 'Hoje', icon: 'today' },
  { value: 'semana', label: 'Semana', icon: 'calendar' },
  { value: 'mes', label: 'Mês', icon: 'calendar-outline' },
  { value: 'semestre', label: 'Semestre', icon: 'time' },
];

export default function HomeScreen() {
  const cores = useCores();
  const styles = createStyles(cores);
  const router = useRouter();
  const { user } = useAuth();
  const { eventos, loading, carregarEventos, buscarEventos, buscarPorRaio, filtroCategoria, filtrarPorCategoria, favoritos, favoritarEvento, desfavoritarEvento } = useEventos();

  const [busca, setBusca] = useState('');
  const [filtroTempo, setFiltroTempo] = useState<FiltroTemporal>('semana');
  const [eventoSelecionado, setEventoSelecionado] = useState<Evento | null>(null);
  const [modalVisivel, setModalVisivel] = useState(false);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [inscritos, setInscritos] = useState<Set<string>>(new Set());
  const [loadingInscricao, setLoadingInscricao] = useState<string | null>(null);

  // R8: Denúncia
  const [denunciaVisivel, setDenunciaVisivel] = useState(false);
  const [denunciaAlvoId, setDenunciaAlvoId] = useState('');

  // Item 7: Popover do marcador no mapa
  const [marcadorEvento, setMarcadorEvento] = useState<Evento | null>(null);
  const popoverAnim = useRef(new Animated.Value(0)).current;

  // Item 8: Carrossel de eventos em destaque
  const eventosDestaque = [...(eventosGeo ?? eventos)]
    .filter((e) => e.status === 'aprovado')
    .sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime())
    .slice(0, 5);

  // ── Geocoding real ──────────────────────────────────────
  const [posicaoAtual, setPosicaoAtual] = useState<Coordenadas | null>(null);
  const [loadingGeo, setLoadingGeo] = useState(true);
  const [eventosGeo, setEventosGeo] = useState<Evento[] | null>(null);
  const posicaoRef = useRef<Coordenadas | null>(null);

  // ── Filtro exclusivo mulheres ───────────────────────────
  const [filtroSomenteMultheres, setFiltroSomenteMulheres] = useState(false);

  // Mapa só renderiza depois do mount no cliente (Leaflet acessa document)
  const [mapaMontado, setMapaMontado] = useState(false);

  // Ref para ignorar a primeira execução do efeito de categoria
  // (o EventosProvider já fez o pre-fetch inicial; evita double-fetch na montagem)
  const isInitialCategoryRun = useRef(true);

  // Inicializa mapa + GPS + dados secundários em paralelo (um único efeito de montagem)
  useEffect(() => {
    setMapaMontado(true);
    inicializarGPS();

    // Produtos e inscrições carregados juntos → setState batched pelo React 18
    // sem disparar re-renders separados
    Promise.all([
      produtosService.listar(),
      user?.id ? inscricoesService.listarIds(user.id) : Promise.resolve(null),
    ]).then(([prodRes, inscritos]) => {
      setProdutos(prodRes.dados);
      if (inscritos !== null) setInscritos(inscritos);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recarrega lista SOMENTE quando categoria muda (pula montagem inicial)
  useEffect(() => {
    if (isInitialCategoryRun.current) {
      isInitialCategoryRun.current = false;
      return;
    }
    if (posicaoRef.current) {
      buscarPorRaio(posicaoRef.current.lat, posicaoRef.current.lng, 10, { categoria: filtroCategoria })
        .then((r) => setEventosGeo(r.dados))
        .catch(() => { carregarEventos(); setEventosGeo(null); });
    } else {
      carregarEventos();
    }
  }, [filtroCategoria]);

  const inicializarGPS = async () => {
    setLoadingGeo(true);
    const pos = await localizacaoService.obterPosicao();
    setLoadingGeo(false);
    if (pos) {
      posicaoRef.current = pos;
      setPosicaoAtual(pos);
      // Atualiza a lista com eventos georreferenciados em background (sem bloquear UI)
      buscarPorRaio(pos.lat, pos.lng, 10, { categoria: filtroCategoria })
        .then((r) => setEventosGeo(r.dados))
        .catch(() => { /* mantém lista já carregada */ });
    }
  };

  const atualizarLocalizacao = async () => {
    localizacaoService.limparCache();
    setLoadingGeo(true);
    const pos = await localizacaoService.obterPosicao();
    setLoadingGeo(false);
    if (pos) {
      posicaoRef.current = pos;
      setPosicaoAtual(pos);
      const r = await buscarPorRaio(pos.lat, pos.lng, 10, { categoria: filtroCategoria });
      setEventosGeo(r.dados);
    }
  };

  const handleBusca = () => {
    buscarEventos(busca);
  };

  const abrirEvento = (evento: Evento) => {
    setEventoSelecionado(evento);
    setModalVisivel(true);
  };

  const abrirMarcador = (evento: Evento) => {
    setMarcadorEvento(evento);
    Animated.spring(popoverAnim, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 120 }).start();
  };

  const fecharMarcador = () => {
    Animated.timing(popoverAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMarcadorEvento(null));
  };

  const abrirDenuncia = (eventoId: string) => {
    setDenunciaAlvoId(eventoId);
    setModalVisivel(false);
    setDenunciaVisivel(true);
  };

  const abrirDirecoes = (evento: Evento) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${evento.lat},${evento.lng}`;
    Linking.openURL(url);
  };

  const compartilharEvento = (evento: Evento) => {
    const texto = `${evento.nome} - ${evento.local}\n${new Date(evento.data_inicio).toLocaleDateString('pt-BR')}\nVeja no AGORA!`;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: evento.nome, text: texto }).catch(() => {});
    } else if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      navigator.clipboard?.writeText(texto);
    }
  };

  const toggleInscricao = async (eventoId: string) => {
    if (!user?.id || loadingInscricao === eventoId) return;
    const estaInscrito = inscritos.has(eventoId);

    // Atualização otimista
    setInscritos(prev => {
      const next = new Set(prev);
      estaInscrito ? next.delete(eventoId) : next.add(eventoId);
      return next;
    });

    setLoadingInscricao(eventoId);
    try {
      await inscricoesService.toggle(eventoId, user.id, estaInscrito);
    } catch {
      // Rollback em caso de erro
      setInscritos(prev => {
        const next = new Set(prev);
        estaInscrito ? next.add(eventoId) : next.delete(eventoId);
        return next;
      });
    } finally {
      setLoadingInscricao(null);
    }
  };

  // Filtrar por período temporal (fluxograma: Hoje, Semana, Mês, Semestre)
  const filtrarPorTempo = (evento: Evento): boolean => {
    const agora = new Date();
    const dataEvento = new Date(evento.data_inicio);
    const diffMs = dataEvento.getTime() - agora.getTime();
    const diffDias = diffMs / (1000 * 60 * 60 * 24);

    switch (filtroTempo) {
      case 'hoje': return diffDias >= -1 && diffDias <= 1;
      case 'semana': return diffDias >= -1 && diffDias <= 7;
      case 'mes': return diffDias >= -1 && diffDias <= 30;
      case 'semestre': return diffDias >= -1 && diffDias <= 180;
      default: return true;
    }
  };

  // Base: usa lista geo (GPS real) quando disponível; senão usa context
  const eventosBase = eventosGeo ?? eventos;

  // R9 + filtro temporal + filtro "só para mim"
  const eventosFiltrados = eventosBase.filter((ev) => {
    // Eventos exclusivos para mulheres: oculta para não-femininas
    if (ev.exclusivo_mulheres && user?.genero !== 'feminino') return false;
    // Filtro "só para mim": mostra apenas exclusivos (toggle de mulheres)
    if (filtroSomenteMultheres && !ev.exclusivo_mulheres) return false;
    if (!filtrarPorTempo(ev)) return false;
    return true;
  });

  const renderEventCard = ({ item }: { item: Evento }) => {
    const isFav = favoritos.includes(item.id);
    return (
      <TouchableOpacity style={styles.eventCard} onPress={() => abrirEvento(item)}>
        <View style={styles.eventCardTop}>
          <View style={styles.eventIconCircle}>
            <Ionicons name={(ICON_MAP[item.categoria] || 'calendar') as any} size={20} color={cores.laranja} />
          </View>
          <TouchableOpacity
            style={styles.favBtn}
            onPress={() => isFav ? desfavoritarEvento(item.id) : favoritarEvento(item.id)}
          >
            <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={18} color={isFav ? cores.erro : cores.cinza} />
          </TouchableOpacity>
        </View>
        <Text style={styles.eventCardName} numberOfLines={2}>{item.nome}</Text>
        <View style={styles.eventCardInfoRow}>
          <Ionicons name="location-outline" size={12} color={cores.cinzaClaro} />
          <Text style={styles.eventCardLocal} numberOfLines={1}>{item.local}</Text>
        </View>
        <View style={styles.eventCardInfoRow}>
          <Ionicons name="calendar-outline" size={12} color={cores.laranja} />
          <Text style={styles.eventCardDate}>
            {new Date(item.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
          </Text>
        </View>
        <View style={styles.cardBadgeRow}>
          {item.destaque && (
            <View style={styles.destaqueBadge}>
              <Ionicons name="star" size={10} color={cores.laranja} />
              <Text style={styles.destaqueText}>Destaque</Text>
            </View>
          )}
          {item.exclusivo_mulheres && user?.genero === 'feminino' && (
            <View style={styles.femaleBadge}>
              <Ionicons name="female" size={10} color={cores.branco} />
              <Text style={styles.femaleBadgeText}>Exclusivo</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>A</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/notificacoes')}>
              <Ionicons name="notifications-outline" size={22} color={cores.branco} />
              <View style={styles.notifBadge} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Item 8: Carrossel de eventos em destaque */}
        {eventosDestaque.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.destaqueList} style={styles.destaqueScroll}>
            {eventosDestaque.map((ev) => (
              <TouchableOpacity key={ev.id} style={styles.destaqueCard} onPress={() => abrirEvento(ev)}>
                <View style={styles.destaqueIconCircle}>
                  <Ionicons name={(ICON_MAP[ev.categoria] || 'calendar') as any} size={18} color={cores.laranja} />
                </View>
                <Text style={styles.destaqueNome} numberOfLines={2}>{ev.nome}</Text>
                <View style={styles.destaqueMeta}>
                  <Ionicons name="calendar-outline" size={10} color={cores.laranja} />
                  <Text style={styles.destaqueData}>
                    {new Date(ev.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </Text>
                </View>
                <View style={styles.destaqueCategoriaBadge}>
                  <Text style={styles.destaqueCategoriaText}>{ev.categoria.toUpperCase()}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Busca */}
        <View style={styles.searchWrapper}>
          <Ionicons name="search" size={18} color={cores.cinza} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar eventos ou lugares..."
            placeholderTextColor={cores.cinza}
            value={busca}
            onChangeText={setBusca}
            onSubmitEditing={handleBusca}
            returnKeyType="search"
          />
        </View>

        {/* Barra de status de localização GPS */}
        <TouchableOpacity style={styles.gpsBar} onPress={atualizarLocalizacao} activeOpacity={0.7}>
          <View style={styles.gpsBarLeft}>
            {loadingGeo ? (
              <ActivityIndicator size="small" color={cores.laranja} style={{ marginRight: 6 }} />
            ) : (
              <Ionicons
                name={posicaoAtual ? 'location' : 'location-outline'}
                size={14}
                color={posicaoAtual ? cores.sucesso : cores.cinza}
                style={{ marginRight: 6 }}
              />
            )}
            <Text style={[styles.gpsBarText, posicaoAtual && styles.gpsBarTextAtivo]}>
              {loadingGeo
                ? 'Localizando...'
                : posicaoAtual
                ? 'Raio: 10 km · Atualizar'
                : 'Localização desativada · Toque para ativar'}
            </Text>
          </View>
          <Ionicons name="refresh-outline" size={14} color={cores.cinza} />
        </TouchableOpacity>

        {/* Filtros de categoria - scroll horizontal */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtrosScroll} contentContainerStyle={styles.filtrosContent}>
          {FILTROS.map((f) => (
            <TouchableOpacity
              key={f.label}
              style={[styles.filtroChip, filtroCategoria === f.value && styles.filtroChipAtivo]}
              onPress={() => filtrarPorCategoria(f.value)}
            >
              <Ionicons name={f.icon as any} size={14} color={filtroCategoria === f.value ? cores.branco : cores.cinza} />
              <Text style={[styles.filtroChipText, filtroCategoria === f.value && styles.filtroChipTextAtivo]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
          {/* Chip "Só para mim" — visível apenas para usuárias femininas */}
          {user?.genero === 'feminino' && (
            <TouchableOpacity
              style={[
                styles.filtroChip,
                filtroSomenteMultheres && styles.filtroChipMulher,
              ]}
              onPress={() => setFiltroSomenteMulheres((v) => !v)}
            >
              <Ionicons
                name="female"
                size={14}
                color={filtroSomenteMultheres ? cores.branco : cores.laranja}
              />
              <Text style={[styles.filtroChipText, filtroSomenteMultheres && styles.filtroChipTextAtivo]}>
                Só para mim
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Filtros temporais (Hoje, Semana, Mês, Semestre) */}
        <View style={styles.tempoRow}>
          {FILTROS_TEMPO.map((ft) => (
            <TouchableOpacity
              key={ft.value}
              style={[styles.tempoChip, filtroTempo === ft.value && styles.tempoChipAtivo]}
              onPress={() => setFiltroTempo(ft.value)}
            >
              <Ionicons name={ft.icon as any} size={14} color={filtroTempo === ft.value ? cores.branco : cores.cinzaClaro} />
              <Text style={[styles.tempoText, filtroTempo === ft.value && styles.tempoTextAtivo]}>{ft.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Mapa interativo — renderizado apenas após mount para evitar acesso ao document durante SSR */}
        <View style={styles.mapArea}>
          {mapaMontado ? (
            <MapaInterativo
              eventos={eventosFiltrados}
              onEventoPress={(evento) => abrirEvento(evento)}
              centro={posicaoAtual ?? COORDS_PADRAO}
            />
          ) : (
            <View style={styles.mapPlaceholder}>
              <ActivityIndicator color={cores.roxo} />
            </View>
          )}
          <View style={styles.mapOverlay}>
            <Text style={styles.mapBadge}>{eventosFiltrados.length} eventos</Text>
          </View>
        </View>

        {/* Eventos section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Próximos eventos</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/eventos')}>
            <Text style={styles.sectionLink}>Ver todos</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={cores.roxo} style={{ marginTop: SPACING.lg }} />
        ) : eventosFiltrados.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum evento encontrado.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eventList}>
            {eventosFiltrados.map((item) => (
              <View key={item.id}>
                {renderEventCard({ item })}
              </View>
            ))}
          </ScrollView>
        )}

        {/* Produtos da região */}
        {produtos.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Produtos</Text>
              <TouchableOpacity onPress={() => router.push('/produtos')}>
                <Text style={styles.sectionLink}>Ver todos</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eventList}>
              {produtos.slice(0, 5).map((prod) => (
                <TouchableOpacity key={prod.id} style={styles.prodCard} onPress={() => router.push('/produtos')}>
                  <View style={styles.prodIconCircle}>
                    <Ionicons name="bag-handle" size={20} color={cores.laranja} />
                  </View>
                  <Text style={styles.prodNome} numberOfLines={2}>{prod.nome}</Text>
                  <Text style={styles.prodLocal} numberOfLines={1}>{prod.local}</Text>
                  <Text style={styles.prodPreco}>R$ {prod.preco.toFixed(2).replace('.', ',')}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}
      </ScrollView>

      {/* FAB Criar evento */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/criar-evento')}
        testID="fab-criar"
        accessibilityRole="button"
      >
        <Ionicons name="add" size={28} color={cores.branco} />
      </TouchableOpacity>

      {/* Modal Evento - Detalhe completo */}
      <Modal visible={modalVisivel} transparent animationType="slide" onRequestClose={() => setModalVisivel(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {eventoSelecionado && (
              <>
                {/* Hero — foto de capa ou ícone da categoria */}
                <View style={styles.modalHero}>
                  {eventoSelecionado.imagem_url ? (
                    <Image
                      source={{ uri: eventoSelecionado.imagem_url }}
                      style={styles.modalHeroImg}
                      contentFit="cover"
                      transition={300}
                    />
                  ) : (
                    <View style={styles.modalHeroIcon}>
                      <Ionicons
                        name={(ICON_MAP[eventoSelecionado.categoria] || 'calendar') as any}
                        size={32}
                        color={cores.laranja}
                      />
                    </View>
                  )}
                  {eventoSelecionado.destaque && (
                    <View style={styles.heroDestaque}>
                      <Ionicons name="star" size={12} color={cores.laranja} />
                      <Text style={styles.heroDestaqueText}>Destaque</Text>
                    </View>
                  )}
                </View>

                {/* Título + ações */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitulo} numberOfLines={2}>{eventoSelecionado.nome}</Text>
                  <View style={styles.headerActions}>
                    <TouchableOpacity
                      onPress={() => {
                        if (favoritos.includes(eventoSelecionado.id)) {
                          desfavoritarEvento(eventoSelecionado.id);
                        } else {
                          favoritarEvento(eventoSelecionado.id);
                        }
                      }}
                      style={styles.headerActionBtn}
                    >
                      <Ionicons
                        name={favoritos.includes(eventoSelecionado.id) ? 'heart' : 'heart-outline'}
                        size={20}
                        color={favoritos.includes(eventoSelecionado.id) ? cores.erro : cores.cinzaClaro}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => abrirDenuncia(eventoSelecionado.id)} style={styles.headerActionBtn}>
                      <Ionicons name="flag-outline" size={18} color={cores.erro} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Info rows */}
                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={16} color={cores.roxoClaro} />
                  <Text style={styles.infoText} numberOfLines={1}>{eventoSelecionado.local}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Ionicons name="calendar-outline" size={16} color={cores.roxoClaro} />
                  <Text style={styles.infoText}>
                    {new Date(eventoSelecionado.data_inicio).toLocaleDateString('pt-BR', {
                      weekday: 'short', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
                    })}
                  </Text>
                </View>

                {eventoSelecionado.exclusivo_mulheres && (
                  <View style={styles.infoRow}>
                    <Ionicons name="female" size={16} color={cores.laranja} />
                    <Text style={[styles.infoText, { color: cores.laranja }]}>Exclusivo para mulheres</Text>
                  </View>
                )}

                {eventoSelecionado.descricao ? (
                  <Text style={styles.modalDesc}>{eventoSelecionado.descricao}</Text>
                ) : null}

                {/* Badges */}
                <View style={styles.badgeRow}>
                  <View style={styles.catBadge}>
                    <Text style={styles.catBadgeText}>{eventoSelecionado.categoria.toUpperCase()}</Text>
                  </View>
                  {eventoSelecionado.comercial && (
                    <View style={styles.comercialBadge}>
                      <Text style={styles.comercialText}>Comercial</Text>
                    </View>
                  )}
                </View>
              </>
            )}

            {/* Share + Actions */}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionCircle} onPress={() => eventoSelecionado && compartilharEvento(eventoSelecionado)}>
                <Ionicons name="share-social" size={18} color={cores.roxoClaro} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionCircle} onPress={() => eventoSelecionado && abrirDirecoes(eventoSelecionado)}>
                <Ionicons name="navigate" size={18} color={cores.roxoClaro} />
              </TouchableOpacity>
            </View>

            {/* CTA row */}
            <View style={styles.ctaRow}>
              <TouchableOpacity style={styles.ctaSecundario} onPress={() => setModalVisivel(false)}>
                <Text style={styles.ctaSecundarioText}>Fechar</Text>
              </TouchableOpacity>
              {eventoSelecionado && (
                <TouchableOpacity
                  style={[
                    styles.ctaBtn,
                    inscritos.has(eventoSelecionado.id) && styles.ctaBtnInscrito,
                    loadingInscricao === eventoSelecionado.id && styles.ctaBtnLoading,
                  ]}
                  onPress={() => toggleInscricao(eventoSelecionado.id)}
                  disabled={loadingInscricao === eventoSelecionado.id}
                >
                  {loadingInscricao === eventoSelecionado.id ? (
                    <ActivityIndicator size="small" color={cores.branco} />
                  ) : (
                    <>
                      <Ionicons
                        name={inscritos.has(eventoSelecionado.id) ? 'checkmark-circle' : 'ticket'}
                        size={16}
                        color={cores.branco}
                      />
                      <Text style={styles.ctaBtnText}>
                        {inscritos.has(eventoSelecionado.id) ? 'Inscrito ✓' : 'Participar'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Item 7: Popover do marcador no mapa */}
      {marcadorEvento && (
        <Animated.View
          style={[
            styles.popoverCard,
            {
              transform: [{ translateY: popoverAnim.interpolate({ inputRange: [0, 1], outputRange: [200, 0] }) }],
              opacity: popoverAnim,
            },
          ]}
        >
          <View style={styles.popoverHeader}>
            <View style={styles.popoverHandle} />
            <TouchableOpacity style={styles.popoverCloseBtn} onPress={fecharMarcador}>
              <Ionicons name="close" size={18} color={cores.branco} />
            </TouchableOpacity>
          </View>
          <View style={styles.popoverContent}>
            <View style={styles.popoverIconCircle}>
              <Ionicons name={(ICON_MAP[marcadorEvento.categoria] || 'calendar') as any} size={24} color={cores.laranja} />
            </View>
            <View style={styles.popoverInfo}>
              <Text style={styles.popoverNome} numberOfLines={2}>{marcadorEvento.nome}</Text>
              <View style={styles.popoverMetaRow}>
                <Ionicons name="pricetag-outline" size={11} color={cores.roxoClaro} />
                <Text style={styles.popoverCategoria}>{marcadorEvento.categoria}</Text>
              </View>
              <View style={styles.popoverMetaRow}>
                <Ionicons name="calendar-outline" size={11} color={cores.laranja} />
                <Text style={styles.popoverData}>
                  {new Date(marcadorEvento.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </Text>
              </View>
              <View style={styles.popoverMetaRow}>
                <Ionicons name="location-outline" size={11} color={cores.cinzaClaro} />
                <Text style={styles.popoverLocal} numberOfLines={1}>{marcadorEvento.local}</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity style={styles.popoverDetalhesBtn} onPress={() => { fecharMarcador(); abrirEvento(marcadorEvento); }}>
            <Text style={styles.popoverDetalhesBtnText}>Ver detalhes</Text>
            <Ionicons name="chevron-forward" size={16} color={cores.branco} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* R8: Modal Denúncia */}
      <ModalDenuncia
        visivel={denunciaVisivel}
        onFechar={() => setDenunciaVisivel(false)}
        tipo="evento"
        alvoId={denunciaAlvoId}
      />
    </View>
  );
}

function createStyles(cores: Cores) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: cores.background },
    scrollContainer: { flex: 1 },
    scrollContent: { paddingBottom: 100 },

    // Header
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'web' ? 16 : 50, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
    logoBox: { width: 40, height: 40, backgroundColor: cores.preto, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    logoText: { fontSize: 20, fontWeight: 'bold', color: cores.branco },
    headerRight: { flexDirection: 'row', gap: SPACING.sm },
    headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: cores.backgroundCard, justifyContent: 'center', alignItems: 'center', position: 'relative' },
    notifBadge: { position: 'absolute', top: 8, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: cores.laranja },

    // Search
    searchWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: cores.backgroundCard, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, marginHorizontal: SPACING.lg, height: 44, gap: SPACING.sm, marginBottom: SPACING.sm },
    searchInput: { flex: 1, color: cores.branco, fontSize: FONT_SIZE.sm },

    // GPS status bar
    gpsBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: cores.backgroundCard, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, paddingVertical: 8 },
    gpsBarLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    gpsBarText: { color: cores.cinza, fontSize: 11, fontWeight: '500' },
    gpsBarTextAtivo: { color: cores.sucesso },

    // Filtros
    filtrosScroll: { maxHeight: 44, marginBottom: SPACING.sm },
    filtrosContent: { paddingHorizontal: SPACING.lg, gap: SPACING.sm },
    filtroChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: cores.backgroundCard, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, height: 36 },
    filtroChipAtivo: { backgroundColor: cores.roxo },
    filtroChipMulher: { backgroundColor: cores.laranja },
    filtroChipText: { color: cores.cinza, fontSize: FONT_SIZE.xs },
    filtroChipTextAtivo: { color: cores.branco },

    // Filtros temporais
    tempoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm, gap: SPACING.xs },
    tempoChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: cores.backgroundCard, borderRadius: RADIUS.sm, paddingVertical: 8, borderWidth: 1, borderColor: 'transparent' },
    tempoChipAtivo: { backgroundColor: cores.roxo, borderColor: cores.roxoClaro },
    tempoText: { color: cores.cinzaClaro, fontSize: 11, fontWeight: '600' },
    tempoTextAtivo: { color: cores.branco },

    // Map
    mapArea: { marginHorizontal: SPACING.lg, height: 280, borderRadius: RADIUS.lg, marginBottom: SPACING.md, position: 'relative', overflow: 'hidden' },
    mapPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: cores.backgroundCard, borderRadius: RADIUS.lg },
    mapOverlay: { position: 'absolute', top: SPACING.sm, left: SPACING.sm, zIndex: 1000 },
    mapBadge: { backgroundColor: cores.backgroundCard + 'DD', color: cores.branco, fontSize: FONT_SIZE.xs, fontWeight: '600', paddingHorizontal: SPACING.md, paddingVertical: 4, borderRadius: RADIUS.full, overflow: 'hidden' },

    // Section
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },
    sectionTitle: { color: cores.branco, fontSize: FONT_SIZE.lg, fontWeight: 'bold' },
    sectionLink: { color: cores.roxoClaro, fontSize: FONT_SIZE.sm },

    // Event cards
    eventList: { paddingHorizontal: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.sm },
    eventCard: { backgroundColor: cores.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, width: 170 },
    eventCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.sm },
    eventIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: cores.background, justifyContent: 'center', alignItems: 'center' },
    favBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: cores.background, justifyContent: 'center', alignItems: 'center' },
    eventCardName: { color: cores.branco, fontSize: FONT_SIZE.sm, fontWeight: 'bold', marginBottom: 6 },
    eventCardInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
    eventCardLocal: { color: cores.cinzaClaro, fontSize: 11, flex: 1 },
    eventCardDate: { color: cores.laranja, fontSize: 11, fontWeight: '600' },
    cardBadgeRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginTop: 6 },
    destaqueBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: cores.background, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 },
    destaqueText: { color: cores.laranja, fontSize: 10, fontWeight: '600' },
    femaleBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', backgroundColor: cores.laranja, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 },
    femaleBadgeText: { color: cores.branco, fontSize: 10, fontWeight: '700' },
    emptyText: { color: cores.cinzaClaro, fontSize: FONT_SIZE.sm, paddingHorizontal: SPACING.lg },

    // Product cards
    prodCard: { backgroundColor: cores.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, width: 150 },
    prodIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: cores.background, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
    prodNome: { color: cores.branco, fontSize: FONT_SIZE.xs, fontWeight: 'bold', marginBottom: 4 },
    prodLocal: { color: cores.cinzaClaro, fontSize: 10, marginBottom: 6 },
    prodPreco: { color: cores.laranja, fontSize: FONT_SIZE.sm, fontWeight: 'bold' },

    // Carrossel destaque (Item 8)
    destaqueScroll: { maxHeight: 140, marginBottom: SPACING.sm },
    destaqueList: { paddingHorizontal: SPACING.lg, gap: SPACING.sm },
    destaqueCard: { backgroundColor: cores.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, width: 140, gap: 6 },
    destaqueIconCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: cores.background, justifyContent: 'center', alignItems: 'center' },
    destaqueNome: { color: cores.branco, fontSize: 12, fontWeight: 'bold', lineHeight: 16 },
    destaqueMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    destaqueData: { color: cores.laranja, fontSize: 10, fontWeight: '600' },
    destaqueCategoriaBadge: { alignSelf: 'flex-start', backgroundColor: cores.background, borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 2 },
    destaqueCategoriaText: { color: cores.roxoClaro, fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },

    // FAB
    fab: { position: 'absolute', right: SPACING.lg, bottom: Platform.OS === 'web' ? 80 : 100, width: 56, height: 56, borderRadius: 28, backgroundColor: cores.roxo, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: cores.roxo, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },

    // Popover marcador mapa (Item 7)
    popoverCard: { position: 'absolute', bottom: Platform.OS === 'web' ? 80 : 100, left: SPACING.lg, right: SPACING.lg, backgroundColor: cores.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.md, elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.3, shadowRadius: 12 },
    popoverHeader: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
    popoverHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: cores.border, position: 'absolute' },
    popoverCloseBtn: { position: 'absolute', right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: cores.background, justifyContent: 'center', alignItems: 'center' },
    popoverContent: { flexDirection: 'row', gap: SPACING.md, alignItems: 'flex-start', marginBottom: SPACING.md },
    popoverIconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: cores.background, justifyContent: 'center', alignItems: 'center' },
    popoverInfo: { flex: 1, gap: 4 },
    popoverNome: { color: cores.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },
    popoverMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    popoverCategoria: { color: cores.roxoClaro, fontSize: FONT_SIZE.xs, textTransform: 'capitalize' },
    popoverData: { color: cores.laranja, fontSize: FONT_SIZE.xs, fontWeight: '600' },
    popoverLocal: { color: cores.cinzaClaro, fontSize: FONT_SIZE.xs, flex: 1 },
    popoverDetalhesBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: cores.roxo, borderRadius: RADIUS.md, padding: 12 },
    popoverDetalhesBtnText: { color: cores.branco, fontWeight: 'bold', fontSize: FONT_SIZE.sm },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: cores.overlay, justifyContent: 'center', padding: SPACING.lg },
    modalContent: { backgroundColor: cores.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.lg },
    modalHero: { height: 140, backgroundColor: cores.background, borderRadius: RADIUS.lg, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md, position: 'relative', overflow: 'hidden' },
    modalHeroImg: { width: '100%', height: 140, borderRadius: RADIUS.lg },
    modalHeroIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: cores.backgroundCard, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: cores.laranja },
    heroDestaque: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: cores.backgroundCard, borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 4 },
    heroDestaqueText: { color: cores.laranja, fontSize: 10, fontWeight: '600' },

    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.sm, gap: SPACING.sm },
    modalTitulo: { color: cores.branco, fontSize: FONT_SIZE.xl, fontWeight: 'bold', flex: 1 },
    headerActions: { flexDirection: 'row', gap: SPACING.xs },
    headerActionBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: cores.background, justifyContent: 'center', alignItems: 'center' },

    infoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
    infoText: { color: cores.cinzaClaro, fontSize: FONT_SIZE.sm, flex: 1 },

    modalDesc: { color: cores.branco, fontSize: FONT_SIZE.sm, lineHeight: 22, marginTop: SPACING.sm, marginBottom: SPACING.md },

    badgeRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md, flexWrap: 'wrap' },
    catBadge: { backgroundColor: cores.background, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: 4 },
    catBadgeText: { color: cores.roxoClaro, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    comercialBadge: { backgroundColor: cores.laranja + '33', borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: 4 },
    comercialText: { color: cores.laranja, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

    actionRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
    actionCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: cores.background, justifyContent: 'center', alignItems: 'center' },
    ctaBtnInscrito: { backgroundColor: cores.sucesso ?? '#4CAF50' },
    ctaBtnLoading: { opacity: 0.7 },
    ctaRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
    ctaSecundario: { flex: 1, paddingVertical: 12, backgroundColor: cores.background, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
    ctaSecundarioText: { color: cores.cinzaClaro, fontWeight: '600' },
    ctaBtn: { flex: 2, flexDirection: 'row', gap: 6, paddingVertical: 12, backgroundColor: cores.roxo, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
    ctaBtnText: { color: cores.branco, fontWeight: 'bold' },
  });
}
