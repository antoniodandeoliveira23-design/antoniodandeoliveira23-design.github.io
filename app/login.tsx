import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useState, useEffect } from 'react';
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
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
import { setDemoTipoConta } from '@/services/auth';
import SocialLoginButtons from '@/components/SocialLoginButtons';
import type { TipoConta } from '@/types';

const { width } = Dimensions.get('window');

const DEMO_ACCOUNTS: { tipo: TipoConta; label: string; icon: string; desc: string; iconLib?: 'material' }[] = [
  { tipo: 'pf', label: 'Pessoa Física', icon: 'person', desc: 'Eventos gratuitos e sociais' },
  { tipo: 'pj', label: 'Empresa (PJ)', icon: 'office-building', desc: 'Eventos comerciais pagos', iconLib: 'material' },
  { tipo: 'gov', label: 'Governo', icon: 'shield-checkmark', desc: 'Eventos públicos oficiais' },
  { tipo: 'admin', label: 'Administrador', icon: 'settings', desc: 'Moderação e gestão' },
];

export default function Login() {
  const router = useRouter();
  const { erro: erroParam } = useLocalSearchParams<{ erro?: string }>();
  const { login, loginDemo, loginSocial, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [erro, setErro] = useState('');
  const [demoTipo, setDemoTipo] = useState<TipoConta>('pf');

  useEffect(() => {
    if (erroParam === 'oauth_desativado') {
      setErro('Login social não está ativado ainda. Use e-mail/senha ou o acesso rápido abaixo.');
    }
  }, [erroParam]);

  const handleLogin = async () => {
    setErro('');
    if (!email.trim() || !senha.trim()) {
      setErro('Preencha e-mail e senha.');
      return;
    }
    try {
      await login(email.trim(), senha);
    } catch (e: any) {
      setErro(e.message || 'Erro ao fazer login.');
    }
  };

  const handleDemoLogin = async (tipo: TipoConta) => {
    setDemoTipo(tipo);
    try {
      await loginDemo(tipo);
    } catch (e: any) {
      setErro(e.message || 'Erro ao entrar.');
    }
  };

  const handleSocial = async (provider: 'google' | 'apple' | 'x') => {
    setErro('');
    try {
      await loginSocial(provider);
    } catch (e: any) {
      const msg: string = e.message || '';
      if (msg === 'LOGIN_CANCELADO') return; // usuário fechou o browser — silencioso
      if (msg.includes('provider') || msg.includes('not enabled') || msg.includes('disabled')) {
        setErro('Este método de login ainda não está ativo. Use e-mail e senha.');
        return;
      }
      setErro(msg || 'Erro ao fazer login social. Tente novamente.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>A</Text>
        </View>

        <Text style={styles.titulo}>Entrar no AGORA</Text>

        {/* Demo Accounts */}
        <Text style={styles.demoLabel}>Acesso rápido (Demo)</Text>
        <View style={styles.demoGrid}>
          {DEMO_ACCOUNTS.map((acc) => (
            <TouchableOpacity
              key={acc.tipo}
              style={[styles.demoCard, demoTipo === acc.tipo && styles.demoCardAtivo]}
              onPress={() => handleDemoLogin(acc.tipo)}
            >
              <View style={[styles.demoIconCircle, demoTipo === acc.tipo && styles.demoIconAtivo]}>
                {acc.iconLib === 'material' ? (
                  <MaterialCommunityIcons name={acc.icon as any} size={20} color={demoTipo === acc.tipo ? CORES.branco : CORES.roxoClaro} />
                ) : (
                  <Ionicons name={acc.icon as any} size={20} color={demoTipo === acc.tipo ? CORES.branco : CORES.roxoClaro} />
                )}
              </View>
              <Text style={styles.demoCardLabel}>{acc.label}</Text>
              <Text style={styles.demoCardDesc}>{acc.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Login Social — botões com branding real */}
        <SocialLoginButtons
          onPress={handleSocial}
          disabled={loading}
          variant="full"
        />

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Ou entre com e-mail</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Form */}
        <Text style={styles.label}>E-mail</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="mail-outline" size={18} color={CORES.cinza} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="E-mail"
            placeholderTextColor={CORES.cinza}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <Text style={styles.label}>Senha</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="lock-closed-outline" size={18} color={CORES.cinza} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Senha"
            placeholderTextColor={CORES.cinza}
            value={senha}
            onChangeText={setSenha}
            secureTextEntry={!senhaVisivel}
          />
          <TouchableOpacity onPress={() => setSenhaVisivel(!senhaVisivel)}>
            <Ionicons name={senhaVisivel ? 'eye-outline' : 'eye-off-outline'} size={18} color={CORES.cinza} />
          </TouchableOpacity>
        </View>

        {erro ? <Text style={styles.erroText}>{erro}</Text> : null}

        <TouchableOpacity style={[styles.ctaBtn, loading && styles.ctaBtnDisabled]} onPress={handleLogin} disabled={loading}>
          <Text style={styles.ctaBtnText}>{loading ? 'Entrando...' : 'Entrar'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/recuperar-senha' as any)} style={styles.forgotBtn}>
          <Text style={styles.forgotText}>Esqueceu a senha?</Text>
        </TouchableOpacity>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Não tem uma conta? </Text>
          <TouchableOpacity onPress={() => router.push('/register')}>
            <Text style={styles.footerLink}>Registrar</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.background },
  scroll: { flexGrow: 1, alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: 60, paddingBottom: 40 },
  logoBox: { width: 56, height: 56, backgroundColor: CORES.preto, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md },
  logoText: { fontSize: 28, fontWeight: 'bold', color: CORES.branco },
  titulo: { fontSize: FONT_SIZE.xxl, fontWeight: 'bold', color: CORES.branco, marginBottom: SPACING.lg },

  // Demo accounts
  demoLabel: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs, fontWeight: '600', marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 1 },
  demoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, width: '100%', maxWidth: 400, marginBottom: SPACING.lg, justifyContent: 'center' },
  demoCard: { width: '47%', backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center' },
  demoCardAtivo: { borderColor: CORES.laranja },
  demoIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: CORES.background, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xs },
  demoIconAtivo: { backgroundColor: CORES.roxo },
  demoCardLabel: { color: CORES.branco, fontSize: FONT_SIZE.xs, fontWeight: 'bold', textAlign: 'center' },
  demoCardDesc: { color: CORES.cinzaClaro, fontSize: 10, textAlign: 'center', marginTop: 2 },

  dividerRow: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 400, marginBottom: SPACING.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: CORES.border },
  dividerText: { color: CORES.cinzaClaro, marginHorizontal: SPACING.sm, fontSize: FONT_SIZE.xs },
  label: { color: CORES.branco, fontSize: FONT_SIZE.sm, fontWeight: '600', alignSelf: 'flex-start', maxWidth: 400, width: '100%', marginBottom: SPACING.xs },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: CORES.backgroundInput, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, width: '100%', maxWidth: 400, height: 48, marginBottom: SPACING.md },
  inputIcon: { marginRight: SPACING.sm },
  input: { flex: 1, color: CORES.branco, fontSize: FONT_SIZE.sm },
  erroText: { color: CORES.erro, fontSize: FONT_SIZE.xs, alignSelf: 'flex-start', maxWidth: 400, marginBottom: SPACING.sm },
  ctaBtn: { width: '100%', maxWidth: 400, paddingVertical: 14, backgroundColor: CORES.roxo, borderRadius: RADIUS.sm, alignItems: 'center', marginTop: SPACING.sm, marginBottom: SPACING.lg },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaBtnText: { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },
  forgotBtn: { marginBottom: SPACING.lg, alignSelf: 'flex-end', maxWidth: 400, width: '100%' },
  forgotText: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, textAlign: 'right' },
  footerRow: { flexDirection: 'row' },
  footerText: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm },
  footerLink: { color: CORES.roxoClaro, fontSize: FONT_SIZE.sm, fontWeight: '600' },
});
