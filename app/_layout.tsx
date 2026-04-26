import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { EventosProvider } from '@/contexts/EventosContext';
import { CORES } from '@/constants/theme';
import { CSP_POLICY, sessionGuard } from '@/services/seguranca';

SplashScreen.preventAutoHideAsync();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { signed, loading, signOut } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // A07 — Session timeout: desloga após 30min de inatividade
  useEffect(() => {
    if (signed && Platform.OS === 'web') {
      sessionGuard.iniciar(() => {
        signOut?.();
        router.replace('/login');
      });
    } else {
      sessionGuard.parar();
    }
    return () => sessionGuard.parar();
  }, [signed]);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(tabs)';
    const publicRoutes = ['login', 'register', 'onboarding', 'index', 'permissao-localizacao'];
    const inPublicRoute = !segments[0] || publicRoutes.includes(segments[0] as string);
    const inProtectedRoute = !inAuthGroup && !inPublicRoute;

    if (signed && inPublicRoute) {
      router.replace('/(tabs)');
    } else if (!signed && (inAuthGroup || inProtectedRoute)) {
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
      const meta = (name: string, content: string, isHttpEquiv = false) => {
        const attr = isHttpEquiv ? `meta[http-equiv="${name}"]` : `meta[name="${name}"]`;
        let tag = document.querySelector(attr);
        if (!tag) {
          tag = document.createElement('meta');
          tag.setAttribute(isHttpEquiv ? 'http-equiv' : 'name', name);
          document.head.appendChild(tag);
        }
        tag.setAttribute('content', content);
      };

      // A05 — Fallback via meta tag (Vercel já envia estes como HTTP headers reais)
      // Mantidos aqui para cobertura em dev local e builds não-Vercel
      meta('Content-Security-Policy', CSP_POLICY, true);
      meta('X-Frame-Options', 'DENY', true);
      meta('X-Content-Type-Options', 'nosniff', true);

      // PWA meta tags
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
        <Stack.Screen name="auth/callback" />
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
