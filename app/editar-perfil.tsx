import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
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
import type { Genero } from '@/types';

export default function EditarPerfilScreen() {
  const cores = useCores();
  const styles = createStyles(cores);
  const router = useRouter();
  const { user, updateUser } = useAuth();

  const [nome, setNome] = useState(user?.nome || '');
  const [sobrenome, setSobrenome] = useState(user?.sobrenome || '');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [genero, setGenero] = useState<Genero | ''>(user?.genero || '');
  const [salvando, setSalvando] = useState(false);
  const [modalSucesso, setModalSucesso] = useState(false);
  const [erro, setErro] = useState('');

  const handleSalvar = async () => {
    setErro('');
    if (!nome.trim() || !sobrenome.trim() || !username.trim()) {
      setErro('Nome, sobrenome e username são obrigatórios.');
      return;
    }
    setSalvando(true);
    try {
      await updateUser({
        nome: nome.trim(),
        sobrenome: sobrenome.trim(),
        username: username.trim().toLowerCase(),
        bio: bio.trim() || undefined,
        genero: genero || undefined,
      });
      setModalSucesso(true);
    } catch (e: any) {
      setErro(e.message || 'Erro ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={cores.branco} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Editar perfil</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{nome.charAt(0).toUpperCase() || 'U'}</Text>
          </View>
          <TouchableOpacity style={styles.changeAvatarBtn}>
            <Ionicons name="camera-outline" size={16} color={cores.roxoClaro} />
            <Text style={styles.changeAvatarText}>Alterar foto</Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.rowFields}>
          <View style={styles.halfField}>
            <Text style={styles.label}>Nome</Text>
            <View style={styles.inputWrapper}>
              <TextInput style={styles.input} value={nome} onChangeText={setNome} placeholder="Nome" placeholderTextColor={cores.cinza} />
            </View>
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>Sobrenome</Text>
            <View style={styles.inputWrapper}>
              <TextInput style={styles.input} value={sobrenome} onChangeText={setSobrenome} placeholder="Sobrenome" placeholderTextColor={cores.cinza} />
            </View>
          </View>
        </View>

        <Text style={styles.label}>Nome de usuário</Text>
        <View style={styles.inputWrapper}>
          <Text style={styles.inputPrefix}>@</Text>
          <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="username" placeholderTextColor={cores.cinza} autoCapitalize="none" />
        </View>

        <Text style={styles.label}>E-mail</Text>
        <View style={[styles.inputWrapper, styles.inputDisabled]}>
          <Ionicons name="mail-outline" size={16} color={cores.cinza} style={{ marginRight: SPACING.sm }} />
          <Text style={styles.inputTextDisabled}>{user?.email}</Text>
        </View>

        <Text style={styles.label}>Bio</Text>
        <View style={[styles.inputWrapper, { height: 80, alignItems: 'flex-start', paddingTop: 12 }]}>
          <TextInput
            style={[styles.input, { textAlignVertical: 'top' }]}
            value={bio}
            onChangeText={setBio}
            placeholder="Conte um pouco sobre você..."
            placeholderTextColor={cores.cinza}
            multiline
            maxLength={160}
          />
        </View>
        <Text style={styles.charCount}>{bio.length}/160</Text>

        {/* Gênero */}
        <Text style={styles.label}>Gênero</Text>
        <View style={styles.generoRow}>
          {([
            { value: 'feminino', label: 'Feminino', icon: 'female' },
            { value: 'masculino', label: 'Masculino', icon: 'male' },
            { value: 'outro', label: 'Outro', icon: 'transgender' },
          ] as { value: Genero; label: string; icon: string }[]).map((g) => (
            <TouchableOpacity
              key={g.value}
              style={[styles.generoChip, genero === g.value && styles.generoChipAtivo]}
              onPress={() => setGenero(genero === g.value ? '' : g.value)}
            >
              <Ionicons name={g.icon as any} size={16} color={genero === g.value ? cores.laranja : cores.cinza} />
              <Text style={[styles.generoChipText, genero === g.value && styles.generoChipTextAtivo]}>{g.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Info tipo de conta */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color={cores.roxoClaro} />
          <View style={styles.infoCardContent}>
            <Text style={styles.infoCardTitle}>Tipo de conta</Text>
            <Text style={styles.infoCardText}>
              {user?.tipo_conta === 'pj' ? 'Empresa' : user?.tipo_conta === 'gov' ? 'Órgão Público' : 'Pessoa Física'}
              {user?.verificado ? ' (Verificada)' : ''}
            </Text>
          </View>
        </View>

        {erro ? <Text style={styles.erroText}>{erro}</Text> : null}

        <TouchableOpacity style={[styles.ctaBtn, salvando && styles.ctaBtnDisabled]} onPress={handleSalvar} disabled={salvando}>
          <Text style={styles.ctaBtnText}>{salvando ? 'Salvando...' : 'Salvar alterações'}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modal de sucesso */}
      <Modal visible={modalSucesso} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="checkmark-circle" size={56} color={cores.sucesso} />
            <Text style={styles.modalTitulo}>Perfil atualizado!</Text>
            <Text style={styles.modalTexto}>Suas informações foram salvas com sucesso.</Text>
            <TouchableOpacity style={[styles.ctaBtn, { backgroundColor: cores.sucesso }]} onPress={() => { setModalSucesso(false); router.back(); }}>
              <Text style={styles.ctaBtnText}>Voltar ao perfil</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function createStyles(cores: Cores) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: cores.background },
    scroll: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingTop: 50, paddingBottom: 40 },

    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xl },
    headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: 'bold', color: cores.branco },

    avatarSection: { alignItems: 'center', marginBottom: SPACING.xl },
    avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: cores.roxo, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
    avatarText: { fontSize: 32, fontWeight: 'bold', color: cores.branco },
    changeAvatarBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    changeAvatarText: { color: cores.roxoClaro, fontSize: FONT_SIZE.sm, fontWeight: '600' },

    rowFields: { flexDirection: 'row', gap: SPACING.md },
    halfField: { flex: 1 },

    label: { color: cores.branco, fontSize: FONT_SIZE.sm, fontWeight: '600', marginBottom: SPACING.xs },
    inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: cores.backgroundInput, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, height: 48, marginBottom: SPACING.md },
    input: { flex: 1, color: cores.branco, fontSize: FONT_SIZE.sm },
    inputPrefix: { color: cores.cinza, fontSize: FONT_SIZE.sm, marginRight: 4 },
    inputDisabled: { opacity: 0.6 },
    inputTextDisabled: { color: cores.cinza, fontSize: FONT_SIZE.sm },
    charCount: { color: cores.cinza, fontSize: FONT_SIZE.xs, alignSelf: 'flex-end', marginTop: -12, marginBottom: SPACING.md },

    generoRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
    generoChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: cores.backgroundCard, borderRadius: RADIUS.sm, paddingVertical: SPACING.sm, borderWidth: 1, borderColor: 'transparent' },
    generoChipAtivo: { borderColor: cores.laranja },
    generoChipText: { color: cores.cinza, fontSize: FONT_SIZE.xs },
    generoChipTextAtivo: { color: cores.laranja },

    infoCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: cores.backgroundCard, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg },
    infoCardContent: { flex: 1 },
    infoCardTitle: { color: cores.branco, fontSize: FONT_SIZE.sm, fontWeight: '600' },
    infoCardText: { color: cores.cinzaClaro, fontSize: FONT_SIZE.xs, marginTop: 2 },

    erroText: { color: cores.erro, fontSize: FONT_SIZE.xs, marginBottom: SPACING.sm },

    ctaBtn: { paddingVertical: 14, backgroundColor: cores.roxo, borderRadius: RADIUS.sm, alignItems: 'center', marginTop: SPACING.sm },
    ctaBtnDisabled: { opacity: 0.6 },
    ctaBtnText: { color: cores.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },

    modalOverlay: { flex: 1, backgroundColor: cores.overlay, justifyContent: 'center', padding: SPACING.lg },
    modalContent: { backgroundColor: cores.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.xl, alignItems: 'center' },
    modalTitulo: { color: cores.branco, fontSize: FONT_SIZE.xl, fontWeight: 'bold', marginTop: SPACING.md, marginBottom: SPACING.sm },
    modalTexto: { color: cores.cinzaClaro, fontSize: FONT_SIZE.sm, textAlign: 'center', marginBottom: SPACING.lg },
  });
}
