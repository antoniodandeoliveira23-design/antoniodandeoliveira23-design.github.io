import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { EventosProvider } from '@/contexts/EventosContext';
import { CORES } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { signed, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(tabs)';
    const publicRoutes = ['login', 'register', 'onboarding', 'index', 'permissao-localizacao'];
    const inPublicRoute = !segments[0] || publicRoutes.includes(segments[0] as string);
    const inProtectedRoute = !inAuthGroup && !inPublicRoute;

    if (signed && inPublicRoute) {
      // Logado mas em rota pública -> ir para home
      router.replace('/(tabs)');
    } else if (!signed && (inAuthGroup || inProtectedRoute)) {
      // Não logado mas em rota protegida -> ir para login
      router.replace('/login');
    }
  }, [signed, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: CORES.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={CORES.roxo} />
      </View>
    );
  }

  return <>{children}</>;
}

function RootLayoutContent() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const meta = (name: string, content: string) => {
        let tag = document.querySelector(`meta[name="${name}"]`);
        if (!tag) {
          tag = document.createElement('meta');
          tag.setAttribute('name', name);
          document.head.appendChild(tag);
        }
        tag.setAttribute('content', content);
      };

      meta('mobile-web-app-capable', 'yes');
      meta('apple-mobile-web-app-capable', 'yes');
      meta('apple-mobile-web-app-status-bar-style', 'black-translucent');
      meta('apple-mobile-web-app-title', 'AGORA');
      meta('theme-color', '#1A0B2E');
      meta('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');

      document.title = 'AGORA';
    }
  }, []);

  return (
    <AuthGuard>
      <StatusBar style="light" backgroundColor="#1A0B2E" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#1A0B2E' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="criar-evento" options={{ presentation: 'modal' }} />
        <Stack.Screen name="pagamento" options={{ presentation: 'modal' }} />
        <Stack.Screen name="notificacoes" options={{ presentation: 'modal' }} />
        <Stack.Screen name="configuracoes" options={{ presentation: 'modal' }} />
        <Stack.Screen name="ajuda" options={{ presentation: 'modal' }} />
        <Stack.Screen name="editar-perfil" options={{ presentation: 'modal' }} />
        <Stack.Screen name="favoritos" options={{ presentation: 'modal' }} />
        <Stack.Screen name="admin/moderacao" options={{ presentation: 'modal' }} />
        <Stack.Screen name="meus-eventos" options={{ presentation: 'modal' }} />
        <Stack.Screen name="cadastro-empresa" options={{ presentation: 'modal' }} />
        <Stack.Screen name="produtos" options={{ presentation: 'modal' }} />
        <Stack.Screen name="permissao-localizacao" />
      </Stack>
    </AuthGuard>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <EventosProvider>
        <RootLayoutContent />
      </EventosProvider>
    </AuthProvider>
  );
}
