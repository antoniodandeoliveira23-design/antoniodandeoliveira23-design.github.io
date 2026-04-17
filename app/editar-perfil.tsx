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
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import type { Genero } from '@/types';

export default function EditarPerfilScreen() {
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
            <Ionicons name="arrow-back" size={24} color={CORES.branco} />
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
            <Ionicons name="camera-outline" size={16} color={CORES.roxoClaro} />
            <Text style={styles.changeAvatarText}>Alterar foto</Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.rowFields}>
          <View style={styles.halfField}>
            <Text style={styles.label}>Nome</Text>
            <View style={styles.inputWrapper}>
              <TextInput style={styles.input} value={nome} onChangeText={setNome} placeholder="Nome" placeholderTextColor={CORES.cinza} />
            </View>
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>Sobrenome</Text>
            <View style={styles.inputWrapper}>
              <TextInput style={styles.input} value={sobrenome} onChangeText={setSobrenome} placeholder="Sobrenome" placeholderTextColor={CORES.cinza} />
            </View>
          </View>
        </View>

        <Text style={styles.label}>Nome de usuário</Text>
        <View style={styles.inputWrapper}>
          <Text style={styles.inputPrefix}>@</Text>
          <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="username" placeholderTextColor={CORES.cinza} autoCapitalize="none" />
        </View>

        <Text style={styles.label}>E-mail</Text>
        <View style={[styles.inputWrapper, styles.inputDisabled]}>
          <Ionicons name="mail-outline" size={16} color={CORES.cinza} style={{ marginRight: SPACING.sm }} />
          <Text style={styles.inputTextDisabled}>{user?.email}</Text>
        </View>

        <Text style={styles.label}>Bio</Text>
        <View style={[styles.inputWrapper, { height: 80, alignItems: 'flex-start', paddingTop: 12 }]}>
          <TextInput
            style={[styles.input, { textAlignVertical: 'top' }]}
            value={bio}
            onChangeText={setBio}
            placeholder="Conte um pouco sobre você..."
            placeholderTextColor={CORES.cinza}
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
              <Ionicons name={g.icon as any} size={16} color={genero === g.value ? CORES.laranja : CORES.cinza} />
              <Text style={[styles.generoChipText, genero === g.value && styles.generoChipTextAtivo]}>{g.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Info tipo de conta */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color={CORES.roxoClaro} />
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
            <Ionicons name="checkmark-circle" size={56} color={CORES.sucesso} />
            <Text style={styles.modalTitulo}>Perfil atualizado!</Text>
            <Text style={styles.modalTexto}>Suas informações foram salvas com sucesso.</Text>
            <TouchableOpacity style={[styles.ctaBtn, { backgroundColor: CORES.sucesso }]} onPress={() => { setModalSucesso(false); router.back(); }}>
              <Text style={styles.ctaBtnText}>Voltar ao perfil</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.background },
  scroll: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingTop: 50, paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xl },
  headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: 'bold', color: CORES.branco },

  avatarSection: { alignItems: 'center', marginBottom: SPACING.xl },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: CORES.roxo, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  avatarText: { fontSize: 32, fontWeight: 'bold', color: CORES.branco },
  changeAvatarBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  changeAvatarText: { color: CORES.roxoClaro, fontSize: FONT_SIZE.sm, fontWeight: '600' },

  rowFields: { flexDirection: 'row', gap: SPACING.md },
  halfField: { flex: 1 },

  label: { color: CORES.branco, fontSize: FONT_SIZE.sm, fontWeight: '600', marginBottom: SPACING.xs },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: CORES.backgroundInput, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, height: 48, marginBottom: SPACING.md },
  input: { flex: 1, color: CORES.branco, fontSize: FONT_SIZE.sm },
  inputPrefix: { color: CORES.cinza, fontSize: FONT_SIZE.sm, marginRight: 4 },
  inputDisabled: { opacity: 0.6 },
  inputTextDisabled: { color: CORES.cinza, fontSize: FONT_SIZE.sm },
  charCount: { color: CORES.cinza, fontSize: FONT_SIZE.xs, alignSelf: 'flex-end', marginTop: -12, marginBottom: SPACING.md },

  generoRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  generoChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.sm, paddingVertical: SPACING.sm, borderWidth: 1, borderColor: 'transparent' },
  generoChipAtivo: { borderColor: CORES.laranja },
  generoChipText: { color: CORES.cinza, fontSize: FONT_SIZE.xs },
  generoChipTextAtivo: { color: CORES.laranja },

  infoCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg },
  infoCardContent: { flex: 1 },
  infoCardTitle: { color: CORES.branco, fontSize: FONT_SIZE.sm, fontWeight: '600' },
  infoCardText: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs, marginTop: 2 },

  erroText: { color: CORES.erro, fontSize: FONT_SIZE.xs, marginBottom: SPACING.sm },

  ctaBtn: { paddingVertical: 14, backgroundColor: CORES.roxo, borderRadius: RADIUS.sm, alignItems: 'center', marginTop: SPACING.sm },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaBtnText: { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: CORES.overlay, justifyContent: 'center', padding: SPACING.lg },
  modalContent: { backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.xl, alignItems: 'center' },
  modalTitulo: { color: CORES.branco, fontSize: FONT_SIZE.xl, fontWeight: 'bold', marginTop: SPACING.md, marginBottom: SPACING.sm },
  modalTexto: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, textAlign: 'center', marginBottom: SPACING.lg },
});
