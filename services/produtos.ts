import { supabaseConfigured } from './supabase';
import type { Produto, CategoriaProduto } from '@/types';

const DEMO_PRODUTOS: Produto[] = [
  {
    id: 'prod-1',
    criador_id: 'demo-pj',
    nome: 'Cesta de Café Regional',
    descricao: 'Cesta com produtos artesanais da região de Vilhena.',
    preco: 89.90,
    moeda: 'BRL',
    categoria: 'alimentacao',
    local: 'Feira de Artesanato, Praça Central',
    lat: -12.7380,
    lng: -60.1430,
    status: 'ativo',
    evento_id: '2',
    criado_em: new Date().toISOString(),
  },
  {
    id: 'prod-2',
    criador_id: 'demo-pj',
    nome: 'Camiseta Festival AGORA',
    descricao: 'Camiseta oficial do Festival de Música 2026.',
    preco: 49.90,
    moeda: 'BRL',
    categoria: 'vestuario',
    local: 'Centro, Vilhena - RO',
    lat: -12.7405,
    lng: -60.1458,
    status: 'ativo',
    evento_id: '1',
    criado_em: new Date().toISOString(),
  },
  {
    id: 'prod-3',
    criador_id: 'demo-pj',
    nome: 'Sessão de Fotografia Profissional',
    descricao: 'Pacote de ensaio fotográfico com 30 fotos editadas.',
    preco: 250.00,
    moeda: 'BRL',
    categoria: 'servicos',
    local: 'Espaço Cultural, Vilhena',
    lat: -12.7390,
    lng: -60.1440,
    status: 'ativo',
    evento_id: '4',
    criado_em: new Date().toISOString(),
  },
];

export const produtosService = {
  async listar(categoria?: CategoriaProduto | null): Promise<Produto[]> {
    if (!supabaseConfigured) {
      let result = [...DEMO_PRODUTOS];
      if (categoria) result = result.filter(p => p.categoria === categoria);
      return result;
    }
    return [];
  },

  async criar(data: Omit<Produto, 'id' | 'criado_em' | 'status'>): Promise<Produto> {
    if (!supabaseConfigured) {
      const novo: Produto = {
        ...data,
        id: 'prod-' + Date.now(),
        status: 'ativo',
        criado_em: new Date().toISOString(),
      };
      DEMO_PRODUTOS.unshift(novo);
      return novo;
    }
    throw new Error('Supabase not configured');
  },

  async obter(id: string): Promise<Produto | null> {
    if (!supabaseConfigured) {
      return DEMO_PRODUTOS.find(p => p.id === id) || null;
    }
    return null;
  },
};
