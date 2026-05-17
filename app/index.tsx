import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CORES } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';

export default function SplashScreen() {
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
    <View style={styles.container}>
      <View style={styles.logoBox}>
        <Text style={styles.logoText}>A</Text>
      </View>
      <Text style={styles.appName}>AGORA</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
});
