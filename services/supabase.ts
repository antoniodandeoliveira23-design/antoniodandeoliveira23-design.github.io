import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export const supabase: SupabaseClient = (supabaseConfigured && isBrowser)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : (null as any);
