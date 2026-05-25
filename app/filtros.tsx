import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FONT_SIZE, RADIUS, SPACING, type Cores } from '@/constants/theme';
import { useCores } from '@/contexts/TemaContext';

const CATEGORIAS = ['Cultura', 'Esporte', 'Gastronomia', 'Música', 'Educação', 'Negócios', 'Outro'];
const TIPOS_INGRESSO = ['Gratuito', 'Pago'];
const DATAS = ['Hoje', 'Esta semana', 'Este mês'];
const DISTANCIAS = ['1km', '5km', '10km', '50km'];

export default function FiltrosScreen() {
  const cores = useCores();
  const styles = createStyles(cores);
  const router = useRouter();

  const [categoriasSel, setCategoriasSel] = useState<string[]>([]);
  const [tipoIngresso, setTipoIngresso] = useState<string | null>(null);
  const [data, setData] = useState<string | null>(null);
  const [distancia, setDistancia] = useState<string | null>(null);

  const toggleCategoria = (cat: string) => {
    setCategoriasSel((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const limparTudo = () => {
    setCategoriasSel([]);
    setTipoIngresso(null);
    setData(null);
    setDistancia(null);
  };

  const aplicar = () => {
    router.back();
  };

  const temFiltros = categoriasSel.length > 0 || tipoIngresso !== null || data !== null || distancia !== null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={cores.branco} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Filtros</Text>
        <TouchableOpacity onPress={limparTudo} disabled={!temFiltros}>
          <Text style={[styles.limparText, !temFiltros && styles.limparTextDisabled]}>Limpar tudo</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Categoria */}
        <Text style={styles.secaoTitulo}>Categoria</Text>
        <View style={styles.chipsWrap}>
          {CATEGORIAS.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, categoriasSel.includes(cat) && styles.chipAtivo]}
              onPress={() => toggleCategoria(cat)}
            >
              <Text style={[styles.chipText, categoriasSel.includes(cat) && styles.chipTextAtivo]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tipo de ingresso */}
        <Text style={styles.secaoTitulo}>Tipo de ingresso</Text>
        <View style={styles.chipsRow}>
          {TIPOS_INGRESSO.map((tipo) => (
            <TouchableOpacity
              key={tipo}
              style={[styles.chip, styles.chipFlex, tipoIngresso === tipo && styles.chipAtivo]}
              onPress={() => setTipoIngresso(tipoIngresso === tipo ? null : tipo)}
            >
              <Ionicons
                name={tipo === 'Gratuito' ? 'gift-outline' : 'card-outline'}
                size={14}
                color={tipoIngresso === tipo ? cores.branco : cores.cinza}
              />
              <Text style={[styles.chipText, tipoIngresso === tipo && styles.chipTextAtivo]}>{tipo}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Data */}
        <Text style={styles.secaoTitulo}>Data</Text>
        <View style={styles.chipsWrap}>
          {DATAS.map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.chip, data === d && styles.chipAtivo]}
              onPress={() => setData(data === d ? null : d)}
            >
              <Text style={[styles.chipText, data === d && styles.chipTextAtivo]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Distância */}
        <Text style={styles.secaoTitulo}>Distância</Text>
        <View style={styles.chipsRow}>
          {DISTANCIAS.map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.chip, styles.chipFlex, distancia === d && styles.chipAtivo]}
              onPress={() => setDistancia(distancia === d ? null : d)}
            >
              <Text style={[styles.chipText, distancia === d && styles.chipTextAtivo]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Botão fixo no bottom */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.aplicarBtn} onPress={aplicar}>
          <Text style={styles.aplicarBtnText}>
            Aplicar filtros{temFiltros ? ` (${categoriasSel.length + (tipoIngresso ? 1 : 0) + (data ? 1 : 0) + (distancia ? 1 : 0)})` : ''}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(cores: Cores) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: cores.background, paddingTop: Platform.OS === 'web' ? 20 : 50 },

    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
    closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: cores.backgroundCard, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { color: cores.branco, fontSize: FONT_SIZE.lg, fontWeight: 'bold' },
    limparText: { color: cores.roxoClaro, fontSize: FONT_SIZE.sm, fontWeight: '600' },
    limparTextDisabled: { color: cores.cinza },

    content: { paddingHorizontal: SPACING.lg },

    secaoTitulo: { color: cores.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold', marginTop: SPACING.lg, marginBottom: SPACING.md },

    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
    chipsRow: { flexDirection: 'row', gap: SPACING.sm },

    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: cores.backgroundCard, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: 10, borderWidth: 1, borderColor: 'transparent' },
    chipFlex: { flex: 1, justifyContent: 'center' },
    chipAtivo: { backgroundColor: cores.roxo, borderColor: cores.roxoClaro },
    chipText: { color: cores.cinzaClaro, fontSize: FONT_SIZE.sm },
    chipTextAtivo: { color: cores.branco, fontWeight: '600' },

    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: cores.background, borderTopWidth: 1, borderTopColor: cores.border, padding: SPACING.lg, paddingBottom: Platform.OS === 'web' ? SPACING.lg : 34 },
    aplicarBtn: { backgroundColor: cores.roxo, borderRadius: RADIUS.md, padding: 16, alignItems: 'center' },
    aplicarBtnText: { color: cores.branco, fontWeight: 'bold', fontSize: FONT_SIZE.md },
  });
}
