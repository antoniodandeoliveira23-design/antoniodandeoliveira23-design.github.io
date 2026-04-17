import { supabase, supabaseConfigured } from './supabase';
import { Denuncia, TipoDenuncia } from '@/types';

export const denunciasService = {
  async criar(data: {
    tipo: TipoDenuncia;
    alvo_id: string;
    motivo: string;
    descricao?: string;
  }): Promise<Denuncia> {
    if (!supabaseConfigured) {
      // Demo mode: aceita a denúncia localmente
      return {
        id: 'demo-den-' + Date.now(),
        denunciante_id: 'demo',
        tipo: data.tipo,
        alvo_id: data.alvo_id,
        motivo: data.motivo,
        descricao: data.descricao,
        status: 'aberta',
        criado_em: new Date().toISOString(),
      };
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Não autenticado');

    const { data: denuncia, error } = await supabase
      .from('denuncias')
      .insert({
        denunciante_id: user.id,
        tipo: data.tipo,
        alvo_id: data.alvo_id,
        motivo: data.motivo,
        descricao: data.descricao || null,
        status: 'aberta',
        criado_em: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return denuncia;
  },
};
