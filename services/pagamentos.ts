import { supabase, supabaseConfigured } from './supabase';
import { Plano } from '@/types';

// ─────────────────────────────────────────────────────────────────
// Resultado de criação de cobrança real (Asaas)
// ─────────────────────────────────────────────────────────────────
export interface ResultadoCobranca {
  pagamento_id:  string;
  asaas_id:      string;
  link:          string | null;   // URL da página de pagamento
  pix_copia_cola: string | null;  // Código PIX copia-e-cola
  valor:         number;
  vencimento:    string;
  status:        string;
}

export const pagamentosService = {

  /** Lista planos disponíveis do banco de produção */
  async listarPlanos(): Promise<Plano[]> {
    if (!supabaseConfigured) return [];
    const { data, error } = await supabase
      .from('planos')
      .select('*')
      .order('preco', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  },

  /**
   * Cria cobrança real no Asaas via Edge Function.
   * Retorna link de pagamento e código PIX.
   */
  async criarCobranca(
    planoId: string,
    metodo: 'PIX' | 'BOLETO' = 'PIX',
  ): Promise<ResultadoCobranca> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Não autenticado');

    const resp = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/criar-cobranca`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plano_id: planoId, metodo }),
      },
    );

    const json = await resp.json();
    if (!resp.ok) throw new Error(json.error ?? 'Erro ao criar cobrança');
    return json as ResultadoCobranca;
  },

  /**
   * Busca o status atual de um pagamento pelo ID interno.
   * Usado para polling após redirecionar o usuário ao link de pagamento.
   */
  async consultarStatus(pagamentoId: string): Promise<string> {
    const { data, error } = await supabase
      .from('pagamentos')
      .select('status')
      .eq('id', pagamentoId)
      .single();
    if (error) throw new Error(error.message);
    return data?.status ?? 'pendente';
  },

  /** Busca histórico de pagamentos do usuário logado */
  async listarMeusPagamentos() {
    const { data, error } = await supabase
      .from('pagamentos')
      .select('*, planos(nome, tipo)')
      .order('criado_em', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },
};
