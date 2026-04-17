import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { denunciasService } from '@/services/denuncias';
import type { TipoDenuncia } from '@/types';

const MOTIVOS = [
  'Conteúdo ofensivo ou inapropriado',
  'Spam ou propaganda enganosa',
  'Informações falsas',
  'Assédio ou bullying',
  'Violação de direitos autorais',
  'Evento fraudulento',
  'Outro',
];

interface Props {
  visivel: boolean;
  onFechar: () => void;
  tipo: TipoDenuncia;
  alvoId: string;
}

export default function ModalDenuncia({ visivel, onFechar, tipo, alvoId }: Props) {
  const [motivo, setMotivo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const handleEnviar = async () => {
    if (!motivo) {
      Alert.alert('Erro', 'Selecione um motivo.');
      return;
    }
    setEnviando(true);
    try {
      await denunciasService.criar({ tipo, alvo_id: alvoId, motivo, descricao: descricao.trim() || undefined });
      setEnviado(true);
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Erro ao enviar denúncia.');
    } finally {
      setEnviando(false);
    }
  };

  const handleFechar = () => {
    setMotivo('');
    setDescricao('');
    setEnviado(false);
    onFechar();
  };

  return (
    <Modal visible={visivel} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.content}>
          {enviado ? (
            <>
              <Ionicons name="checkmark-circle" size={48} color={CORES.sucesso} />
              <Text style={styles.titulo}>Denúncia enviada</Text>
              <Text style={styles.texto}>Nossa equipe vai analisar e tomar as providências necessárias.</Text>
              <TouchableOpacity style={styles.ctaBtn} onPress={handleFechar}>
                <Text style={styles.ctaBtnText}>Fechar</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.header}>
                <Text style={styles.titulo}>Denunciar</Text>
                <TouchableOpacity onPress={handleFechar}>
                  <Ionicons name="close" size={24} color={CORES.cinza} />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Selecione o motivo:</Text>
              {MOTIVOS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.motivoItem, motivo === m && styles.motivoItemAtivo]}
                  onPress={() => setMotivo(m)}
                >
                  <Text style={[styles.motivoTexto, motivo === m && styles.motivoTextoAtivo]}>{m}</Text>
                  {motivo === m && <Ionicons name="checkmark" size={18} color={CORES.laranja} />}
                </TouchableOpacity>
              ))}

              <Text style={styles.label}>Detalhes (opcional)</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="Descreva o que aconteceu..."
                  placeholderTextColor={CORES.cinza}
                  value={descricao}
                  onChangeText={setDescricao}
                  multiline
                />
              </View>

              <TouchableOpacity
                style={[styles.ctaBtn, enviando && styles.ctaBtnDisabled]}
                onPress={handleEnviar}
                disabled={enviando}
              >
                <Text style={styles.ctaBtnText}>{enviando ? 'Enviando...' : 'Enviar denúncia'}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: CORES.overlay, justifyContent: 'flex-end' },
  content: { backgroundColor: CORES.backgroundCard, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg, maxHeight: '85%', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: SPACING.lg },
  titulo: { fontSize: FONT_SIZE.xl, fontWeight: 'bold', color: CORES.branco },
  texto: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, textAlign: 'center', marginTop: SPACING.md, marginBottom: SPACING.lg, lineHeight: 22 },
  label: { color: CORES.branco, fontSize: FONT_SIZE.sm, fontWeight: '600', alignSelf: 'flex-start', marginBottom: SPACING.sm },
  motivoItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: CORES.background, borderRadius: RADIUS.sm, padding: SPACING.md, width: '100%', marginBottom: SPACING.xs, borderWidth: 1, borderColor: 'transparent' },
  motivoItemAtivo: { borderColor: CORES.laranja },
  motivoTexto: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm },
  motivoTextoAtivo: { color: CORES.branco },
  inputWrapper: { backgroundColor: CORES.background, borderRadius: RADIUS.sm, padding: SPACING.md, width: '100%', height: 80, marginBottom: SPACING.lg },
  input: { flex: 1, color: CORES.branco, fontSize: FONT_SIZE.sm, textAlignVertical: 'top' },
  ctaBtn: { width: '100%', paddingVertical: 14, backgroundColor: CORES.roxo, borderRadius: RADIUS.sm, alignItems: 'center', marginTop: SPACING.sm },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaBtnText: { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },
});
