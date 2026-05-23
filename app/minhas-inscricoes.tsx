/**
 * app/minhas-inscricoes.tsx
 *
 * Tela: listagem de eventos em que o usuário está inscrito.
 * Usa inscricoesService.listarComEvento() para buscar dados reais.
 * Permite cancelar inscrição diretamente da lista.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FONT_SIZE, RADIUS, SPACING, type Cores } from '@/constants/theme';
import { useCores } from '@/contexts/TemaContext';
import { useAuth } from '@/contexts/AuthContext';
import { inscricoesService, InscricaoComEvento } from '@/services/inscricoes';

// ── Helpers ───────────────────────────────────────────────────────

function formatarData(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

const ICONE_CATEGORIA: Record<string, string> = {
  musica:      '🎵',
  arte:        '🎨',
  esporte:     '⚽',
  gastronomia: '🍽️',
  tecnologia:  '💻',
  educacao:    '📚',
  saude:       '💪',
  negocios:    '💼',
  lazer:       '🎉',
};

// ── Componente de card ────────────────────────────────────────────

interface CardProps {
  item: InscricaoComEvento;
  onCancelar: (item: InscricaoComEvento) => void;
  cancelando: boolean;
  cores: Cores;
  styles: ReturnType<typeof createStyles>;
}

function InscricaoCard({ item, onCancelar, cancelando, cores, styles }: CardProps) {
  const ev = item.eventos;
  const emoji = ICONE_CATEGORIA[ev.categoria] ?? '📅';

  return (
    <View style={styles.card}>
      {/* Imagem */}
      {ev.imagem_url ? (
        <Image
          source={{ uri: ev.imagem_url }}
          style={styles.cardImg}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[styles.cardImg, styles.cardImgPlaceholder]}>
          <Text style={styles.cardImgEmoji}>{emoji}</Text>
        </View>
      )}

      {/* Info */}
      <View style={styles.cardBody}>
        <Text style={styles.cardNome} numberOfLines={2}>
          {ev.nome}
        </Text>

        <View style={styles.cardRow}>
          <Ionicons name="location-outline" size={13} color={cores.textSecondary} />
          <Text style={styles.cardMeta} numberOfLines={1}>{ev.local}</Text>
        </View>

        <View style={styles.cardRow}>
          <Ionicons name="calendar-outline" size={13} color={cores.textSecondary} />
          <Text style={styles.cardMeta}>{formatarData(ev.data_inicio)}</Text>
        </View>

        <View style={styles.cardRow}>
          <Ionicons name="checkmark-circle" size={13} color={cores.sucesso ?? '#4CAF50'} />
          <Text style={[styles.cardMeta, { color: cores.sucesso ?? '#4CAF50' }]}>
            Inscrito
          </Text>
        </View>
      </View>

      {/* Botão cancelar */}
      <TouchableOpacity
        style={styles.btnCancelar}
        onPress={() => onCancelar(item)}
        disabled={cancelando}
        accessibilityLabel="Cancelar inscrição"
      >
        {cancelando ? (
          <ActivityIndicator size="small" color={cores.erro ?? '#F44336'} />
        ) : (
          <Ionicons name="close-circle-outline" size={22} color={cores.erro ?? '#F44336'} />
        )}
      </TouchableOpacity>
    </View>
  );
}

// ── Tela principal ────────────────────────────────────────────────

export default function MinhasInscricoesScreen() {
  const cores = useCores();
  const styles = createStyles(cores);
  const router = useRouter();
  const { user } = useAuth();

  const [inscricoes, setInscricoes] = useState<InscricaoComEvento[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelando, setCancelando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await inscricoesService.listarComEvento(user.id);
      setInscricoes(data);
    } catch (err) {
      console.warn('[MinhasInscricoes] Erro ao carregar:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    carregar();
  }, [carregar]);

  const handleCancelar = useCallback((item: InscricaoComEvento) => {
    Alert.alert(
      'Cancelar inscrição',
      `Deseja cancelar sua inscrição em "${item.eventos.nome}"?`,
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Sim, cancelar',
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            setCancelando(item.id);
            try {
              await inscricoesService.cancelar(item.evento_id, user.id);
              setInscricoes(prev => prev.filter(i => i.id !== item.id));
            } catch {
              Alert.alert('Erro', 'Não foi possível cancelar a inscrição. Tente novamente.');
            } finally {
              setCancelando(null);
            }
          },
        },
      ]
    );
  }, [user?.id]);

  // ── Render ───────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.btnVoltar}
          accessibilityLabel="Voltar"
        >
          <Ionicons name="arrow-back" size={24} color={cores.texto} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Minhas Inscrições</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Loading inicial */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={cores.roxo} />
        </View>
      ) : inscricoes.length === 0 ? (
        /* Estado vazio */
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>🎟️</Text>
          <Text style={styles.emptyTitle}>Nenhuma inscrição</Text>
          <Text style={styles.emptyText}>
            Você ainda não está inscrito em nenhum evento.{'\n'}
            Explore eventos na aba Início!
          </Text>
          <TouchableOpacity
            style={styles.btnExplorar}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={styles.btnExplorarText}>Explorar eventos</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* Lista de inscrições */
        <FlatList
          data={inscricoes}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <InscricaoCard
              item={item}
              onCancelar={handleCancelar}
              cancelando={cancelando === item.id}
              cores={cores}
              styles={styles}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ItemSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────

function createStyles(cores: Cores) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: cores.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.xl + 12,
      paddingBottom: SPACING.md,
      backgroundColor: cores.surface,
      borderBottomWidth: 1,
      borderBottomColor: cores.border,
    },
    btnVoltar: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: FONT_SIZE.lg,
      fontWeight: '700',
      color: cores.texto,
    },

    // Loading / vazio
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.xl,
    },
    emptyEmoji: {
      fontSize: 56,
      marginBottom: SPACING.md,
    },
    emptyTitle: {
      fontSize: FONT_SIZE.lg,
      fontWeight: '700',
      color: cores.texto,
      marginBottom: SPACING.xs,
      textAlign: 'center',
    },
    emptyText: {
      fontSize: FONT_SIZE.sm,
      color: cores.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: SPACING.lg,
    },
    btnExplorar: {
      backgroundColor: cores.roxo,
      borderRadius: RADIUS.md,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.xl,
    },
    btnExplorarText: {
      color: '#FFF',
      fontWeight: '700',
      fontSize: FONT_SIZE.md,
    },

    // Lista
    listContent: {
      padding: SPACING.md,
      paddingBottom: SPACING.xl,
    },

    // Card
    card: {
      flexDirection: 'row',
      backgroundColor: cores.surface,
      borderRadius: RADIUS.md,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: cores.border,
    },
    cardImg: {
      width: 90,
      height: 90,
    },
    cardImgPlaceholder: {
      backgroundColor: cores.roxo + '22',
      justifyContent: 'center',
      alignItems: 'center',
    },
    cardImgEmoji: {
      fontSize: 30,
    },
    cardBody: {
      flex: 1,
      padding: SPACING.sm,
      gap: 3,
    },
    cardNome: {
      fontSize: FONT_SIZE.md,
      fontWeight: '700',
      color: cores.texto,
      marginBottom: 2,
    },
    cardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    cardMeta: {
      fontSize: FONT_SIZE.xs,
      color: cores.textSecondary,
      flexShrink: 1,
    },
    btnCancelar: {
      width: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
}
