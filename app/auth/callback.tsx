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

      // Lê parâmetros da URL e do hash (Supabase usa hash para tokens OAuth)
      const params     = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));

      // ── Detectar erro direto na URL (ex: OAuth provider not enabled) ──
      const urlError = params.get('error_description') || hashParams.get('error_description');
      if (urlError) {
        const msg = urlError.toLowerCase();
        if (msg.includes('provider') || msg.includes('not enabled')) {
          router.replace('/login?erro=oauth_desativado');
        } else {
          router.replace('/login');
        }
        return;
      }

      // ── Detectar fluxo de recuperação de senha (type=recovery) ────────
      // Supabase envia o token no hash: #access_token=...&type=recovery
      const tipoCallback = hashParams.get('type') || params.get('type');
      if (tipoCallback === 'recovery') {
        // O Supabase JS v2 troca automaticamente o token de recovery por sessão
        // Só precisamos verificar se a sessão está ativa e redirecionar
        const { data: { session } } = await supabase.auth.getSession();

        await registrarAcao({
          acao: 'recuperacao_senha_link_clicado',
          categoria: 'auth',
          severidade: 'info',
          detalhes: { sessao: session ? 'ativa' : 'nula' },
          resultado: session ? 'sucesso' : 'falha',
        });

        // Mesmo sem sessão confirmada, redireciona — nova-senha.tsx vai exibir erro
        router.replace('/nova-senha' as any);
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

  // Detecta se é recovery para mostrar mensagem adequada
  const isRecovery = typeof window !== 'undefined'
    && (window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery'));

  return (
    <View style={{
      flex: 1,
      backgroundColor: CORES.background,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 16,
    }}>
      <ActivityIndicator size="large" color={CORES.roxo} />
      <Text style={{ color: CORES.branco, fontSize: 16 }}>
        {isRecovery ? 'Verificando link de recuperação...' : 'Finalizando login...'}
      </Text>
    </View>
  );
}
