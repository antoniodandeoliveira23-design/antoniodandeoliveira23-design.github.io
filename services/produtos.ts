import { supabase, supabaseConfigured } from './supabase';
import type { Produto, CategoriaProduto } from '@/types';
import { registrarAcao } from './auditoria';
import { sanitizador } from './seguranca';

// ─────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────

export interface CriarProdutoData {
  nome: string;
  descricao: string;
  preco: number;
  moeda?: string;
  categoria: CategoriaProduto;
  imagem_url?: string;
  local: string;
  lat: number;
  lng: number;
  evento_id?: string | null; // associação produto ↔ evento (opcional)
}

export interface OpcoesProdutos {
  categoria?: CategoriaProduto | null;
  eventoId?: string | null;   // filtrar por evento vinculado
  criadorId?: string | null;  // filtrar por criador
  busca?: string;
  pagina?: number;
  porPagina?: number;
}

export interface RespostaPaginadaProdutos {
  dados: Produto[];
  total: number;
  pagina: number;
  porPagina: number;
  temMais: boolean;
}

// ─────────────────────────────────────────────────────────
// Dados demo
// ─────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────

export const produtosService = {

  // ── LISTAR com filtros + paginação ─────────────────────
  async listar(opcoes: OpcoesProdutos = {}): Promise<RespostaPaginadaProdutos> {
    const { categoria, eventoId, criadorId, busca, pagina = 1, porPagina = 20 } = opcoes;
    const offset = (pagina - 1) * porPagina;

    if (!supabaseConfigured) {
      let result = [...DEMO_PRODUTOS];
      if (categoria)  result = result.filter(p => p.categoria === categoria);
      if (eventoId)   result = result.filter(p => p.evento_id === eventoId);
      if (criadorId)  result = result.filter(p => p.criador_id === criadorId);
      if (busca?.trim()) {
        const b = busca.toLowerCase();
        result = result.filter(p =>
          p.nome.toLowerCase().includes(b) || p.descricao.toLowerCase().includes(b)
        );
      }
      const total = result.length;
      return {
        dados: result.slice(offset, offset + porPagina),
        total,
        pagina,
        porPagina,
        temMais: offset + porPagina < total,
      };
    }

    let query = supabase
      .from('produtos')
      .select('*, criador:profiles(id,nome,sobrenome,username,avatar_url,tipo_conta,verificado), evento:eventos(id,nome,local,data_inicio)', { count: 'exact' })
      .eq('status', 'ativo')
      .order('criado_em', { ascending: false })
      .range(offset, offset + porPagina - 1);

    if (categoria)  query = query.eq('categoria', categoria);
    if (eventoId)   query = query.eq('evento_id', eventoId);
    if (criadorId)  query = query.eq('criador_id', criadorId);
    if (busca?.trim()) query = query.or(`nome.ilike.%${busca}%,descricao.ilike.%${busca}%`);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    const total = count ?? 0;
    return {
      dados: data || [],
      total,
      pagina,
      porPagina,
      temMais: offset + porPagina < total,
    };
  },

  // ── LISTAR POR EVENTO (todos os produtos de um evento) ─
  async listarPorEvento(eventoId: string): Promise<Produto[]> {
    if (!supabaseConfigured) {
      return DEMO_PRODUTOS.filter(p => p.evento_id === eventoId);
    }

    const { data, error } = await supabase
      .from('produtos')
      .select('*, criador:profiles(id,nome,sobrenome,username,avatar_url,tipo_conta,verificado)')
      .eq('evento_id', eventoId)
      .eq('status', 'ativo')
      .order('criado_em', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  },

  // ── OBTER por ID ───────────────────────────────────────
  async obter(id: string): Promise<Produto | null> {
    if (!supabaseConfigured) {
      return DEMO_PRODUTOS.find(p => p.id === id) || null;
    }

    const { data, error } = await supabase
      .from('produtos')
      .select('*, criador:profiles(id,nome,sobrenome,username,avatar_url,tipo_conta,verificado), evento:eventos(id,nome,local,data_inicio)')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // not found
      throw new Error(error.message);
    }
    return data;
  },

  // ── CRIAR ──────────────────────────────────────────────
  async criar(dadosBrutos: CriarProdutoData): Promise<Produto> {
    if (!supabaseConfigured) {
      const novo: Produto = {
        ...dadosBrutos,
        id: 'prod-' + Date.now(),
        criador_id: 'demo-pj',
        moeda: dadosBrutos.moeda || 'BRL',
        status: 'ativo',
        criado_em: new Date().toISOString(),
      };
      DEMO_PRODUTOS.unshift(novo);
      return novo;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    // Apenas PJ pode criar produtos
    const { data: profile } = await supabase
      .from('profiles')
      .select('tipo_conta, verificado')
      .eq('id', user.id)
      .single();

    if (!profile || !['pj', 'admin'].includes(profile.tipo_conta)) {
      await registrarAcao({
        acao: 'produto_criacao_bloqueada',
        categoria: 'seguranca',
        severidade: 'aviso',
        detalhes: { motivo: 'TIPO_CONTA_INVALIDO', tipo_conta: profile?.tipo_conta },
        resultado: 'bloqueado',
      });
      throw new Error('APENAS_PJ');
    }

    // Sanitiza campos de texto
    const dados = {
      ...dadosBrutos,
      nome:      sanitizador.texto(dadosBrutos.nome),
      descricao: sanitizador.texto(dadosBrutos.descricao),
      local:     sanitizador.texto(dadosBrutos.local),
      imagem_url: dadosBrutos.imagem_url
        ? sanitizador.url(dadosBrutos.imagem_url) || undefined
        : undefined,
    };

    // Valida se evento_id existe (quando fornecido)
    if (dados.evento_id) {
      const { data: evento } = await supabase
        .from('eventos')
        .select('id, criador_id')
        .eq('id', dados.evento_id)
        .single();

      if (!evento) throw new Error('EVENTO_NAO_ENCONTRADO');

      // Só pode associar ao próprio evento (ou admin)
      if (evento.criador_id !== user.id && profile.tipo_conta !== 'admin') {
        throw new Error('EVENTO_SEM_PERMISSAO');
      }
    }

    const novoProduto = {
      criador_id:  user.id,
      nome:        dados.nome,
      descricao:   dados.descricao,
      preco:       dados.preco,
      moeda:       dados.moeda || 'BRL',
      categoria:   dados.categoria,
      imagem_url:  dados.imagem_url || null,
      local:       dados.local,
      lat:         dados.lat,
      lng:         dados.lng,
      evento_id:   dados.evento_id || null,
      status:      'ativo' as const,
      criado_em:   new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('produtos')
      .insert(novoProduto)
      .select('*, criador:profiles(id,nome,sobrenome,username,avatar_url,tipo_conta,verificado)')
      .single();

    if (error) {
      await registrarAcao({
        acao: 'produto_criacao_falha',
        categoria: 'evento',
        severidade: 'aviso',
        tabela: 'produtos',
        detalhes: { motivo: error.message, categoria: dados.categoria },
        resultado: 'falha',
      });
      throw new Error(error.message);
    }

    // Audit log de criação
    await registrarAcao({
      acao: 'produto_criado',
      categoria: 'evento',
      severidade: 'info',
      tabela: 'produtos',
      registroId: data.id,
      detalhes: {
        nome:      data.nome,
        categoria: data.categoria,
        preco:     data.preco,
        evento_id: data.evento_id ?? null,
      },
      resultado: 'sucesso',
    });

    return data;
  },

  // ── EDITAR ─────────────────────────────────────────────
  async editar(produtoId: string, updates: Partial<CriarProdutoData>): Promise<Produto> {
    if (!supabaseConfigured) {
      const idx = DEMO_PRODUTOS.findIndex(p => p.id === produtoId);
      if (idx === -1) throw new Error('Produto não encontrado');
      DEMO_PRODUTOS[idx] = { ...DEMO_PRODUTOS[idx], ...updates };
      return DEMO_PRODUTOS[idx];
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { data: produto } = await supabase
      .from('produtos')
      .select('criador_id')
      .eq('id', produtoId)
      .single();

    const { data: profile } = await supabase
      .from('profiles')
      .select('tipo_conta')
      .eq('id', user.id)
      .single();

    if (produto?.criador_id !== user.id && profile?.tipo_conta !== 'admin') {
      throw new Error('SEM_PERMISSAO');
    }

    // Sanitiza campos de texto se enviados
    const sanitizado: Partial<CriarProdutoData> = { ...updates };
    if (updates.nome)      sanitizado.nome      = sanitizador.texto(updates.nome);
    if (updates.descricao) sanitizado.descricao = sanitizador.texto(updates.descricao);
    if (updates.local)     sanitizado.local     = sanitizador.texto(updates.local);

    const { data, error } = await supabase
      .from('produtos')
      .update({ ...sanitizado, atualizado_em: new Date().toISOString() })
      .eq('id', produtoId)
      .select('*, criador:profiles(id,nome,sobrenome,username,avatar_url,tipo_conta,verificado)')
      .single();

    if (error) throw new Error(error.message);

    await registrarAcao({
      acao: 'produto_editado',
      categoria: 'evento',
      severidade: 'info',
      tabela: 'produtos',
      registroId: produtoId,
      detalhes: { campos_alterados: Object.keys(updates) },
      resultado: 'sucesso',
    });

    return data;
  },

  // ── DELETAR (soft delete → status 'inativo') ──────────
  async deletar(produtoId: string): Promise<void> {
    if (!supabaseConfigured) {
      const idx = DEMO_PRODUTOS.findIndex(p => p.id === produtoId);
      if (idx !== -1) DEMO_PRODUTOS.splice(idx, 1);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { data: produto } = await supabase
      .from('produtos')
      .select('criador_id')
      .eq('id', produtoId)
      .single();

    const { data: profile } = await supabase
      .from('profiles')
      .select('tipo_conta')
      .eq('id', user.id)
      .single();

    if (produto?.criador_id !== user.id && profile?.tipo_conta !== 'admin') {
      throw new Error('SEM_PERMISSAO');
    }

    const { error } = await supabase
      .from('produtos')
      .update({ status: 'inativo', atualizado_em: new Date().toISOString() })
      .eq('id', produtoId);

    if (error) throw new Error(error.message);

    await registrarAcao({
      acao: 'produto_deletado',
      categoria: 'evento',
      severidade: 'aviso',
      tabela: 'produtos',
      registroId: produtoId,
      detalhes: { por_admin: profile?.tipo_conta === 'admin' },
      resultado: 'sucesso',
    });
  },
};
