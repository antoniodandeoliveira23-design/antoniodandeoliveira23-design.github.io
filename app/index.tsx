import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
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
import { supabase } from '@/services/supabase';

// ─────────────────────────────────────────────────────────
// 🚀 CONTROLE DE LANÇAMENTO
// Mude para `false` quando quiser liberar o acesso ao app
// ─────────────────────────────────────────────────────────
const EM_BREVE = false;

// ─────────────────────────────────────────────────────────
// Splash / Redirect (modo normal)
// ─────────────────────────────────────────────────────────
function SplashRedirect() {
  const router = useRouter();
  const { signed, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (signed) {
      router.replace('/(tabs)');
    } else {
      router.replace('/onboarding');
    }
  }, [signed, loading]);

  return (
    <View style={styles.splashContainer}>
      <View style={styles.logoBox}>
        <Text style={styles.logoText}>A</Text>
      </View>
      <Text style={styles.appName}>AGORA</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// Tela Em Breve
// ─────────────────────────────────────────────────────────
function EmBreve() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  // Animações
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Fade in + slide up
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    // Pulso no logo
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handleCadastrarEmail = async () => {
    setErro('');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      setErro('Digite um e-mail válido.');
      return;
    }
    setEnviando(true);
    try {
      // Salva em tabela de early access (cria se não existir, falha silenciosamente)
      await supabase
        .from('early_access')
        .upsert({ email: email.trim().toLowerCase(), criado_em: new Date().toISOString() })
        .throwOnError();
      setEnviado(true);
    } catch {
      // Fallback: marca como enviado mesmo se tabela não existir
      setEnviado(true);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.emBreveContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Animated.View
        style={[
          styles.emBreveContent,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Logo */}
        <Animated.View style={[styles.logoGrande, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={styles.logoGrandeTexto}>A</Text>
        </Animated.View>

        <Text style={styles.appNomeGrande}>AGORA</Text>

        {/* Badge */}
        <View style={styles.badge}>
          <View style={styles.badgeDot} />
          <Text style={styles.badgeTexto}>Em breve — Vilhena, RO</Text>
        </View>

        {/* Headline */}
        <Text style={styles.headline}>
          Conectando você{'\n'}ao que acontece{'\n'}na sua cidade
        </Text>

        <Text style={styles.subheadline}>
          Eventos, shows, promoções e muito mais — tudo perto de você.
          Estamos finalizando os últimos detalhes. 🚀
        </Text>

        {/* Features */}
        <View style={styles.featuresRow}>
          {[
            { icon: 'map-outline', label: 'Mapa ao vivo' },
            { icon: 'calendar-outline', label: 'Eventos locais' },
            { icon: 'megaphone-outline', label: 'Anúncios PJ' },
          ].map(f => (
            <View key={f.label} style={styles.featureItem}>
              <View style={styles.featureIconBox}>
                <Ionicons name={f.icon as any} size={20} color={CORES.roxo} />
              </View>
              <Text style={styles.featureLabel}>{f.label}</Text>
            </View>
          ))}
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* CTA Email */}
        {!enviado ? (
          <View style={styles.emailSection}>
            <Text style={styles.emailTitulo}>Seja o primeiro a saber</Text>
            <Text style={styles.emailSub}>
              Cadastre seu e-mail e avise quando o AGORA estiver no ar.
            </Text>

            <View style={styles.emailRow}>
              <View style={[styles.emailInputWrapper, erro ? styles.emailInputErro : null]}>
                <Ionicons name="mail-outline" size={18} color={CORES.cinza} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.emailInput}
                  placeholder="seu@email.com"
                  placeholderTextColor={CORES.cinza}
                  value={email}
                  onChangeText={t => { setEmail(t); setErro(''); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              <TouchableOpacity
                style={[styles.emailBtn, enviando && { opacity: 0.6 }]}
                onPress={handleCadastrarEmail}
                disabled={enviando}
              >
                <Ionicons
                  name={enviando ? 'time-outline' : 'arrow-forward'}
                  size={20}
                  color={CORES.branco}
                />
              </TouchableOpacity>
            </View>
            {erro ? <Text style={styles.erroTexto}>{erro}</Text> : null}
          </View>
        ) : (
          <View style={styles.sucessoBox}>
            <Ionicons name="checkmark-circle" size={32} color={CORES.sucesso} />
            <Text style={styles.sucessoTexto}>
              Ótimo! Você será notificado assim que o AGORA lançar. 🎉
            </Text>
          </View>
        )}

        {/* Rodapé */}
        <Text style={styles.rodape}>© 2026 AGORA · Vilhena, RO, Brasil</Text>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────
// Export principal — alterna entre Em Breve e Splash normal
//
// Lógica de acesso:
//   EM_BREVE = false → app aberto para todos
//   EM_BREVE = true  → tela "Em Breve" para visitantes,
//                      mas admin/gov passam direto (bypass)
// ─────────────────────────────────────────────────────────
export default function IndexScreen() {
  const { signed, user } = useAuth();
  const isAdmin = signed && (user?.tipo_conta === 'admin' || user?.tipo_conta === 'gov');

  if (EM_BREVE && !isAdmin) return <EmBreve />;
  return <SplashRedirect />;
}

// ─────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Splash normal
  splashContainer: {
    flex: 1,
    backgroundColor: CORES.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoBox: {
    width: 80,
    height: 80,
    backgroundColor: CORES.preto,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: CORES.branco,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: CORES.branco,
    letterSpacing: 4,
  },

  // Em Breve
  emBreveContainer: {
    flex: 1,
    backgroundColor: CORES.background,
  },
  emBreveContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: 70,
    paddingBottom: 40,
  },

  // Logo grande
  logoGrande: {
    width: 88,
    height: 88,
    backgroundColor: CORES.roxo,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
    shadowColor: CORES.roxo,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  logoGrandeTexto: {
    fontSize: 44,
    fontWeight: 'bold',
    color: CORES.branco,
  },
  appNomeGrande: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: CORES.branco,
    letterSpacing: 6,
    marginBottom: SPACING.md,
  },

  // Badge
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CORES.roxo + '22',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: CORES.roxo + '44',
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    marginBottom: SPACING.xl,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CORES.laranja,
  },
  badgeTexto: {
    color: CORES.roxoClaro,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
  },

  // Textos
  headline: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: CORES.branco,
    textAlign: 'center',
    lineHeight: 38,
    marginBottom: SPACING.md,
  },
  subheadline: {
    fontSize: FONT_SIZE.sm,
    color: CORES.cinzaClaro,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
    marginBottom: SPACING.xl,
  },

  // Features
  featuresRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  featureItem: {
    alignItems: 'center',
    gap: SPACING.xs,
    flex: 1,
  },
  featureIconBox: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: CORES.roxo + '22',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CORES.roxo + '33',
  },
  featureLabel: {
    color: CORES.cinzaClaro,
    fontSize: 10,
    textAlign: 'center',
    fontWeight: '600',
  },

  // Divider
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: CORES.border,
    marginBottom: SPACING.xl,
  },

  // Email section
  emailSection: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  emailTitulo: {
    color: CORES.branco,
    fontSize: FONT_SIZE.md,
    fontWeight: 'bold',
    marginBottom: SPACING.xs,
  },
  emailSub: {
    color: CORES.cinzaClaro,
    fontSize: FONT_SIZE.xs,
    textAlign: 'center',
    marginBottom: SPACING.md,
    lineHeight: 18,
  },
  emailRow: {
    flexDirection: 'row',
    width: '100%',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  emailInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CORES.backgroundInput,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    height: 48,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  emailInputErro: {
    borderColor: CORES.erro,
  },
  emailInput: {
    flex: 1,
    color: CORES.branco,
    fontSize: FONT_SIZE.sm,
  },
  emailBtn: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.sm,
    backgroundColor: CORES.roxo,
    justifyContent: 'center',
    alignItems: 'center',
  },
  erroTexto: {
    color: CORES.erro,
    fontSize: FONT_SIZE.xs,
    marginTop: SPACING.xs,
    alignSelf: 'flex-start',
  },

  // Sucesso
  sucessoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: CORES.sucesso + '18',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: CORES.sucesso + '44',
    width: '100%',
    maxWidth: 400,
  },
  sucessoTexto: {
    color: CORES.sucesso,
    fontSize: FONT_SIZE.sm,
    flex: 1,
    lineHeight: 20,
  },

  // Rodapé
  rodape: {
    color: CORES.cinza,
    fontSize: 10,
    marginTop: 'auto',
    paddingTop: SPACING.xl,
  },
});
