/**
 * components/SocialLoginButtons.tsx
 * Botões OAuth com branding correto (Google, Apple, X/Twitter).
 * Reutilizável em login.tsx e register.tsx.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';

type Provider = 'google' | 'apple' | 'x';

interface Props {
  onPress: (provider: Provider) => Promise<void>;
  disabled?: boolean;
  /** 'compact' = linha de ícones, 'full' = botões completos com nome */
  variant?: 'compact' | 'full';
}

// styles deve ser declarado ANTES de PROVIDERS para que os ícones inline funcionem
const styles = StyleSheet.create({
  // ── Compact (ícones) ──────────────────────────────────────────────
  compactRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'center',
  },
  compactBtn: {
    width: 56,
    height: 48,
    borderRadius: RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CORES.border,
    backgroundColor: CORES.backgroundCard,
  },
  googleCompact: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
  },
  appleCompact: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  xCompact: {
    backgroundColor: '#000000',
    borderColor: '#333333',
  },

  // ── Full (botões com texto) ───────────────────────────────────────
  fullColumn: {
    width: '100%',
    maxWidth: 400,
    gap: SPACING.sm,
  },
  fullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  googleBtn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
  },
  appleBtn: {
    backgroundColor: '#000000',
  },
  xBtn: {
    backgroundColor: '#000000',
    borderColor: '#333333',
  },
  fullBtnText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  googleBtnText: {
    color: '#374151',
  },
  btnDisabled: {
    opacity: 0.55,
  },

  // ── Ícones inline ─────────────────────────────────────────────────
  googleIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4285F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleG: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
    lineHeight: 16,
  },
  xIcon: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  xText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 20,
  },
});

const PROVIDERS: { id: Provider; label: string; icon: React.ReactNode }[] = [
  {
    id: 'google',
    label: 'Continuar com Google',
    icon: (
      <View style={styles.googleIcon}>
        <Text style={styles.googleG}>G</Text>
      </View>
    ),
  },
  {
    id: 'apple',
    label: 'Continuar com Apple',
    icon: <Ionicons name="logo-apple" size={20} color="#FFFFFF" />,
  },
  {
    id: 'x',
    label: 'Continuar com X',
    icon: (
      <View style={styles.xIcon}>
        <Text style={styles.xText}>𝕏</Text>
      </View>
    ),
  },
];

export default function SocialLoginButtons({ onPress, disabled, variant = 'compact' }: Props) {
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);

  const handlePress = async (provider: Provider) => {
    if (loadingProvider || disabled) return;
    setLoadingProvider(provider);
    try {
      await onPress(provider);
    } finally {
      setLoadingProvider(null);
    }
  };

  if (variant === 'full') {
    return (
      <View style={styles.fullColumn}>
        {PROVIDERS.map(({ id, label, icon }) => {
          // Apple Sign-In só aparece no iOS (guideline Apple)
          if (id === 'apple' && Platform.OS !== 'ios') return null;
          const isLoading = loadingProvider === id;
          return (
            <TouchableOpacity
              key={id}
              style={[
                styles.fullBtn,
                id === 'google' && styles.googleBtn,
                id === 'apple'  && styles.appleBtn,
                id === 'x'      && styles.xBtn,
                (isLoading || !!loadingProvider) && styles.btnDisabled,
              ]}
              onPress={() => handlePress(id)}
              disabled={!!loadingProvider || disabled}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator
                  size="small"
                  color={id === 'google' ? '#374151' : '#FFFFFF'}
                />
              ) : (
                icon
              )}
              <Text style={[
                styles.fullBtnText,
                id === 'google' && styles.googleBtnText,
              ]}>
                {isLoading ? 'Entrando...' : label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  // Variante compacta: linha de ícones
  return (
    <View style={styles.compactRow}>
      {PROVIDERS.map(({ id, icon }) => {
        if (id === 'apple' && Platform.OS !== 'ios') return null;
        const isLoading = loadingProvider === id;
        return (
          <TouchableOpacity
            key={id}
            style={[
              styles.compactBtn,
              id === 'google' && styles.googleCompact,
              id === 'apple'  && styles.appleCompact,
              id === 'x'      && styles.xCompact,
              (isLoading || !!loadingProvider) && styles.btnDisabled,
            ]}
            onPress={() => handlePress(id)}
            disabled={!!loadingProvider || disabled}
            activeOpacity={0.75}
          >
            {isLoading
              ? <ActivityIndicator size="small" color={id === 'google' ? '#374151' : CORES.branco} />
              : icon
            }
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
