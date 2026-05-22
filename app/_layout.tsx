import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { TemaProvider, useTema } from '@/contexts/TemaContext';
import { EventosProvider } from '@/contexts/EventosContext';
import { ChatProvider } from '@/contexts/ChatContext';
import { NotificacoesProvider } from '@/contexts/NotificacoesContext';
import { CORES } from '@/constants/theme';
import { CSP_POLICY, sessionGuard } from '@/services/seguranca';
import { registrarPushToken, desativarPushTokens } from '@/services/notificacoes';

SplashScreen.preventAutoHideAsync();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { signed, loading, logout, user } = useAuth();
  const { notificacoesAtivas, cores, modoEscuro } = useTema();
  const segments = useSegments();
  const router = useRouter();

  // Registra push token ao logar — respeita preferência do usuário
  useEffect(() => {
    if (signed && user?.id && Platform.OS !== 'web' && notificacoesAtivas) {
      registrarPushToken(user.id).catch(() => {});
    }
    if (!signed && user?.id) {
      desativarPushTokens(user.id).catch(() => {});
    }
  }, [signed, user?.id, notificacoesAtivas]);

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

  // Converte o array segments em string estável para evitar re-runs a cada render
  const segmentoAtual = segments[0] ?? '';

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segmentoAtual === '(tabs)';
    const inAdminGroup = segmentoAtual === 'admin';
    const publicRoutes = ['login', 'register', 'onboarding', 'index', 'permissao-localizacao', ''];
    const inPublicRoute = publicRoutes.includes(segmentoAtual);
    const inProtectedRoute = !inAuthGroup && !inAdminGroup && !inPublicRoute;

    if (signed && inPublicRoute) {
      // Admin vai direto para o painel administrativo
      if (user?.tipo_conta === 'admin' || user?.tipo_conta === 'gov') {
        router.replace('/admin/dashboard' as any);
      } else {
        router.replace('/(tabs)');
      }
    } else if (!signed && (inAuthGroup || inAdminGroup || inProtectedRoute)) {
      router.replace('/login');
    }
  }, [signed, loading, segmentoAtual, user?.tipo_conta]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: cores.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={cores.roxo} />
      </View>
    );
  }

  return <>{children}</>;
}

function RootLayoutContent() {
  const { modoEscuro, cores } = useTema();

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

      // ── SEO básico ────────────────────────────────────────────────────
      const APP_URL  = process.env.EXPO_PUBLIC_APP_URL ?? 'https://antoniodandeoliveira23-designgithub-q4yxy93ji.vercel.app';
      const OG_IMAGE = `${APP_URL}/assets/images/og-image.png`;
      const DESC     = 'Descubra eventos, shows, promoções e serviços perto de você em Vilhena – RO. Baixe o AGORA e fique por dentro da agenda cultural da cidade.';

      meta('description', DESC);
      meta('keywords',    'eventos vilhena, agenda cultural vilhena, shows rondônia, agora app, eventos rondônia, o que fazer vilhena');
      meta('author',      'AGORA');
      meta('robots',      'index, follow');

      // Open Graph — link bonito no WhatsApp, Instagram e redes sociais
      const setOG = (prop: string, val: string) => {
        const q = `meta[property="${prop}"]`;
        let t = document.querySelector(q);
        if (!t) { t = document.createElement('meta'); t.setAttribute('property', prop); document.head.appendChild(t); }
        t.setAttribute('content', val);
      };
      setOG('og:type',        'website');
      setOG('og:site_name',   'AGORA');
      setOG('og:title',       'AGORA · Eventos em Vilhena');
      setOG('og:description', DESC);
      setOG('og:image',       OG_IMAGE);
      setOG('og:image:width',  '1200');
      setOG('og:image:height', '630');
      setOG('og:image:alt',   'AGORA — Eventos em Vilhena');
      setOG('og:url',         APP_URL);
      setOG('og:locale',      'pt_BR');

      // Twitter Card
      meta('twitter:card',        'summary_large_image');
      meta('twitter:title',       'AGORA · Eventos em Vilhena');
      meta('twitter:description', DESC);
      meta('twitter:image',       OG_IMAGE);

      // JSON-LD — estrutura da organização para o Google
      const jsonLdId = 'agora-jsonld-org';
      if (!document.getElementById(jsonLdId)) {
        const script = document.createElement('script');
        script.id   = jsonLdId;
        script.type = 'application/ld+json';
        script.text = JSON.stringify({
          '@context': 'https://schema.org',
          '@type':    'WebApplication',
          name:       'AGORA',
          url:        APP_URL,
          description: DESC,
          applicationCategory: 'EntertainmentApplication',
          operatingSystem: 'Web, Android, iOS',
          offers: {
            '@type': 'Offer',
            price:   '0',
            priceCurrency: 'BRL',
          },
          author: {
            '@type':   'Organization',
            name:      'AGORA',
            url:       APP_URL,
            address: {
              '@type':           'PostalAddress',
              addressLocality:   'Vilhena',
              addressRegion:     'RO',
              addressCountry:    'BR',
            },
          },
        });
        document.head.appendChild(script);
      }

      document.title = 'AGORA · Eventos em Vilhena';
    }
  }, []);

  return (
    <AuthGuard>
      <StatusBar style={modoEscuro ? 'light' : 'dark'} backgroundColor={cores.background} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: cores.background } }}>
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
        <Stack.Screen name="minhas-inscricoes" options={{ presentation: 'modal' }} />
        <Stack.Screen name="admin/dashboard" />
        <Stack.Screen name="admin/moderacao" options={{ presentation: 'modal' }} />
        <Stack.Screen name="meus-eventos" options={{ presentation: 'modal' }} />
        <Stack.Screen name="cadastro-empresa" options={{ presentation: 'modal' }} />
        <Stack.Screen name="produtos" options={{ presentation: 'modal' }} />
        <Stack.Screen name="permissao-localizacao" />
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="politica-privacidade" options={{ presentation: 'modal' }} />
        <Stack.Screen name="termos-de-servico" options={{ presentation: 'modal' }} />
      </Stack>
    </AuthGuard>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <TemaProvider>
        <EventosProvider>
          <ChatProvider>
            <NotificacoesProvider>
              <RootLayoutContent />
            </NotificacoesProvider>
          </ChatProvider>
        </EventosProvider>
      </TemaProvider>
    </AuthProvider>
  );
}
