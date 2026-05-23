import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FONT_SIZE, RADIUS, SPACING, type Cores } from '@/constants/theme';
import { useCores } from '@/contexts/TemaContext';
import { useSEO } from '@/hooks/useSEO';

const { width } = Dimensions.get('window');

export default function Onboarding() {
  const cores = useCores();
  const styles = createStyles(cores);
  const router = useRouter();
  const [step, setStep] = useState(0);

  useSEO({
    titulo:   'Bem-vindo ao AGORA',
    descricao: 'O AGORA conecta você aos melhores eventos, shows e promoções de Vilhena – RO. Cadastre-se grátis e fique por dentro.',
  });

  const STEPS = [
    {
      icon: 'map' as const,
      emoji_icon: 'compass' as const,
      title: 'Descubra o que está\nacontecendo na sua cidade',
      subtitle: 'Eventos, encontros e experiências reais perto de você — tudo no mapa.',
      color: cores.roxo,
    },
    {
      icon: 'add-circle' as const,
      emoji_icon: 'megaphone' as const,
      title: 'Crie e divulgue\nseus próprios eventos',
      subtitle: 'Seja visto por pessoas da sua região de forma simples e rápida.',
      color: cores.laranja,
    },
    {
      icon: 'people' as const,
      emoji_icon: 'chatbubbles' as const,
      title: 'Conecte-se com\nquem está por perto',
      subtitle: 'Mensagens, favoritos e uma comunidade local ativa.',
      color: cores.sucesso,
    },
  ];

  const current = STEPS[step];

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      router.replace('/login');
    }
  };

  const handleSkip = () => {
    router.replace('/login');
  };

  return (
    <View style={styles.container}>
      {/* Skip */}
      <View style={styles.topBar}>
        <View />
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
          <Text style={styles.skipText}>Pular</Text>
        </TouchableOpacity>
      </View>

      {/* Ilustração */}
      <View style={[styles.illustrationBox, { backgroundColor: current.color + '22' }]}>
        <View style={[styles.iconBg, { backgroundColor: current.color }]}>
          <Ionicons name={current.icon} size={48} color={cores.branco} />
        </View>
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />
      </View>

      {/* Indicadores */}
      <View style={styles.stepRow}>
        {STEPS.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === step ? [styles.dotActive, { backgroundColor: current.color }] : styles.dotInactive]}
          />
        ))}
      </View>

      {/* Texto */}
      <Text style={styles.title}>{current.title}</Text>
      <Text style={styles.subtitle}>{current.subtitle}</Text>

      {/* CTA */}
      <TouchableOpacity style={[styles.nextBtn, { backgroundColor: current.color }]} onPress={handleNext}>
        <Text style={styles.nextBtnText}>
          {step < STEPS.length - 1 ? 'Próximo' : 'Começar'}
        </Text>
        <Ionicons name={step < STEPS.length - 1 ? 'arrow-forward' : 'checkmark'} size={20} color={cores.branco} />
      </TouchableOpacity>

      {/* Passo label */}
      <Text style={styles.stepLabel}>{step + 1} de {STEPS.length}</Text>
    </View>
  );
}

function createStyles(cores: Cores) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: cores.background,
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      justifyContent: 'center',
    },
    topBar: {
      position: 'absolute',
      top: 50,
      left: SPACING.lg,
      right: SPACING.lg,
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    skipBtn: {
      borderWidth: 1,
      borderColor: cores.cinza,
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
    },
    skipText: {
      color: cores.branco,
      fontSize: FONT_SIZE.sm,
    },
    illustrationBox: {
      width: width * 0.75,
      height: width * 0.55,
      borderRadius: RADIUS.xl,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.xl,
      position: 'relative',
      overflow: 'hidden',
    },
    iconBg: {
      width: 96,
      height: 96,
      borderRadius: 48,
      justifyContent: 'center',
      alignItems: 'center',
    },
    decorCircle1: {
      position: 'absolute',
      top: -20,
      right: -20,
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: cores.roxo + '15',
    },
    decorCircle2: {
      position: 'absolute',
      bottom: -15,
      left: -15,
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: cores.laranja + '15',
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACING.xl,
      gap: 8,
    },
    dot: {
      height: 6,
      borderRadius: 3,
    },
    dotActive: {
      width: 28,
    },
    dotInactive: {
      width: 6,
      backgroundColor: cores.cinza,
    },
    title: {
      fontSize: FONT_SIZE.xxl,
      fontWeight: 'bold',
      color: cores.branco,
      textAlign: 'center',
      marginBottom: SPACING.md,
      lineHeight: 36,
    },
    subtitle: {
      fontSize: FONT_SIZE.md,
      color: cores.cinzaClaro,
      textAlign: 'center',
      marginBottom: SPACING.xl,
      lineHeight: 24,
      maxWidth: 320,
    },
    nextBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      width: width * 0.75,
      paddingVertical: 16,
      borderRadius: RADIUS.full,
    },
    nextBtnText: {
      color: cores.branco,
      fontSize: FONT_SIZE.md,
      fontWeight: 'bold',
    },
    stepLabel: {
      color: cores.cinza,
      fontSize: FONT_SIZE.xs,
      marginTop: SPACING.lg,
    },
  });
}
