import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';

export default function PermissaoLocalizacao() {
  const router = useRouter();

  const handlePermitir = async () => {
    if (Platform.OS === 'web') {
      try {
        await navigator.geolocation.getCurrentPosition(() => {});
      } catch {}
    }
    router.replace('/(tabs)');
  };

  const handlePular = () => {
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      {/* Ilustração */}
      <View style={styles.illustration}>
        <View style={styles.circleOuter}>
          <View style={styles.circleMiddle}>
            <View style={styles.circleInner}>
              <Ionicons name="location" size={48} color={CORES.branco} />
            </View>
          </View>
        </View>
        {/* Pins decorativos */}
        <View style={[styles.pin, { top: 30, left: 60 }]}>
          <Ionicons name="location" size={20} color={CORES.laranja} />
        </View>
        <View style={[styles.pin, { top: 80, right: 40 }]}>
          <Ionicons name="location" size={16} color={CORES.roxoClaro} />
        </View>
        <View style={[styles.pin, { bottom: 40, left: 80 }]}>
          <Ionicons name="location" size={18} color={CORES.roxoClaro} />
        </View>
      </View>

      {/* Texto */}
      <Text style={styles.titulo}>Ative sua localização</Text>
      <Text style={styles.descricao}>
        Para mostrar os eventos mais relevantes perto de você, precisamos acessar sua localização.
      </Text>

      {/* Benefícios */}
      <View style={styles.beneficios}>
        <View style={styles.beneficio}>
          <View style={styles.beneficioIcon}>
            <Ionicons name="map" size={18} color={CORES.laranja} />
          </View>
          <Text style={styles.beneficioText}>Veja eventos no mapa ao seu redor</Text>
        </View>
        <View style={styles.beneficio}>
          <View style={styles.beneficioIcon}>
            <Ionicons name="navigate" size={18} color={CORES.laranja} />
          </View>
          <Text style={styles.beneficioText}>Receba indicações de como chegar</Text>
        </View>
        <View style={styles.beneficio}>
          <View style={styles.beneficioIcon}>
            <Ionicons name="notifications" size={18} color={CORES.laranja} />
          </View>
          <Text style={styles.beneficioText}>Notificações de eventos próximos</Text>
        </View>
      </View>

      {/* Botões */}
      <TouchableOpacity style={styles.ctaBtn} onPress={handlePermitir}>
        <Ionicons name="location" size={20} color={CORES.branco} />
        <Text style={styles.ctaBtnText}>Permitir localização</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.skipBtn} onPress={handlePular}>
        <Text style={styles.skipText}>Agora não</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl },

  illustration: { width: 200, height: 200, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xl, position: 'relative' },
  circleOuter: { width: 160, height: 160, borderRadius: 80, backgroundColor: CORES.roxo + '15', justifyContent: 'center', alignItems: 'center' },
  circleMiddle: { width: 120, height: 120, borderRadius: 60, backgroundColor: CORES.roxo + '30', justifyContent: 'center', alignItems: 'center' },
  circleInner: { width: 80, height: 80, borderRadius: 40, backgroundColor: CORES.roxo, justifyContent: 'center', alignItems: 'center' },
  pin: { position: 'absolute' },

  titulo: { fontSize: FONT_SIZE.xxl, fontWeight: 'bold', color: CORES.branco, textAlign: 'center', marginBottom: SPACING.sm },
  descricao: { fontSize: FONT_SIZE.sm, color: CORES.cinzaClaro, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.xl },

  beneficios: { width: '100%', gap: SPACING.md, marginBottom: SPACING.xl },
  beneficio: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  beneficioIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: CORES.backgroundCard, justifyContent: 'center', alignItems: 'center' },
  beneficioText: { color: CORES.branco, fontSize: FONT_SIZE.sm, flex: 1 },

  ctaBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: CORES.roxo, borderRadius: RADIUS.sm, paddingVertical: 14, paddingHorizontal: SPACING.xl, width: '100%', justifyContent: 'center' },
  ctaBtnText: { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },

  skipBtn: { marginTop: SPACING.md, paddingVertical: SPACING.sm },
  skipText: { color: CORES.cinza, fontSize: FONT_SIZE.sm },
});
