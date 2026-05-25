import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FONT_SIZE, RADIUS, SPACING, type Cores } from '@/constants/theme';
import { useCores } from '@/contexts/TemaContext';
import { supabase } from '@/services/supabase';
import type { Evento } from '@/types';

const ICON_MAP: Record<string, string> = {
  musica: 'musical-notes', teatro: 'film', esporte: 'football', educacao: 'school',
  feira: 'storefront', cultura: 'library', gastronomia: 'restaurant',
  negocios: 'briefcase', religiao: 'heart', governo: 'flag', outro: 'calendar',
};

export default function BuscaScreen() {
  const cores = useCores();
  const styles = createStyles(cores);
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(false);
  const [buscou, setBuscou] = useState(false);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length >= 2) {
        buscar(query.trim());
      } else if (query.trim().length === 0) {
        setResultados([]);
        setBuscou(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const buscar = async (q: string) => {
    setLoading(true);
    setBuscou(true);
    try {
      const { data } = await supabase
        .from('eventos')
        .select('*')
        .or(`nome.ilike.%${q}%,local.ilike.%${q}%`)
        .eq('status', 'aprovado')
        .order('data_inicio', { ascending: true })
        .limit(30);
      setResultados((data as Evento[]) ?? []);
    } catch {
      setResultados([]);
    } finally {
      setLoading(false);
    }
  };

  const renderEvento = ({ item }: { item: Evento }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push({ pathname: '/evento/[id]' as any, params: { id: item.id } })}
    >
      <View style={styles.iconCircle}>
        <Ionicons name={(ICON_MAP[item.categoria] || 'calendar') as any} size={22} color={cores.laranja} />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardNome} numberOfLines={1}>{item.nome}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={12} color={cores.cinzaClaro} />
          <Text style={styles.metaLocal} numberOfLines={1}>{item.local}</Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={12} color={cores.laranja} />
          <Text style={styles.metaData}>
            {new Date(item.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
          </Text>
        </View>
      </View>
      <View style={styles.categoriaBadge}>
        <Text style={styles.categoriaText}>{item.categoria.toUpperCase()}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={cores.branco} />
        </TouchableOpacity>
        <View style={styles.searchWrapper}>
          <Ionicons name="search" size={18} color={cores.cinza} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Buscar eventos ou locais..."
            placeholderTextColor={cores.cinza}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setResultados([]); setBuscou(false); }}>
              <Ionicons name="close-circle" size={18} color={cores.cinza} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Resultados */}
      {loading ? (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color={cores.roxo} />
          <Text style={styles.loadingText}>Buscando...</Text>
        </View>
      ) : buscou && resultados.length === 0 ? (
        <View style={styles.centeredState}>
          <Ionicons name="search-outline" size={56} color={cores.cinza} />
          <Text style={styles.emptyTitle}>Nenhum resultado</Text>
          <Text style={styles.emptyText}>Tente buscar por outro nome ou local</Text>
        </View>
      ) : !buscou ? (
        <View style={styles.centeredState}>
          <Ionicons name="search" size={56} color={cores.backgroundCard} />
          <Text style={styles.emptyTitle}>Pesquise eventos</Text>
          <Text style={styles.emptyText}>Digite o nome do evento ou local para começar</Text>
        </View>
      ) : (
        <>
          <Text style={styles.resultCount}>{resultados.length} resultado(s) para "{query}"</Text>
          <FlatList
            data={resultados}
            keyExtractor={(item) => item.id}
            renderItem={renderEvento}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
    </View>
  );
}

function createStyles(cores: Cores) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: cores.background, paddingTop: Platform.OS === 'web' ? 20 : 50 },

    header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: cores.backgroundCard, justifyContent: 'center', alignItems: 'center' },
    searchWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: cores.backgroundCard, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, height: 44, gap: SPACING.sm },
    searchInput: { flex: 1, color: cores.branco, fontSize: FONT_SIZE.sm },

    centeredState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.xl },
    loadingText: { color: cores.cinzaClaro, fontSize: FONT_SIZE.sm, marginTop: SPACING.sm },
    emptyTitle: { color: cores.branco, fontSize: FONT_SIZE.lg, fontWeight: '600' },
    emptyText: { color: cores.cinzaClaro, fontSize: FONT_SIZE.sm, textAlign: 'center' },

    resultCount: { color: cores.cinzaClaro, fontSize: FONT_SIZE.xs, paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },
    listContent: { paddingHorizontal: SPACING.lg, paddingBottom: 40, gap: SPACING.sm },

    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: cores.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, gap: SPACING.md },
    iconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: cores.background, justifyContent: 'center', alignItems: 'center' },
    cardInfo: { flex: 1, gap: 3 },
    cardNome: { color: cores.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaLocal: { color: cores.cinzaClaro, fontSize: FONT_SIZE.xs, flex: 1 },
    metaData: { color: cores.laranja, fontSize: FONT_SIZE.xs, fontWeight: '600' },
    categoriaBadge: { backgroundColor: cores.background, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 },
    categoriaText: { color: cores.roxoClaro, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  });
}
