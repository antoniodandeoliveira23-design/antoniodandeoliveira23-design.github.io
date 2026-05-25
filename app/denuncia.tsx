import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FONT_SIZE, RADIUS, SPACING, type Cores } from '@/constants/theme';
import { useCores } from '@/contexts/TemaContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase';

type TipoDenuncia = 'evento' | 'usuario' | 'mensagem';

const TIPOS: { value: TipoDenuncia; label: string; icon: string; desc: string }[] = [
  { value: 'evento', label: 'Evento', icon: 'calendar', desc: 'Denunciar um evento' },
  { value: 'usuario', label: 'Usuário', icon: 'person', desc: 'Denunciar um perfil' },
  { value: 'mensagem', label: 'Mensagem', icon: 'chatbubble', desc: 'Denunciar uma mensagem' },
];

const MOTIVOS: Record<TipoDenuncia, string[]> = {
  evento: ['Informações falsas', 'Conteúdo inapropriado', 'Evento inexistente', 'Spam'],
  usuario: ['Comportamento abusivo', 'Perfil falso', 'Spam', 'Assédio'],
  mensagem: ['Conteúdo ofensivo', 'Spam', 'Ameaça', 'Outro'],
};

export default function DenunciaScreen() {
  const cores = useCores();
  const styles = createStyles(cores);
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ alvo_id?: string; tipo?: TipoDenuncia }>();

  const [passo, setPasso] = useState<1 | 2 | 3>(params.tipo ? 2 : 1);
  const [tipo, setTipo] = useState<TipoDenuncia | null>(params.tipo ?? null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [descricao, setDescricao] = useState('');
  const [loading, setLoading] = useState(false);

  const alvoId = params.alvo_id ?? '';

  const handleSelecionarTipo = (t: TipoDenuncia) => {
    setTipo(t);
    setPasso(2);
  };

  const handleEnviar = async () => {
    if (!tipo || !motivo || !user?.id) return;
    setLoading(true);
    try {
      await supabase.from('denuncias').insert({
        denunciante_id: user.id,
        alvo_id: alvoId,
        tipo,
        motivo,
        descricao: descricao.trim() || null,
        status: 'pendente',
      });
      setPasso(3);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={cores.branco} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Denúncia</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Indicador de passos */}
      {passo < 3 && (
        <View style={styles.stepRow}>
          {[1, 2].map((s) => (
            <View key={s} style={[styles.stepDot, passo >= s && styles.stepDotAtivo]} />
          ))}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Passo 1: Tipo */}
        {passo === 1 && (
          <>
            <Text style={styles.stepTitle}>O que você quer denunciar?</Text>
            <Text style={styles.stepDesc}>Selecione o tipo de conteúdo</Text>
            <View style={styles.cardsGrid}>
              {TIPOS.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.tipoCard, tipo === t.value && styles.tipoCardAtivo]}
                  onPress={() => handleSelecionarTipo(t.value)}
                >
                  <View style={[styles.tipoIconCircle, tipo === t.value && styles.tipoIconCircleAtivo]}>
                    <Ionicons name={t.icon as any} size={28} color={tipo === t.value ? cores.branco : cores.roxoClaro} />
                  </View>
                  <Text style={[styles.tipoLabel, tipo === t.value && styles.tipoLabelAtivo]}>{t.label}</Text>
                  <Text style={styles.tipoDesc}>{t.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Passo 2: Motivo */}
        {passo === 2 && tipo && (
          <>
            <TouchableOpacity style={styles.backBtn} onPress={() => { setPasso(1); setMotivo(null); }}>
              <Ionicons name="arrow-back" size={18} color={cores.roxoClaro} />
              <Text style={styles.backBtnText}>Voltar</Text>
            </TouchableOpacity>
            <Text style={styles.stepTitle}>Qual é o motivo?</Text>
            <Text style={styles.stepDesc}>Selecione o motivo da denúncia</Text>
            <View style={styles.motivosCol}>
              {MOTIVOS[tipo].map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.motivoItem, motivo === m && styles.motivoItemAtivo]}
                  onPress={() => setMotivo(m)}
                >
                  <View style={[styles.motivoCheck, motivo === m && styles.motivoCheckAtivo]}>
                    {motivo === m && <Ionicons name="checkmark" size={14} color={cores.branco} />}
                  </View>
                  <Text style={[styles.motivoText, motivo === m && styles.motivoTextAtivo]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.labelOpcional}>Descrição adicional (opcional)</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Descreva com mais detalhes..."
              placeholderTextColor={cores.cinza}
              multiline
              numberOfLines={4}
              value={descricao}
              onChangeText={setDescricao}
            />

            <TouchableOpacity
              style={[styles.enviarBtn, (!motivo || loading) && styles.enviarBtnDisabled]}
              onPress={handleEnviar}
              disabled={!motivo || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={cores.branco} />
              ) : (
                <Text style={styles.enviarBtnText}>Enviar denúncia</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {/* Passo 3: Sucesso */}
        {passo === 3 && (
          <View style={styles.sucessoContainer}>
            <View style={styles.sucessoIconCircle}>
              <Ionicons name="checkmark-circle" size={64} color={cores.sucesso} />
            </View>
            <Text style={styles.sucessoTitulo}>Denúncia enviada!</Text>
            <Text style={styles.sucessoDesc}>
              Sua denúncia foi registrada e será analisada pela nossa equipe em até 24 horas.
            </Text>
            <TouchableOpacity style={styles.voltarBtn} onPress={() => router.back()}>
              <Text style={styles.voltarBtnText}>Voltar</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(cores: Cores) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: cores.background, paddingTop: Platform.OS === 'web' ? 20 : 50 },

    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
    closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: cores.backgroundCard, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { color: cores.branco, fontSize: FONT_SIZE.lg, fontWeight: 'bold' },

    stepRow: { flexDirection: 'row', justifyContent: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
    stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: cores.backgroundCard },
    stepDotAtivo: { backgroundColor: cores.roxo, width: 24 },

    content: { paddingHorizontal: SPACING.lg, paddingBottom: 60 },

    stepTitle: { color: cores.branco, fontSize: FONT_SIZE.xl, fontWeight: 'bold', marginBottom: SPACING.xs },
    stepDesc: { color: cores.cinzaClaro, fontSize: FONT_SIZE.sm, marginBottom: SPACING.lg },

    cardsGrid: { gap: SPACING.md },
    tipoCard: { backgroundColor: cores.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.lg, alignItems: 'center', gap: SPACING.sm, borderWidth: 2, borderColor: 'transparent' },
    tipoCardAtivo: { borderColor: cores.roxo },
    tipoIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: cores.background, justifyContent: 'center', alignItems: 'center' },
    tipoIconCircleAtivo: { backgroundColor: cores.roxo },
    tipoLabel: { color: cores.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },
    tipoLabelAtivo: { color: cores.roxoClaro },
    tipoDesc: { color: cores.cinzaClaro, fontSize: FONT_SIZE.xs },

    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.md },
    backBtnText: { color: cores.roxoClaro, fontSize: FONT_SIZE.sm },

    motivosCol: { gap: SPACING.sm, marginBottom: SPACING.lg },
    motivoItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: cores.backgroundCard, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: 'transparent' },
    motivoItemAtivo: { borderColor: cores.roxo },
    motivoCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: cores.cinza, justifyContent: 'center', alignItems: 'center' },
    motivoCheckAtivo: { backgroundColor: cores.roxo, borderColor: cores.roxo },
    motivoText: { color: cores.cinzaClaro, fontSize: FONT_SIZE.sm },
    motivoTextAtivo: { color: cores.branco, fontWeight: '600' },

    labelOpcional: { color: cores.cinzaClaro, fontSize: FONT_SIZE.xs, fontWeight: '600', marginBottom: SPACING.sm },
    textArea: { backgroundColor: cores.backgroundCard, borderRadius: RADIUS.md, padding: SPACING.md, color: cores.branco, fontSize: FONT_SIZE.sm, minHeight: 100, textAlignVertical: 'top', marginBottom: SPACING.lg },

    enviarBtn: { backgroundColor: cores.roxo, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center' },
    enviarBtnDisabled: { opacity: 0.5 },
    enviarBtnText: { color: cores.branco, fontWeight: 'bold', fontSize: FONT_SIZE.md },

    sucessoContainer: { alignItems: 'center', paddingTop: 60, gap: SPACING.md },
    sucessoIconCircle: { marginBottom: SPACING.md },
    sucessoTitulo: { color: cores.branco, fontSize: FONT_SIZE.xxl, fontWeight: 'bold' },
    sucessoDesc: { color: cores.cinzaClaro, fontSize: FONT_SIZE.sm, textAlign: 'center', maxWidth: 280, lineHeight: 22 },
    voltarBtn: { backgroundColor: cores.roxo, borderRadius: RADIUS.md, paddingHorizontal: SPACING.xl, paddingVertical: 14, marginTop: SPACING.md },
    voltarBtnText: { color: cores.branco, fontWeight: 'bold', fontSize: FONT_SIZE.md },
  });
}
