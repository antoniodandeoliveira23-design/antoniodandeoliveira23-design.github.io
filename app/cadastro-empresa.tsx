import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { FONT_SIZE, RADIUS, SPACING, type Cores } from '@/constants/theme';
import { useCores } from '@/contexts/TemaContext';
import { useAuth } from '@/contexts/AuthContext';
import { validarCNPJ, formatarCNPJ } from '@/services/seguranca';

export default function CadastroEmpresa() {
  const cores = useCores();
  const styles = createStyles(cores);
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

    // Validação completa: formato + dígitos verificadores
    const validacaoCnpj = validarCNPJ(cnpj);
    if (!validacaoCnpj.valido) {
      setErro(validacaoCnpj.erro ?? 'CNPJ inválido.');
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
            <Ionicons name="arrow-back" size={24} color={cores.branco} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Cadastro Empresarial</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Info card */}
        <View style={styles.infoCard}>
          <MaterialCommunityIcons name="office-building" size={24} color={cores.laranja} />
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
          <TextInput style={styles.input} placeholder="Nome jurídico da empresa" placeholderTextColor={cores.cinza} value={razaoSocial} onChangeText={setRazaoSocial} />
        </View>

        <Text style={styles.label}>Nome Fantasia *</Text>
        <View style={styles.inputWrapper}>
          <TextInput style={styles.input} placeholder="Nome comercial" placeholderTextColor={cores.cinza} value={nomeFantasia} onChangeText={setNomeFantasia} />
        </View>

        <Text style={styles.label}>CNPJ *</Text>
        <View style={[styles.inputWrapper,
          cnpj.replace(/\D/g,'').length === 14 && !validarCNPJ(cnpj).valido
            ? { borderWidth: 1, borderColor: cores.erro }
            : cnpj.replace(/\D/g,'').length === 14 && validarCNPJ(cnpj).valido
            ? { borderWidth: 1, borderColor: cores.sucesso }
            : null,
        ]}>
          <TextInput
            style={styles.input}
            placeholder="00.000.000/0000-00"
            placeholderTextColor={cores.cinza}
            value={cnpj}
            onChangeText={(t) => setCnpj(formatarCNPJ(t))}
            keyboardType="number-pad"
            maxLength={18}
          />
          {cnpj.replace(/\D/g,'').length === 14 && (
            <Ionicons
              name={validarCNPJ(cnpj).valido ? 'checkmark-circle' : 'close-circle'}
              size={18}
              color={validarCNPJ(cnpj).valido ? cores.sucesso : cores.erro}
              style={{ marginLeft: 6 }}
            />
          )}
        </View>
        {cnpj.replace(/\D/g,'').length === 14 && !validarCNPJ(cnpj).valido && (
          <Text style={{ color: cores.erro, fontSize: FONT_SIZE.xs, marginTop: -10, marginBottom: SPACING.sm }}>
            {validarCNPJ(cnpj).erro}
          </Text>
        )}

        <Text style={styles.label}>Telefone comercial</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="call-outline" size={18} color={cores.cinza} style={{ marginRight: 8 }} />
          <TextInput style={styles.input} placeholder="(69) 99999-0000" placeholderTextColor={cores.cinza} value={telefone} onChangeText={setTelefone} keyboardType="phone-pad" />
        </View>

        <Text style={styles.label}>Endereço comercial</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="location-outline" size={18} color={cores.cinza} style={{ marginRight: 8 }} />
          <TextInput style={styles.input} placeholder="Endereço completo" placeholderTextColor={cores.cinza} value={endereco} onChangeText={setEndereco} />
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
            placeholderTextColor={cores.cinza}
            value={descricao}
            onChangeText={setDescricao}
            multiline
          />
        </View>

        {/* Documentos */}
        <Text style={styles.sectionTitle}>Documentos</Text>
        <TouchableOpacity style={styles.docBtn}>
          <Ionicons name="cloud-upload-outline" size={20} color={cores.roxoClaro} />
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
            <Ionicons name="checkmark-circle" size={56} color={cores.sucesso} />
            <Text style={styles.modalTitulo}>Empresa cadastrada!</Text>
            <Text style={styles.modalTexto}>
              Seus dados foram enviados para verificação. Você já pode começar a criar eventos comerciais.
            </Text>
            <TouchableOpacity style={[styles.ctaBtn, { backgroundColor: cores.sucesso }]} onPress={() => { setModalSucesso(false); router.back(); }}>
              <Text style={styles.ctaBtnText}>Continuar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(cores: Cores) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: cores.background },
    scroll: { paddingHorizontal: SPACING.lg, paddingTop: Platform.OS === 'web' ? 20 : 50, paddingBottom: 40 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.lg },
    headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: 'bold', color: cores.branco },

    infoCard: { flexDirection: 'row', backgroundColor: cores.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, gap: SPACING.sm, marginBottom: SPACING.lg, borderLeftWidth: 3, borderLeftColor: cores.laranja },
    infoContent: { flex: 1 },
    infoTitle: { color: cores.laranja, fontSize: FONT_SIZE.sm, fontWeight: 'bold', marginBottom: 4 },
    infoDesc: { color: cores.cinzaClaro, fontSize: FONT_SIZE.xs, lineHeight: 18 },

    sectionTitle: { color: cores.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold', marginBottom: SPACING.sm, marginTop: SPACING.md },
    label: { color: cores.branco, fontSize: FONT_SIZE.sm, fontWeight: '600', marginBottom: SPACING.xs },
    inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: cores.backgroundInput, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, height: 48, marginBottom: SPACING.md },
    input: { flex: 1, color: cores.branco, fontSize: FONT_SIZE.sm },

    segGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
    segChip: { backgroundColor: cores.backgroundCard, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderWidth: 1, borderColor: 'transparent' },
    segChipAtivo: { borderColor: cores.laranja },
    segText: { color: cores.cinza, fontSize: FONT_SIZE.xs },
    segTextAtivo: { color: cores.laranja },

    docBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: cores.backgroundCard, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: cores.border, borderStyle: 'dashed' },
    docBtnText: { color: cores.roxoClaro, fontSize: FONT_SIZE.sm },
    docHint: { color: cores.cinza, fontSize: FONT_SIZE.xs, marginTop: 6, marginBottom: SPACING.md },

    erroText: { color: cores.erro, fontSize: FONT_SIZE.xs, marginBottom: SPACING.sm },
    ctaBtn: { paddingVertical: 14, backgroundColor: cores.roxo, borderRadius: RADIUS.sm, alignItems: 'center', marginTop: SPACING.sm },
    ctaBtnText: { color: cores.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },

    modalOverlay: { flex: 1, backgroundColor: cores.overlay, justifyContent: 'center', padding: SPACING.lg },
    modalContent: { backgroundColor: cores.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.xl, alignItems: 'center' },
    modalTitulo: { color: cores.branco, fontSize: FONT_SIZE.xl, fontWeight: 'bold', textAlign: 'center', marginTop: SPACING.md, marginBottom: SPACING.md },
    modalTexto: { color: cores.cinzaClaro, fontSize: FONT_SIZE.sm, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.md },
  });
}
