import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
} from 'react-native';
import { FONT_SIZE, RADIUS, SPACING, type Cores } from '@/constants/theme';
import { useCores } from '@/contexts/TemaContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEventos } from '@/contexts/EventosContext';
import ModalDenuncia from '@/components/ModalDenuncia';
import type { Evento, CategoriaEvento } from '@/types';

const ICON_MAP: Record<string, string> = {
  musica: 'musical-notes', teatro: 'film', esporte: 'football', educacao: 'school',
  feira: 'storefront', cultura: 'library', gastronomia: 'restaurant',
  negocios: 'briefcase', religiao: 'heart', governo: 'flag', outro: 'calendar',
};

const FILTROS: { value: CategoriaEvento | null; label: string }[] = [
  { value: null, label: 'Todos' },
  { value: 'musica', label: 'Música' },
  { value: 'esporte', label: 'Esporte' },
  { value: 'cultura', label: 'Cultura' },
  { value: 'educacao', label: 'Educação' },
  { value: 'feira', label: 'Feiras' },
  { value: 'gastronomia', label: 'Gastronomia' },
  { value: 'negocios', label: 'Negócios' },
];

export default function EventosScreen() {
  const cores = useCores();
  const styles = createStyles(cores);
  const { user } = useAuth();
  const { eventos, loading, carregarEventos, buscarEventos, filtroCategoria, filtrarPorCategoria, favoritarEvento, desfavoritarEvento, favoritos } = useEventos();

  const [busca, setBusca] = useState('');
  const [eventoSelecionado, setEventoSelecionado] = useState<Evento | null>(null);
  const [modalVisivel, setModalVisivel] = useState(false);
  const [denunciaVisivel, setDenunciaVisivel] = useState(false);
  const [denunciaAlvoId, setDenunciaAlvoId] = useState('');

  useEffect(() => { carregarEventos(); }, [filtroCategoria]);

  const handleBusca = () => { buscarEventos(busca); };

  // R9: filtrar eventos exclusivos mulheres
  const eventosFiltrados = eventos.filter((ev) => {
    if (ev.exclusivo_mulheres && user?.genero !== 'feminino') return false;
    return true;
  });

  const toggleFavorito = (id: string) => {
    if (favoritos.includes(id)) desfavoritarEvento(id);
    else favoritarEvento(id);
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

  const renderEvento = ({ item }: { item: Evento }) => {
    const isFav = favoritos.includes(item.id);
    return (
      <TouchableOpacity style={styles.card} onPress={() => { setEventoSelecionado(item); setModalVisivel(true); }}>
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
          {item.destaque && (
            <View style={styles.destaqueBadge}>
              <Ionicons name="star" size={10} color={cores.laranja} />
              <Text style={styles.destaqueText}>Destaque</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.favBtn} onPress={() => toggleFavorito(item.id)}>
          <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={20} color={isFav ? cores.erro : cores.cinza} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Eventos</Text>

      {/* Busca */}
      <View style={styles.searchWrapper}>
        <Ionicons name="search" size={18} color={cores.cinza} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar eventos..."
          placeholderTextColor={cores.cinza}
          value={busca}
          onChangeText={setBusca}
          onSubmitEditing={handleBusca}
          returnKeyType="search"
        />
      </View>

      {/* Filtros */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtrosScroll} contentContainerStyle={styles.filtrosContent}>
        {FILTROS.map((f) => (
          <TouchableOpacity
            key={f.label}
            style={[styles.filtroChip, filtroCategoria === f.value && styles.filtroChipAtivo]}
            onPress={() => filtrarPorCategoria(f.value)}
          >
            <Text style={[styles.filtroChipText, filtroCategoria === f.value && styles.filtroChipTextAtivo]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Contagem */}
      <Text style={styles.subtitulo}>{eventosFiltrados.length} eventos encontrados</Text>

      {loading ? (
        <ActivityIndicator size="large" color={cores.roxo} style={{ marginTop: SPACING.xl }} />
      ) : (
        <FlatList
          data={eventosFiltrados}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={renderEvento}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="search" size={48} color={cores.roxo} />
              <Text style={styles.emptyTitle}>Nenhum evento encontrado</Text>
              <Text style={styles.emptyText}>Tente outra categoria ou termo de busca.</Text>
            </View>
          }
        />
      )}

      {/* Modal Evento Detalhe */}
      <Modal visible={modalVisivel} transparent animationType="slide" onRequestClose={() => setModalVisivel(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {eventoSelecionado && (
              <>
                <View style={styles.modalHero}>
                  <View style={styles.modalHeroIcon}>
                    <Ionicons name={(ICON_MAP[eventoSelecionado.categoria] || 'calendar') as any} size={32} color={cores.laranja} />
                  </View>
                  {eventoSelecionado.destaque && (
                    <View style={styles.heroDestaque}>
                      <Ionicons name="star" size={12} color={cores.laranja} />
                      <Text style={styles.heroDestaqueText}>Destaque</Text>
                    </View>
                  )}
                </View>

                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitulo} numberOfLines={2}>{eventoSelecionado.nome}</Text>
                  <View style={styles.headerActions}>
                    <TouchableOpacity
                      onPress={() => toggleFavorito(eventoSelecionado.id)}
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

                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={16} color={cores.roxoClaro} />
                  <Text style={styles.infoText}>{eventoSelecionado.local}</Text>
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

            <View style={styles.ctaRow}>
              <TouchableOpacity style={styles.ctaSecundario} onPress={() => setModalVisivel(false)}>
                <Text style={styles.ctaSecundarioText}>Fechar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ctaBtn} onPress={() => eventoSelecionado && abrirDirecoes(eventoSelecionado)}>
                <Ionicons name="navigate" size={16} color={cores.branco} />
                <Text style={styles.ctaBtnText}>Como chegar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
    container: { flex: 1, backgroundColor: cores.background, paddingTop: 60, paddingHorizontal: SPACING.lg },
    titulo: { fontSize: FONT_SIZE.xxl, fontWeight: 'bold', color: cores.branco, marginBottom: SPACING.md },

    searchWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: cores.backgroundCard, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, height: 44, gap: SPACING.sm, marginBottom: SPACING.sm },
    searchInput: { flex: 1, color: cores.branco, fontSize: FONT_SIZE.sm },

    filtrosScroll: { maxHeight: 40, marginBottom: SPACING.sm },
    filtrosContent: { gap: SPACING.sm },
    filtroChip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.full, backgroundColor: cores.backgroundCard },
    filtroChipAtivo: { backgroundColor: cores.roxo },
    filtroChipText: { color: cores.cinza, fontSize: FONT_SIZE.xs },
    filtroChipTextAtivo: { color: cores.branco },

    subtitulo: { fontSize: FONT_SIZE.xs, color: cores.cinzaClaro, marginBottom: SPACING.md },

    list: { gap: SPACING.sm, paddingBottom: 100 },
    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: cores.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, gap: SPACING.md },
    iconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: cores.background, justifyContent: 'center', alignItems: 'center' },
    cardInfo: { flex: 1 },
    cardNome: { color: cores.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },
    cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
    cardLocal: { color: cores.cinzaClaro, fontSize: FONT_SIZE.xs },
    cardData: { color: cores.laranja, fontSize: FONT_SIZE.xs, fontWeight: '600' },
    destaqueBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, alignSelf: 'flex-start', backgroundColor: cores.background, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 },
    destaqueText: { color: cores.laranja, fontSize: 10, fontWeight: '600' },
    favBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: cores.background, justifyContent: 'center', alignItems: 'center' },

    emptyState: { alignItems: 'center', marginTop: 60, gap: 8 },
    emptyTitle: { color: cores.branco, fontSize: FONT_SIZE.lg, fontWeight: '600' },
    emptyText: { color: cores.cinzaClaro, fontSize: FONT_SIZE.sm },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: cores.overlay, justifyContent: 'center', padding: SPACING.lg },
    modalContent: { backgroundColor: cores.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.lg },
    modalHero: { height: 120, backgroundColor: cores.background, borderRadius: RADIUS.lg, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md, position: 'relative' },
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

    ctaRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
    ctaSecundario: { flex: 1, paddingVertical: 12, backgroundColor: cores.background, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
    ctaSecundarioText: { color: cores.cinzaClaro, fontWeight: '600' },
    ctaBtn: { flex: 2, flexDirection: 'row', gap: 6, paddingVertical: 12, backgroundColor: cores.roxo, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
    ctaBtnText: { color: cores.branco, fontWeight: 'bold' },
  });
}
