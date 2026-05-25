import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FONT_SIZE, RADIUS, SPACING, type Cores } from '@/constants/theme';
import { useCores } from '@/contexts/TemaContext';
import { supabase } from '@/services/supabase';
import type { Evento } from '@/types';

export default function AnuncioNoArScreen() {
  const cores = useCores();
  const styles = createStyles(cores);
  const router = useRouter();
  const { evento_id } = useLocalSearchParams<{ evento_id?: string }>();

  const [evento, setEvento] = useState<Evento | null>(null);

  // Animação de entrada
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 120 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();

    if (evento_id) {
      supabase
        .from('eventos')
        .select('*')
        .eq('id', evento_id)
        .single()
        .then(({ data }) => setEvento(data as Evento | null))
        .catch(() => {});
    }
  }, [evento_id]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Ícone animado */}
        <Animated.View style={[styles.iconWrapper, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
          <View style={styles.iconCircle}>
            <Ionicons name="megaphone" size={56} color={cores.laranja} />
          </View>
          <View style={styles.iconPulse} />
        </Animated.View>

        <Animated.View style={{ opacity: opacityAnim, alignItems: 'center' }}>
          <Text style={styles.titulo}>Seu anúncio está no ar!</Text>
          <Text style={styles.subtitulo}>
            O evento{evento ? ` "${evento.nome}"` : ''} já está visível para todos os usuários
          </Text>
        </Animated.View>

        {/* Card com detalhes */}
        {evento && (
          <Animated.View style={[styles.detalhesCard, { opacity: opacityAnim }]}>
            <View style={styles.detalheRow}>
              <Ionicons name="calendar-outline" size={18} color={cores.roxoClaro} />
              <Text style={styles.detalheText}>
                {new Date(evento.data_inicio).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
              </Text>
            </View>
            <View style={styles.detalheRow}>
              <Ionicons name="location-outline" size={18} color={cores.roxoClaro} />
              <Text style={styles.detalheText}>{evento.local}</Text>
            </View>
            <View style={styles.detalheRow}>
              <Ionicons name="pricetag-outline" size={18} color={cores.laranja} />
              <Text style={[styles.detalheText, { color: cores.laranja }]}>
                {evento.tipo_ingresso === 'gratuito' ? 'Gratuito' : evento.preco ? `R$ ${Number(evento.preco).toFixed(2).replace('.', ',')}` : 'Pago'}
              </Text>
            </View>
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Publicado</Text>
            </View>
          </Animated.View>
        )}

        {/* Botões */}
        <View style={styles.botoesCol}>
          {evento_id && (
            <TouchableOpacity
              style={styles.btnMetricas}
              onPress={() => router.push({ pathname: '/metricas-evento/[id]' as any, params: { id: evento_id } })}
            >
              <Ionicons name="stats-chart" size={20} color={cores.branco} />
              <Text style={styles.btnMetricasText}>Ver métricas</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.btnVoltar}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={styles.btnVoltarText}>Voltar ao início</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(cores: Cores) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: cores.background },
    content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: Platform.OS === 'web' ? 60 : 80, paddingBottom: 60, gap: SPACING.lg },

    iconWrapper: { alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md, position: 'relative' },
    iconCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: cores.laranja + '22', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: cores.laranja + '44' },
    iconPulse: { position: 'absolute', width: 140, height: 140, borderRadius: 70, borderWidth: 1, borderColor: cores.laranja + '33' },

    titulo: { color: cores.branco, fontSize: FONT_SIZE.xxl, fontWeight: 'bold', textAlign: 'center', marginBottom: SPACING.sm },
    subtitulo: { color: cores.cinzaClaro, fontSize: FONT_SIZE.md, textAlign: 'center', lineHeight: 24, maxWidth: 300 },

    detalhesCard: { width: '100%', backgroundColor: cores.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.lg, gap: SPACING.md },
    detalheRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
    detalheText: { color: cores.branco, fontSize: FONT_SIZE.sm, flex: 1 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: cores.sucesso + '22', borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: 6, marginTop: SPACING.xs },
    statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: cores.sucesso },
    statusText: { color: cores.sucesso, fontSize: FONT_SIZE.xs, fontWeight: '700' },

    botoesCol: { width: '100%', gap: SPACING.md },
    btnMetricas: { backgroundColor: cores.roxo, borderRadius: RADIUS.md, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
    btnMetricasText: { color: cores.branco, fontWeight: 'bold', fontSize: FONT_SIZE.md },
    btnVoltar: { backgroundColor: cores.backgroundCard, borderRadius: RADIUS.md, padding: 16, alignItems: 'center' },
    btnVoltarText: { color: cores.cinzaClaro, fontWeight: '600', fontSize: FONT_SIZE.md },
  });
}
