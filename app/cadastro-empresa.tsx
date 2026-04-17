import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';

export default function CadastroEmpresa() {
  const router = useRouter();
  const { user, updateUser } = useAuth();

  const [razaoSocial, setRazaoSocial] = useState('');
  const [nomeFantasia, setNomeFantasia] = useState('');
  const [cnpj, setCnpj] = useState(user?.cnpj || '');
  const [telefone, setTelefone] = useState('');
  const [endereco, setEndereco] = useState('');
  const [segmento, setSegmento] = useState('');
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState('');
  const [modalSucesso, setModalSucesso] = useState(false);

  const SEGMENTOS = ['Alimentação', 'Varejo', 'Serviços', 'Eventos', 'Educação', 'Saúde', 'Tecnologia', 'Outro'];

  const handleSalvar = async () => {
    setErro('');
    if (!razaoSocial.trim() || !cnpj.trim() || !nomeFantasia.trim()) {
      setErro('Preencha os campos obrigatórios: Razão Social, Nome Fantasia e CNPJ.');
      return;
    }
    if (cnpj.replace(/\D/g, '').length !== 14) {
      setErro('CNPJ deve ter 14 dígitos.');
      return;
    }

    try {
      await updateUser({ cnpj: cnpj.replace(/\D/g, ''), tipo_conta: 'pj' } as any);
      setModalSucesso(true);
    } catch {
      setErro('Erro ao salvar. Tente novamente.');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={CORES.branco} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Cadastro Empresarial</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Info card */}
        <View style={styles.infoCard}>
          <MaterialCommunityIcons name="office-building" size={24} color={CORES.laranja} />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Conta Empresarial (PJ)</Text>
            <Text style={styles.infoDesc}>
              Com uma conta empresarial você pode publicar eventos comerciais, criar produtos e impulsionar seus anúncios.
            </Text>
          </View>
        </View>

        {/* Formulário */}
        <Text style={styles.sectionTitle}>Dados da Empresa</Text>

        <Text style={styles.label}>Razão Social *</Text>
        <View style={styles.inputWrapper}>
          <TextInput style={styles.input} placeholder="Nome jurídico da empresa" placeholderTextColor={CORES.cinza} value={razaoSocial} onChangeText={setRazaoSocial} />
        </View>

        <Text style={styles.label}>Nome Fantasia *</Text>
        <View style={styles.inputWrapper}>
          <TextInput style={styles.input} placeholder="Nome comercial" placeholderTextColor={CORES.cinza} value={nomeFantasia} onChangeText={setNomeFantasia} />
        </View>

        <Text style={styles.label}>CNPJ *</Text>
        <View style={styles.inputWrapper}>
          <TextInput style={styles.input} placeholder="00.000.000/0000-00" placeholderTextColor={CORES.cinza} value={cnpj} onChangeText={setCnpj} keyboardType="numeric" />
        </View>

        <Text style={styles.label}>Telefone comercial</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="call-outline" size={18} color={CORES.cinza} style={{ marginRight: 8 }} />
          <TextInput style={styles.input} placeholder="(69) 99999-0000" placeholderTextColor={CORES.cinza} value={telefone} onChangeText={setTelefone} keyboardType="phone-pad" />
        </View>

        <Text style={styles.label}>Endereço comercial</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="location-outline" size={18} color={CORES.cinza} style={{ marginRight: 8 }} />
          <TextInput style={styles.input} placeholder="Endereço completo" placeholderTextColor={CORES.cinza} value={endereco} onChangeText={setEndereco} />
        </View>

        <Text style={styles.label}>Segmento</Text>
        <View style={styles.segGrid}>
          {SEGMENTOS.map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.segChip, segmento === s && styles.segChipAtivo]}
              onPress={() => setSegmento(s)}
            >
              <Text style={[styles.segText, segmento === s && styles.segTextAtivo]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Descrição da empresa</Text>
        <View style={[styles.inputWrapper, { height: 80, alignItems: 'flex-start', paddingTop: 12 }]}>
          <TextInput
            style={[styles.input, { textAlignVertical: 'top' }]}
            placeholder="Conte sobre sua empresa..."
            placeholderTextColor={CORES.cinza}
            value={descricao}
            onChangeText={setDescricao}
            multiline
          />
        </View>

        {/* Documentos */}
        <Text style={styles.sectionTitle}>Documentos</Text>
        <TouchableOpacity style={styles.docBtn}>
          <Ionicons name="cloud-upload-outline" size={20} color={CORES.roxoClaro} />
          <Text style={styles.docBtnText}>Enviar Contrato Social ou Alvará</Text>
        </TouchableOpacity>
        <Text style={styles.docHint}>Formatos aceitos: PDF, JPG, PNG (máx. 10MB)</Text>

        {erro ? <Text style={styles.erroText}>{erro}</Text> : null}

        <TouchableOpacity style={styles.ctaBtn} onPress={handleSalvar}>
          <Text style={styles.ctaBtnText}>Cadastrar Empresa</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modal Sucesso */}
      <Modal visible={modalSucesso} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="checkmark-circle" size={56} color={CORES.sucesso} />
            <Text style={styles.modalTitulo}>Empresa cadastrada!</Text>
            <Text style={styles.modalTexto}>
              Seus dados foram enviados para verificação. Você já pode começar a criar eventos comerciais.
            </Text>
            <TouchableOpacity style={[styles.ctaBtn, { backgroundColor: CORES.sucesso }]} onPress={() => { setModalSucesso(false); router.back(); }}>
              <Text style={styles.ctaBtnText}>Continuar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.background },
  scroll: { paddingHorizontal: SPACING.lg, paddingTop: Platform.OS === 'web' ? 20 : 50, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.lg },
  headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: 'bold', color: CORES.branco },

  infoCard: { flexDirection: 'row', backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, gap: SPACING.sm, marginBottom: SPACING.lg, borderLeftWidth: 3, borderLeftColor: CORES.laranja },
  infoContent: { flex: 1 },
  infoTitle: { color: CORES.laranja, fontSize: FONT_SIZE.sm, fontWeight: 'bold', marginBottom: 4 },
  infoDesc: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs, lineHeight: 18 },

  sectionTitle: { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold', marginBottom: SPACING.sm, marginTop: SPACING.md },
  label: { color: CORES.branco, fontSize: FONT_SIZE.sm, fontWeight: '600', marginBottom: SPACING.xs },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: CORES.backgroundInput, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, height: 48, marginBottom: SPACING.md },
  input: { flex: 1, color: CORES.branco, fontSize: FONT_SIZE.sm },

  segGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  segChip: { backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderWidth: 1, borderColor: 'transparent' },
  segChipAtivo: { borderColor: CORES.laranja },
  segText: { color: CORES.cinza, fontSize: FONT_SIZE.xs },
  segTextAtivo: { color: CORES.laranja },

  docBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: CORES.border, borderStyle: 'dashed' },
  docBtnText: { color: CORES.roxoClaro, fontSize: FONT_SIZE.sm },
  docHint: { color: CORES.cinza, fontSize: FONT_SIZE.xs, marginTop: 6, marginBottom: SPACING.md },

  erroText: { color: CORES.erro, fontSize: FONT_SIZE.xs, marginBottom: SPACING.sm },
  ctaBtn: { paddingVertical: 14, backgroundColor: CORES.roxo, borderRadius: RADIUS.sm, alignItems: 'center', marginTop: SPACING.sm },
  ctaBtnText: { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: CORES.overlay, justifyContent: 'center', padding: SPACING.lg },
  modalContent: { backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.xl, alignItems: 'center' },
  modalTitulo: { color: CORES.branco, fontSize: FONT_SIZE.xl, fontWeight: 'bold', textAlign: 'center', marginTop: SPACING.md, marginBottom: SPACING.md },
  modalTexto: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.md },
});
