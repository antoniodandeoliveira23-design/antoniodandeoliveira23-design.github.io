import { supabase, supabaseConfigured } from './supabase';
import { Denuncia, TipoDenuncia, StatusDenuncia } from '@/types';
import { registrarAcao } from './auditoria';
import { emailService } from './email';

// Cache em memória: email do admin (1 busca por sessão)
let _adminEmailCache: { email: string; nome: string } | null = null;

async function buscarEmailAdmin(): Promise<{ email: string; nome: string } | null> {
  if (_adminEmailCache) return _adminEmailCache;
  if (!supabaseConfigured) return null;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('id, nome')
      .eq('tipo_conta', 'admin')
      .limit(1)
      .single();
    if (!data) return null;
    // Busca email via Edge Function auth.admin (não disponível no client)
    // Usa email placeholder — o admin receberá pelo ALERT_ADMIN_EMAIL env var
    const email = process.env.EXPO_PUBLIC_ADMIN_EMAIL ?? 'admin@agora.app';
    _adminEmailCache = { email, nome: data.nome };
    return _adminEmailCache;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────
// Dados demo
// ─────────────────────────────────────────────────────────

export const DEMO_DENUNCIAS: Denuncia[] = [
  {
    id: 'den-1',
    denunciante_id: 'demo-user-pf',
    tipo: 'evento',
    alvo_id: '1',
    motivo: 'Informações falsas',
    descricao: 'O endereço do evento não existe.',
    status: 'aberta',
    criado_em: new Date(Date.now() - 3_600_000).toISOString(),
  },
  {
    id: 'den-2',
    denunciante_id: 'demo-user-pf',
    tipo: 'usuario',
    alvo_id: 'demo-user-pj',
    motivo: 'Spam ou propaganda enganosa',
    descricao: 'Usuário cria eventos repetidos para promover a loja.',
    status: 'aberta',
    criado_em: new Date(Date.now() - 7_200_000).toISOString(),
  },
  {
    id: 'den-3',
    denunciante_id: 'demo-user-pj',
    tipo: 'mensagem',
    alvo_id: 'm1',
    motivo: 'Conteúdo ofensivo ou inapropriado',
    status: 'em_analise',
    criado_em: new Date(Date.now() - 86_400_000).toISOString(),
  },
];

// ─────────────────────────────────────────────────────────
// Opções e respostas
// ─────────────────────────────────────────────────────────

export interface OpcoesDenuncias {
  status?: StatusDenuncia;
  tipo?: TipoDenuncia;
  pagina?: number;
  porPagina?: number;
}

export interface RespostaDenuncias {
  dados: Denuncia[];
  total: number;
  temMais: boolean;
}

// ─────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────

export const denunciasService = {

  // ── CRIAR denúncia ────────────────────────────────────
  async criar(data: {
    tipo: TipoDenuncia;
    alvo_id: string;
    motivo: string;
    descricao?: string;
  }): Promise<Denuncia> {
    if (!supabaseConfigured) {
      const nova: Denuncia = {
        id: 'demo-den-' + Date.now(),
        denunciante_id: 'demo',
        tipo: data.tipo,
        alvo_id: data.alvo_id,
        motivo: data.motivo,
        descricao: data.descricao,
        status: 'aberta',
        criado_em: new Date().toISOString(),
      };
      DEMO_DENUNCIAS.unshift(nova);
      return nova;
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

    // ── Alerta por email para denúncias de usuário (alta severidade) ──
    if (data.tipo === 'usuario') {
      buscarEmailAdmin().then(admin => {
        if (!admin) return;
        emailService.alertaDenuncia({
          adminEmail: admin.email,
          adminNome:  admin.nome,
          tipo:       data.tipo,
          motivo:     data.motivo,
          alvoId:     data.alvo_id,
        });
      });
    }

    return denuncia;
  },

  // ── LISTAR denúncias (para o painel admin) ────────────
  async listar(opcoes: OpcoesDenuncias = {}): Promise<RespostaDenuncias> {
    const { status = 'aberta', tipo, pagina = 1, porPagina = 15 } = opcoes;
    const offset = (pagina - 1) * porPagina;

    if (!supabaseConfigured) {
      let result = [...DEMO_DENUNCIAS];
      if (status) result = result.filter(d => d.status === status);
      if (tipo)   result = result.filter(d => d.tipo === tipo);
      const total = result.length;
      return {
        dados: result.slice(offset, offset + porPagina),
        total,
        temMais: offset + porPagina < total,
      };
    }

    let query = supabase
      .from('denuncias')
      .select('*', { count: 'exact' })
      .order('criado_em', { ascending: false })
      .range(offset, offset + porPagina - 1);

    if (status) query = query.eq('status', status);
    if (tipo)   query = query.eq('tipo', tipo);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    const total = count ?? 0;
    return {
      dados: data || [],
      total,
      temMais: offset + porPagina < total,
    };
  },

  // ── RESOLVER / ARQUIVAR denúncia ──────────────────────
  async resolver(
    denunciaId: string,
    resolucao: 'resolvida' | 'descartada',
  ): Promise<void> {
    if (!supabaseConfigured) {
      const idx = DEMO_DENUNCIAS.findIndex(d => d.id === denunciaId);
      if (idx !== -1) DEMO_DENUNCIAS[idx].status = resolucao;
      return;
    }

    const { error } = await supabase
      .from('denuncias')
      .update({ status: resolucao })
      .eq('id', denunciaId);

    if (error) throw new Error(error.message);

    await registrarAcao({
      acao: `denuncia_${resolucao}`,
      categoria: 'denuncia',
      severidade: 'info',
      tabela: 'denuncias',
      registroId: denunciaId,
      resultado: 'sucesso',
    });
  },

  // ── CONTAR denúncias abertas (badge) ──────────────────
  async contarAbertas(): Promise<number> {
    if (!supabaseConfigured) {
      return DEMO_DENUNCIAS.filter(d => d.status === 'aberta').length;
    }

    const { count } = await supabase
      .from('denuncias')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'aberta');

    return count ?? 0;
  },
};
