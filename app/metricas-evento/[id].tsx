import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FONT_SIZE, RADIUS, SPACING, type Cores } from '@/constants/theme';
import { useCores } from '@/contexts/TemaContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase';
import type { Evento } from '@/types';

interface MetricasData {
  evento: Evento | null;
  inscricoes: number;
  favoritos: number;
  visualizacoes: number | null;
  ultimasInscricoes: { nome: string; created_at: string }[];
}

export default function MetricasEventoScreen() {
  const cores = useCores();
  const styles = createStyles(cores);
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<MetricasData>({
    evento: null,
    inscricoes: 0,
    favoritos: 0,
    visualizacoes: null,
    ultimasInscricoes: [],
  });
  const [acesso, setAcesso] = useState(true);

  useEffect(() => {
    if (id) carregarMetricas();
  }, [id]);

  const carregarMetricas = async () => {
    setLoading(true);
    try {
      // Busca o evento
      const { data: eventoData } = await supabase
        .from('eventos')
        .select('*')
        .eq('id', id)
        .single();

      const evento = eventoData as Evento | null;

      if (!evento || (evento.criador_id !== user?.id && user?.tipo_conta !== 'admin')) {
        setAcesso(false);
        setLoading(false);
        return;
      }

      // Contagem de inscrições
      const { count: inscricoesCount } = await supabase
        .from('inscricoes')
        .select('*', { count: 'exact', head: true })
        .eq('evento_id', id);

      // Contagem de favoritos
      const { count: favoritosCount } = await supabase
        .from('favoritos')
        .select('*', { count: 'exact', head: true })
        .eq('evento_id', id);

      // Visualizações via access_log (opcional)
      let visualizacoes: number | null = null;
      try {
        const { count: viewCount } = await supabase
          .from('access_log')
          .select('*', { count: 'exact', head: true })
          .eq('recurso', 'evento')
          .eq('recurso_id', id);
        visualizacoes = viewCount ?? null;
      } catch {
        visualizacoes = null;
      }

      // Últimas inscrições (com join em profiles)
      const { data: inscricoesData } = await supabase
        .from('inscricoes')
        .select('created_at, profiles!user_id(nome, sobrenome)')
        .eq('evento_id', id)
        .order('created_at', { ascending: false })
        .limit(10);

      const ultimasInscricoes = (inscricoesData ?? []).map((i: any) => ({
        nome: i.profiles ? `${i.profiles.nome ?? ''} ${i.profiles.sobrenome ?? ''}`.trim() : 'Usuário',
        created_at: i.created_at,
      }));

      setDados({
        evento,
        inscricoes: inscricoesCount ?? 0,
        favoritos: favoritosCount ?? 0,
        visualizacoes,
        ultimasInscricoes,
      });
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  };

  const taxaConversao =
    dados.visualizacoes && dados.visualizacoes > 0
      ? ((dados.inscricoes / dados.visualizacoes) * 100).toFixed(1) + '%'
      : '--';

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={cores.roxo} />
      </View>
    );
  }

  if (!acesso) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="lock-closed" size={56} color={cores.cinza} />
        <Text style={styles.acessoNegadoTitulo}>Acesso negado</Text>
        <Text style={styles.acessoNegadoDesc}>Você não tem permissão para ver as métricas deste evento.</Text>
        <TouchableOpacity style={styles.voltarBtn} onPress={() => router.back()}>
          <Text style={styles.voltarBtnText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { evento, inscricoes, favoritos, visualizacoes, ultimasInscricoes } = dados;

  const STATUS_LABELS: Record<string, string> = {
    aprovado: 'Publicado',
    pendente: 'Em análise',
    rejeitado: 'Rejeitado',
    rascunho: 'Rascunho',
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={cores.branco} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerLabel}>Métricas</Text>
          <Text style={styles.headerNome} numberOfLines={1}>{evento?.nome}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* KPI cards */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Ionicons name="eye-outline" size={24} color={cores.roxoClaro} />
            <Text style={styles.kpiValue}>{visualizacoes !== null ? visualizacoes : '--'}</Text>
            <Text style={styles.kpiLabel}>Visualizações</Text>
          </View>
          <View style={styles.kpiCard}>
            <Ionicons name="ticket-outline" size={24} color={cores.laranja} />
            <Text style={[styles.kpiValue, { color: cores.laranja }]}>{inscricoes}</Text>
            <Text style={styles.kpiLabel}>Inscrições</Text>
          </View>
          <View style={styles.kpiCard}>
            <Ionicons name="heart-outline" size={24} color={cores.erro} />
            <Text style={[styles.kpiValue, { color: cores.erro }]}>{favoritos}</Text>
            <Text style={styles.kpiLabel}>Favoritos</Text>
          </View>
          <View style={styles.kpiCard}>
            <Ionicons name="trending-up-outline" size={24} color={cores.sucesso} />
            <Text style={[styles.kpiValue, { color: cores.sucesso }]}>{taxaConversao}</Text>
            <Text style={styles.kpiLabel}>Conversão</Text>
          </View>
        </View>

        {/* Informações do evento */}
        <Text style={styles.secaoTitulo}>Informações do evento</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status</Text>
            <Text style={[styles.infoValue, { color: evento?.status === 'aprovado' ? cores.sucesso : cores.laranja }]}>
              {STATUS_LABELS[evento?.status ?? ''] ?? evento?.status}
            </Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Data</Text>
            <Text style={styles.infoValue}>
              {evento?.data_inicio
                ? new Date(evento.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
                : '--'}
            </Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Local</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{evento?.local ?? '--'}</Text>
          </View>
        </View>

        {/* Últimas inscrições */}
        <Text style={styles.secaoTitulo}>Últimas inscrições</Text>
        {ultimasInscricoes.length === 0 ? (
          <View style={styles.emptyInscricoes}>
            <Text style={styles.emptyInscricoesText}>Nenhuma inscrição ainda</Text>
          </View>
        ) : (
          ultimasInscricoes.map((insc, idx) => (
            <View key={idx} style={styles.inscricaoRow}>
              <View style={styles.inscricaoAvatar}>
                <Ionicons name="person" size={18} color={cores.cinzaClaro} />
              </View>
              <View style={styles.inscricaoInfo}>
                <Text style={styles.inscricaoNome}>{insc.nome || 'Usuário'}</Text>
                <Text style={styles.inscricaoData}>
                  {new Date(insc.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function createStyles(cores: Cores) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: cores.background, paddingTop: Platform.OS === 'web' ? 20 : 50 },
    centered: { justifyContent: 'center', alignItems: 'center', gap: SPACING.md, paddingHorizontal: SPACING.xl },

    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: cores.backgroundCard, justifyContent: 'center', alignItems: 'center' },
    headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: SPACING.sm },
    headerLabel: { color: cores.cinzaClaro, fontSize: FONT_SIZE.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    headerNome: { color: cores.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },

    content: { paddingHorizontal: SPACING.lg, paddingBottom: 40 },

    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.lg },
    kpiCard: { flex: 1, minWidth: '45%', backgroundColor: cores.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, alignItems: 'center', gap: 6 },
    kpiValue: { color: cores.branco, fontSize: FONT_SIZE.xxl, fontWeight: 'bold' },
    kpiLabel: { color: cores.cinzaClaro, fontSize: FONT_SIZE.xs },

    secaoTitulo: { color: cores.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold', marginBottom: SPACING.sm },

    infoCard: { backgroundColor: cores.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.sm },
    infoLabel: { color: cores.cinzaClaro, fontSize: FONT_SIZE.sm },
    infoValue: { color: cores.branco, fontSize: FONT_SIZE.sm, fontWeight: '600', flex: 1, textAlign: 'right' },
    infoDivider: { height: 1, backgroundColor: cores.border },

    inscricaoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: cores.backgroundCard, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
    inscricaoAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: cores.background, justifyContent: 'center', alignItems: 'center' },
    inscricaoInfo: { flex: 1 },
    inscricaoNome: { color: cores.branco, fontSize: FONT_SIZE.sm, fontWeight: '600' },
    inscricaoData: { color: cores.cinzaClaro, fontSize: FONT_SIZE.xs, marginTop: 2 },

    emptyInscricoes: { padding: SPACING.lg, alignItems: 'center', backgroundColor: cores.backgroundCard, borderRadius: RADIUS.lg, marginBottom: SPACING.lg },
    emptyInscricoesText: { color: cores.cinzaClaro, fontSize: FONT_SIZE.sm },

    acessoNegadoTitulo: { color: cores.branco, fontSize: FONT_SIZE.xl, fontWeight: 'bold' },
    acessoNegadoDesc: { color: cores.cinzaClaro, fontSize: FONT_SIZE.sm, textAlign: 'center' },
    voltarBtn: { backgroundColor: cores.roxo, borderRadius: RADIUS.md, paddingHorizontal: SPACING.xl, paddingVertical: 12, marginTop: SPACING.md },
    voltarBtnText: { color: cores.branco, fontWeight: 'bold' },
  });
}
