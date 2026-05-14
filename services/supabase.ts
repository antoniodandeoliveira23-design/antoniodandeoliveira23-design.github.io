import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// supabaseConfigured: true quando as variáveis de ambiente estão presentes.
// NÃO inclui isBrowser — esse valor é avaliado em Node.js durante o SSG
// (output:"static") e ficaria travado como false no cache do módulo mesmo
// após o browser carregar a página.
export const supabaseConfigured = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

// O cliente real só é criado no browser (onde window existe).
// Durante o SSG em Node.js, nenhum useEffect roda, então supabase=null é seguro.
const isBrowser = typeof window !== 'undefined';

// Na web usamos o storage padrão do Supabase (localStorage nativo do browser),
// que é mais confiável do que o AsyncStorage para persistência de sessão web.
// No nativo (iOS/Android) usamos AsyncStorage conforme recomendado.
const authStorage = Platform.OS === 'web' ? undefined : AsyncStorage;

export const supabase: SupabaseClient = (supabaseConfigured && isBrowser)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage:            authStorage,
        autoRefreshToken:   true,
        persistSession:     true,
        // Na web, detecta tokens de sessão no hash da URL (necessário para
        // callbacks OAuth e links de recuperação de senha via email).
        // No nativo, o fluxo PKCE é gerenciado manualmente em loginSocial().
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : (null as any);
