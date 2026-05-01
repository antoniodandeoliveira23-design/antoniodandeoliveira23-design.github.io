/**
 * app/recuperar-senha.tsx
 * Tela de recuperação de senha — envia o link de redefinição por email.
 *
 * Fluxo:
 *   1. Usuário digita o email cadastrado
 *   2. `authService.recuperarSenha(email)` chama:
 *      supabase.auth.resetPasswordForEmail(email, { redirectTo: '/auth/callback' })
 *   3. Supabase envia email com template `supabase/auth/reset-password.html`
 *   4. Usuário clica no link → /auth/callback?type=recovery → /nova-senha
 *   5. Em /nova-senha, o usuário define a nova senha
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';

type Estado = 'form' | 'enviado' | 'erro';

export default function RecuperarSenha() {
  const router = useRouter();
  const { recuperarSenha } = useAuth();

  const [email, setEmail] = useState('');
  const [estado, setEstado] = useState<Estado>('form');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [tentativasRestantes, setTentativasRestantes] = useState<number | null>(null);

  const handleEnviar = async () => {
    setErro('');
    const emailTrim = email.trim().toLowerCase();

    if (!emailTrim || !emailTrim.includes('@')) {
      setErro('Informe um e-mail válido.');
      return;
    }

    setLoading(true);
    try {
      await recuperarSenha(emailTrim);
      setEstado('enviado');
    } catch (e: any) {
      const msg: string = e.message || '';

      if (msg.startsWith('RATE_LIMIT:')) {
        const segundos = parseInt(msg.split(':')[1], 10);
        const minutos = Math.ceil(segundos / 60);
        setErro(`Muitas tentativas. Aguarde ${minutos} min antes de tentar novamente.`);
        setTentativasRestantes(segundos);
      } else {
        // Não revela se o email existe ou não (segurança A01)
        // Mostra estado de sucesso mesmo se email não existir
        setEstado('enviado');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Estado: email enviado ─────────────────────────────────────────
  if (estado === 'enviado') {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={CORES.branco} />
        </TouchableOpacity>

        <View style={styles.successBox}>
          <View style={styles.iconCircle}>
            <Ionicons name="mail-outline" size={40} color={CORES.roxo} />
          </View>

          <Text style={styles.titulo}>Verifique seu email</Text>

          <Text style={styles.subtitulo}>
            Se o endereço{' '}
            <Text style={styles.emailDestaque}>{email.trim()}</Text>{' '}
            estiver cadastrado, você receberá um link para redefinir sua senha.
          </Text>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={16} color={CORES.cinzaClaro} />
              <Text style={styles.infoText}>O link expira em 1 hora</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="phone-portrait-outline" size={16} color={CORES.cinzaClaro} />
              <Text style={styles.infoText}>Abra o link no mesmo dispositivo</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="folder-outline" size={16} color={CORES.cinzaClaro} />
              <Text style={styles.infoText}>Verifique a pasta de spam se não encontrar</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.reenviarBtn}
            onPress={() => setEstado('form')}
          >
            <Text style={styles.reenviarText}>Não recebeu? Tentar novamente</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.voltarLoginBtn}
            onPress={() => router.replace('/login')}
          >
            <Text style={styles.voltarLoginText}>Voltar ao login</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Estado: form ──────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={22} color={CORES.branco} />
      </TouchableOpacity>

      <View style={styles.content}>
        {/* Ícone */}
        <View style={styles.iconCircle}>
          <Ionicons name="lock-closed-outline" size={40} color={CORES.roxo} />
        </View>

        <Text style={styles.titulo}>Recuperar senha</Text>
        <Text style={styles.subtitulo}>
          Digite o e-mail da sua conta. Vamos enviar um link para criar uma nova senha.
        </Text>

        {/* Campo email */}
        <Text style={styles.label}>E-mail</Text>
        <View style={[styles.inputWrapper, erro ? styles.inputErro : null]}>
          <Ionicons name="mail-outline" size={18} color={CORES.cinza} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="seu@email.com"
            placeholderTextColor={CORES.cinza}
            value={email}
            onChangeText={t => { setEmail(t); setErro(''); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            returnKeyType="send"
            onSubmitEditing={handleEnviar}
          />
        </View>

        {erro ? (
          <View style={styles.erroBox}>
            <Ionicons name="warning-outline" size={14} color={CORES.erro} />
            <Text style={styles.erroText}>{erro}</Text>
          </View>
        ) : null}

        {/* Botão enviar */}
        <TouchableOpacity
          style={[styles.ctaBtn, loading && styles.ctaBtnDisabled]}
          onPress={handleEnviar}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={CORES.branco} size="small" />
          ) : (
            <Text style={styles.ctaBtnText}>Enviar link de recuperação</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace('/login')} style={styles.voltarBtn}>
          <Text style={styles.voltarText}>Lembrou a senha? Entrar</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CORES.background,
  },
  backBtn: {
    position: 'absolute',
    top: 56,
    left: SPACING.lg,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: 120,
    paddingBottom: 40,
  },
  successBox: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: 120,
    paddingBottom: 40,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(108, 63, 197, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(108, 63, 197, 0.25)',
  },
  titulo: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: CORES.branco,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitulo: {
    fontSize: FONT_SIZE.sm,
    color: CORES.cinzaClaro,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
    maxWidth: 340,
  },
  emailDestaque: {
    color: CORES.roxoClaro,
    fontWeight: '600',
  },
  label: {
    color: CORES.branco,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    alignSelf: 'flex-start',
    width: '100%',
    maxWidth: 400,
    marginBottom: SPACING.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CORES.backgroundInput,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    width: '100%',
    maxWidth: 400,
    height: 52,
    marginBottom: SPACING.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputErro: {
    borderColor: CORES.erro,
  },
  inputIcon: {
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    color: CORES.branco,
    fontSize: FONT_SIZE.sm,
  },
  erroBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    maxWidth: 400,
    width: '100%',
    marginBottom: SPACING.sm,
  },
  erroText: {
    color: CORES.erro,
    fontSize: FONT_SIZE.xs,
    flex: 1,
  },
  ctaBtn: {
    width: '100%',
    maxWidth: 400,
    paddingVertical: 15,
    backgroundColor: CORES.roxo,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  ctaBtnDisabled: {
    opacity: 0.6,
  },
  ctaBtnText: {
    color: CORES.branco,
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
  },
  voltarBtn: {
    paddingVertical: SPACING.sm,
  },
  voltarText: {
    color: CORES.cinzaClaro,
    fontSize: FONT_SIZE.sm,
    textAlign: 'center',
  },

  // ── Estado: enviado ───────────────────────────────────────────────
  infoCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: CORES.backgroundCard,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
    borderWidth: 1,
    borderColor: CORES.border,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  infoText: {
    color: CORES.cinzaClaro,
    fontSize: FONT_SIZE.sm,
    flex: 1,
  },
  reenviarBtn: {
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  reenviarText: {
    color: CORES.roxoClaro,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  voltarLoginBtn: {
    paddingVertical: SPACING.sm,
  },
  voltarLoginText: {
    color: CORES.cinzaClaro,
    fontSize: FONT_SIZE.sm,
    textAlign: 'center',
  },
});
