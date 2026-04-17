import { supabase, supabaseConfigured } from './supabase';
import { Pagamento, Plano } from '@/types';

// Demo planos (R3)
const DEMO_PLANOS: Plano[] = [
  { id: 'avulso', nome: 'Avulso', tipo: 'avulso', preco: 9.9, max_eventos: 1, destaque_incluso: false, descricao: '1 evento pontual, sem destaque.' },
  { id: 'mensal_basico', nome: 'Mensal Básico', tipo: 'mensal', preco: 29.9, max_eventos: 5, destaque_incluso: false, descricao: 'Até 5 eventos por mês.' },
  { id: 'mensal_pro', nome: 'Mensal Pro', tipo: 'mensal', preco: 79.9, max_eventos: 20, destaque_incluso: true, descricao: 'Até 20 eventos + destaque no mapa.' },
  { id: 'anual', nome: 'Anual', tipo: 'anual', preco: 599.9, max_eventos: 999, destaque_incluso: true, descricao: 'Eventos ilimitados + destaque o ano todo.' },
];

export const pagamentosService = {
  /**
   * R3: Lista planos disponíveis para empresas.
   */
  async listarPlanos(): Promise<Plano[]> {
    if (!supabaseConfigured) return DEMO_PLANOS;
    const { data, error } = await supabase
      .from('planos')
      .select('*')
      .order('preco', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  },

  /**
   * R3: Cria um pagamento pendente antes da publicação.
   */
  async criarPagamento(eventoId: string, planoId: string): Promise<Pagamento> {
    if (!supabaseConfigured) {
      const plano = DEMO_PLANOS.find((p) => p.id === planoId) || DEMO_PLANOS[0];
      return {
        id: 'demo-pag-' + Date.now(),
        usuario_id: 'demo',
        evento_id: eventoId,
        valor: plano.preco,
        moeda: 'BRL',
        status: 'pendente',
        metodo: '',
        criado_em: new Date().toISOString(),
      };
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Não autenticado');

    const { data: plano } = await supabase
      .from('planos')
      .select('*')
      .eq('id', planoId)
      .single();
    if (!plano) throw new Error('Plano não encontrado');

    const { data, error } = await supabase
      .from('pagamentos')
      .insert({
        usuario_id: user.id,
        evento_id: eventoId,
        valor: plano.preco,
        moeda: 'BRL',
        status: 'pendente',
        metodo: '',
        criado_em: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Confirma pagamento e libera evento para aprovação (R4).
   */
  async confirmarPagamento(pagamentoId: string): Promise<void> {
    if (!supabaseConfigured) return;
    const { error: pagError } = await supabase
      .from('pagamentos')
      .update({ status: 'aprovado' })
      .eq('id', pagamentoId);
    if (pagError) throw new Error(pagError.message);

    const { data: pagamento } = await supabase
      .from('pagamentos')
      .select('evento_id')
      .eq('id', pagamentoId)
      .single();

    if (pagamento) {
      await supabase
        .from('eventos')
        .update({ pago: true, status: 'pendente' })
        .eq('id', pagamento.evento_id);
    }
  },
};
