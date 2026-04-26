import { supabase, supabaseConfigured } from './supabase';
import { Denuncia, TipoDenuncia } from '@/types';
import { registrarAcao } from './auditoria';

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

    if (error) {
      await registrarAcao({
        acao: 'denuncia_falha',
        categoria: 'denuncia',
        severidade: 'aviso',
        detalhes: { tipo: data.tipo, motivo: error.message },
        resultado: 'falha',
      });
      throw new Error(error.message);
    }

    await registrarAcao({
      acao: 'denuncia_criada',
      categoria: 'denuncia',
      severidade: data.tipo === 'usuario' ? 'aviso' : 'info',
      tabela: 'denuncias',
      registroId: denuncia.id,
      detalhes: { tipo: data.tipo, motivo: data.motivo },
      resultado: 'sucesso',
    });

    return denuncia;
  },
};
