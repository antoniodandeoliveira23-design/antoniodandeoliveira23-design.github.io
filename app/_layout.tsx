import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { EventosProvider } from '@/contexts/EventosContext';
import { ChatProvider } from '@/contexts/ChatContext';
import { NotificacoesProvider } from '@/contexts/NotificacoesContext';
import { CORES } from '@/constants/theme';
import { CSP_POLICY, sessionGuard } from '@/services/seguranca';
import { registrarPushToken, desativarPushTokens } from '@/services/notificacoes';

SplashScreen.preventAutoHideAsync();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { signed, loading, logout, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Registra push token ao logar (apenas nativo)
  useEffect(() => {
    if (signed && user?.id && Platform.OS !== 'web') {
      registrarPushToken(user.id).catch(() => {});
    }
    if (!signed && user?.id) {
      desativarPushTokens(user.id).catch(() => {});
    }
  }, [signed, user?.id]);

  // A07 — Session timeout: desloga após 30min de inatividade
  useEffect(() => {
    if (signed && Platform.OS === 'web') {
      sessionGuard.iniciar(() => {
        logout?.();
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

      // A05 — CSP via meta tag aplicada APENAS em produção
      // Em dev local o Metro HMR usa eval() que seria bloqueado pelo CSP
      // Em produção o Vercel já envia os headers HTTP reais (vercel.json)
      const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
      if (!isDev) {
        meta('Content-Security-Policy', CSP_POLICY, true);
        meta('X-Frame-Options', 'DENY', true);
        meta('X-Content-Type-Options', 'nosniff', true);
      }

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
        <ChatProvider>
          <NotificacoesProvider>
            <RootLayoutContent />
          </NotificacoesProvider>
        </ChatProvider>
      </EventosProvider>
    </AuthProvider>
  );
}
