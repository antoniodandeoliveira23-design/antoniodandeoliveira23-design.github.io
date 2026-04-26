/**
 * app/auth/callback.tsx
 * A07 — Rota de retorno após OAuth (Google/Apple)
 * O Supabase redireciona aqui após autenticação social bem-sucedida
 * O token já vem no hash da URL e é capturado automaticamente pelo client
 */
import { useEffect } from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase, supabaseConfigured } from '@/services/supabase';
import { registrarAcesso, registrarAcao } from '@/services/auditoria';
import { CORES } from '@/constants/theme';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    async function processarCallback() {
      if (!supabaseConfigured) {
        router.replace('/(tabs)');
        return;
      }

      try {
        // Supabase JS v2 detecta automaticamente o token no hash da URL
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error || !session) {
          console.error('[auth/callback] Sessão não encontrada:', error?.message);
          await registrarAcao({
            acao: 'oauth_callback_falha',
            categoria: 'auth',
            severidade: 'aviso',
            detalhes: { motivo: error?.message ?? 'sessão nula' },
            resultado: 'falha',
          });
          router.replace('/login');
          return;
        }

        await registrarAcesso('login', session.user.id);
        await registrarAcao({
          acao: 'oauth_callback_sucesso',
          categoria: 'auth',
          severidade: 'info',
          detalhes: { provider: session.user.app_metadata?.provider },
          resultado: 'sucesso',
        });

        router.replace('/(tabs)');
      } catch (err) {
        console.error('[auth/callback] Erro inesperado:', err);
        router.replace('/login');
      }
    }

    processarCallback();
  }, []);

  return (
    <View style={{
      flex: 1,
      backgroundColor: CORES.background,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 16,
    }}>
      <ActivityIndicator size="large" color={CORES.roxo} />
      <Text style={{ color: CORES.texto, fontSize: 16 }}>
        Finalizando login...
      </Text>
    </View>
  );
}
