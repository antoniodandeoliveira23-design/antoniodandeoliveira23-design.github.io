import { supabase, supabaseConfigured } from './supabase';
import { Evento, CategoriaEvento } from '@/types';
import type { CriarEventoData } from '@/contexts/EventosContext';
import { validacaoSemantica } from './validacao-semantica';
import { registrarAcao, registrarAnomalia } from './auditoria';
import { emailService } from './email';

/**
 * Retorna o usuário autenticado real do Supabase, ou null se:
 *  - Supabase não estiver configurado, OU
 *  - O usuário entrou pelo modo demo (sem sessão real)
 */
async function getSupabaseUser() {
  if (!supabaseConfigured) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

/** True quando devemos usar dados locais de demo (sem sessão Supabase real) */
async function isDemo(): Promise<boolean> {
  return (await getSupabaseUser()) === null;
}

// ─────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────

export interface OpcoesPaginacao {
  pagina?: number;
  porPagina?: number;
}

export interface OpcoesFiltro extends OpcoesPaginacao {
  categoria?: CategoriaEvento | null;
  busca?: string;
  exclusivoMulheres?: boolean;
}

export interface RespostaPaginada<T> {
  dados: T[];
  total: number;
  pagina: number;
  porPagina: number;
  temMais: boolean;
}

export interface EventoComDistancia extends Evento {
  distancia_km: number;
}

// ─────────────────────────────────────────────────────────
// Dados demo
// ─────────────────────────────────────────────────────────

export const _demoPendentes: Evento[] = [
  {
    id: 'pend-1',
    criador_id: 'demo-pj',
    nome: 'Feira Empresarial Vilhena 2026',
    descricao: 'Encontro de negócios com palestras e networking.',
    local: 'Centro de Convenções',
    lat: -12.7410,
    lng: -60.1470,
    categoria: 'negocios',
    data_inicio: new Date(Date.now() + 604800000).toISOString(),
    comercial: true,
    exclusivo_mulheres: false,
    status: 'pendente',
    pago: true,
    destaque: false,
    criado_em: new Date().toISOString(),
  },
];

const DEMO_EVENTOS: Evento[] = [
  { id: '1', criador_id: 'demo', nome: 'Festival de Música', descricao: 'Grande festival ao ar livre com bandas locais.', local: 'Centro, Vilhena - RO', lat: -12.7405, lng: -60.1458, categoria: 'musica', data_inicio: new Date().toISOString(), comercial: false, exclusivo_mulheres: false, status: 'aprovado', pago: true, destaque: false, criado_em: new Date().toISOString() },
  { id: '2', criador_id: 'demo', nome: 'Feira de Artesanato', descricao: 'Artesanato local e comidas típicas.', local: 'Praça Central', lat: -12.7380, lng: -60.1430, categoria: 'feira', data_inicio: new Date(Date.now() + 86400000).toISOString(), comercial: false, exclusivo_mulheres: false, status: 'aprovado', pago: true, destaque: true, criado_em: new Date().toISOString() },
  { id: '3', criador_id: 'demo', nome: 'Teatro Infantil', descricao: 'Peça teatral para crianças.', local: 'Teatro Municipal', lat: -12.7420, lng: -60.1500, categoria: 'cultura', data_inicio: new Date(Date.now() + 172800000).toISOString(), comercial: false, exclusivo_mulheres: false, status: 'aprovado', pago: true, destaque: false, criado_em: new Date().toISOString() },
  { id: '4', criador_id: 'demo', nome: 'Workshop de Fotografia', descricao: 'Aprenda técnicas de fotografia.', local: 'Espaço Cultural', lat: -12.7390, lng: -60.1440, categoria: 'educacao', data_inicio: new Date(Date.now() + 259200000).toISOString(), comercial: false, exclusivo_mulheres: false, status: 'aprovado', pago: true, destaque: false, criado_em: new Date().toISOString() },
  { id: '5', criador_id: 'demo', nome: 'Encontro de Empreendedoras', descricao: 'Roda de conversa e networking exclusivo para mulheres empreendedoras de Vilhena.', local: 'Hub de Inovação', lat: -12.7415, lng: -60.1465, categoria: 'negocios', data_inicio: new Date(Date.now() + 345600000).toISOString(), comercial: false, exclusivo_mulheres: true, status: 'aprovado', pago: true, destaque: true, criado_em: new Date().toISOString() },
  { id: '6', criador_id: 'demo', nome: 'Aula de Defesa Pessoal Feminina', descricao: 'Técnicas de autodefesa e empoderamento para mulheres.', local: 'Academia Central', lat: -12.7400, lng: -60.1450, categoria: 'esporte', data_inicio: new Date(Date.now() + 432000000).toISOString(), comercial: false, exclusivo_mulheres: true, status: 'aprovado', pago: true, destaque: false, criado_em: new Date().toISOString() },
];

// ─────────────────────────────────────────────────────────
// Utilitário: Haversine (distância em km entre dois pontos)
// ─────────────────────────────────────────────────────────
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
}

// ─────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────
export const eventosService = {

  // ── LISTAR com filtro + paginação ──────────────────────
  async listar(opcoes: OpcoesFiltro = {}): Promise<RespostaPaginada<Evento>> {
    const { categoria, busca, pagina = 1, porPagina = 20, exclusivoMulheres } = opcoes;
    const offset = (pagina - 1) * porPagina;

    if (!supabaseConfigured) {
      let result = [...DEMO_EVENTOS];
      if (categoria) result = result.filter((e) => e.categoria === categoria);
      if (exclusivoMulheres) result = result.filter((e) => e.exclusivo_mulheres);
      if (busca?.trim()) {
        const b = busca.toLowerCase();
        result = result.filter(
          (e) => e.nome.toLowerCase().includes(b) || e.local.toLowerCase().includes(b)
        );
      }
      const total = result.length;
      const dados = result.slice(offset, offset + porPagina);
      return { dados, total, pagina, porPagina, temMais: offset + porPagina < total };
    }

    let query = supabase
      .from('eventos')
      .select('*, criador:profiles(*)', { count: 'exact' })
      .eq('status', 'aprovado')
      .order('destaque', { ascending: false })
      .order('data_inicio', { ascending: true })
      .range(offset, offset + porPagina - 1);

    if (categoria) query = query.eq('categoria', categoria);
    if (busca?.trim()) query = query.or(`nome.ilike.%${busca}%,local.ilike.%${busca}%`);

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

  // ── LISTAR POR RAIO GEOGRÁFICO ─────────────────────────
  async listarPorRaio(
    lat: number,
    lng: number,
    raioKm: number = 10,
    opcoes: { categoria?: CategoriaEvento | null; exclusivoMulheres?: boolean } & OpcoesPaginacao = {}
  ): Promise<RespostaPaginada<EventoComDistancia>> {
    const { categoria, pagina = 1, porPagina = 20, exclusivoMulheres } = opcoes;

    if (!supabaseConfigured) {
      const comDistancia = DEMO_EVENTOS
        .filter((e) => !categoria || e.categoria === categoria)
        .filter((e) => !exclusivoMulheres || e.exclusivo_mulheres)
        .map((e) => ({ ...e, distancia_km: haversineKm(lat, lng, e.lat, e.lng) }))
        .filter((e) => e.distancia_km <= raioKm)
        .sort((a, b) => a.distancia_km - b.distancia_km);

      const total = comDistancia.length;
      const offset = (pagina - 1) * porPagina;
      return {
        dados: comDistancia.slice(offset, offset + porPagina),
        total,
        pagina,
        porPagina,
        temMais: offset + porPagina < total,
      };
    }

    const { data, error } = await supabase.rpc('eventos_por_raio', {
      lat,
      lng,
      raio_km:    raioKm,
      p_categoria: categoria ?? null,
      p_pagina:   pagina,
      p_por_pagina: porPagina,
    });

    if (error) throw new Error(error.message);

    // A RPC retorna as linhas dentro do raio; mapeamos e_lat/e_lng → lat/lng
    const dados: EventoComDistancia[] = (data || []).map((row: any) => ({
      ...row,
      lat: row.e_lat,
      lng: row.e_lng,
    }));

    const total = dados.length; // sem paginação total no RPC; use count separado se necessário
    return { dados, total, pagina, porPagina, temMais: dados.length === porPagina };
  },

  // ── OBTER por ID ───────────────────────────────────────
  async obter(id: string): Promise<Evento> {
    if (!supabaseConfigured) return DEMO_EVENTOS.find((e) => e.id === id) || DEMO_EVENTOS[0];
    const { data, error } = await supabase
      .from('eventos')
      .select('*, criador:profiles(*)')
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  // ── CRIAR ──────────────────────────────────────────────
  async criar(eventoData: CriarEventoData, tipoContaDemo?: 'pf' | 'pj' | 'gov' | 'admin', verificadoDemo?: boolean): Promise<Evento> {
    const user = await getSupabaseUser();

    // Modo demo: sem sessão Supabase real (login demo ou Supabase não configurado)
    if (!user) {
      const tipo = tipoContaDemo || 'pf';
      if (tipo === 'gov' && !verificadoDemo) throw new Error('GOV_NAO_VERIFICADO');

      const ehComercialDemo = validacaoSemantica.detectarConteudoComercial(
        eventoData.nome + ' ' + eventoData.descricao
      );
      // Admin e PJ podem publicar conteúdo comercial
      if ((tipo === 'pf' || tipo === 'gov') && ehComercialDemo) throw new Error('BLOQUEIO_COMERCIAL');

      const comercialDemo = tipo === 'pj';
      const novoDemo: Evento = {
        id: 'demo-' + Date.now(),
        criador_id: 'demo',
        ...eventoData,
        comercial: comercialDemo,
        // Admin aprova diretamente; PJ fica pendente
        status: (tipo === 'admin' || !comercialDemo) ? 'aprovado' : 'pendente',
        pago: !comercialDemo,
        destaque: false,
        criado_em: new Date().toISOString(),
      };
      if (novoDemo.status === 'pendente') _demoPendentes.unshift(novoDemo);
      else DEMO_EVENTOS.unshift(novoDemo);
      return novoDemo;
    }

    // ── Caminho real (sessão Supabase válida) ───────────────
    const { data: profile } = await supabase
      .from('profiles').select('tipo_conta, verificado').eq('id', user.id).single();

    if (profile?.tipo_conta === 'gov' && !profile?.verificado) {
      await registrarAcao({ acao: 'evento_criacao_bloqueada', categoria: 'seguranca', severidade: 'aviso', detalhes: { motivo: 'GOV_NAO_VERIFICADO' }, resultado: 'bloqueado' });
      throw new Error('GOV_NAO_VERIFICADO');
    }

    const ehComercial = validacaoSemantica.detectarConteudoComercial(eventoData.nome + ' ' + eventoData.descricao);
    if ((profile?.tipo_conta === 'pf' || profile?.tipo_conta === 'gov') && ehComercial) {
      await registrarAcao({ acao: 'evento_criacao_bloqueada', categoria: 'seguranca', severidade: 'aviso', detalhes: { motivo: 'BLOQUEIO_COMERCIAL', tipo_conta: profile?.tipo_conta }, resultado: 'bloqueado' });
      await registrarAnomalia({ userId: user.id, tipo: 'conteudo_suspeito', descricao: 'PF tentou publicar evento com linguagem comercial', detalhes: { nome_evento: eventoData.nome.substring(0, 50) } });
      throw new Error('BLOQUEIO_COMERCIAL');
    }

    const comercial = profile?.tipo_conta === 'pj';
    const novoEvento = {
      criador_id: user.id,
      ...eventoData,
      data_fim: eventoData.data_fim || null,
      comercial,
      status: comercial ? 'pendente' : 'aprovado',
      pago: !comercial,
      destaque: false,
      criado_em: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('eventos').insert(novoEvento).select('*, criador:profiles(*)').single();
    if (error) {
      await registrarAcao({ acao: 'evento_criacao_falha', categoria: 'evento', severidade: 'aviso', detalhes: { motivo: error.message }, resultado: 'falha' });
      throw new Error(error.message);
    }

    await registrarAcao({ acao: 'evento_criado', categoria: 'evento', severidade: 'info', tabela: 'eventos', registroId: data.id, detalhes: { nome: data.nome, status: data.status, comercial: data.comercial, tipo_conta: profile?.tipo_conta }, resultado: 'sucesso' });

    // ── Email de confirmação para eventos PJ (pendentes) ───
    if (data.status === 'pendente') {
      emailService.eventoPendente({
        usuarioId:   user.id,
        eventoNome:  data.nome,
        local:       data.local,
        dataInicio:  data.data_inicio,
      });
    }

    return data;
  },

  // ── EDITAR ─────────────────────────────────────────────
  async editar(eventoId: string, updates: Partial<CriarEventoData>): Promise<Evento> {
    if (!supabaseConfigured) {
      const idx = DEMO_EVENTOS.findIndex((e) => e.id === eventoId);
      if (idx === -1) throw new Error('Evento não encontrado');
      DEMO_EVENTOS[idx] = { ...DEMO_EVENTOS[idx], ...updates };
      return DEMO_EVENTOS[idx];
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    // Verifica se o usuário é dono ou admin
    const { data: evento } = await supabase.from('eventos').select('criador_id, nome, descricao').eq('id', eventoId).single();
    const { data: profile } = await supabase.from('profiles').select('tipo_conta').eq('id', user.id).single();

    const isAdmin = profile?.tipo_conta === 'admin';
    const isDono = evento?.criador_id === user.id;
    if (!isDono && !isAdmin) throw new Error('SEM_PERMISSAO');

    // Revalida semântica se nome ou descrição mudaram
    if (updates.nome || updates.descricao) {
      const textoNovo = (updates.nome ?? evento?.nome ?? '') + ' ' + (updates.descricao ?? evento?.descricao ?? '');
      const ehComercial = validacaoSemantica.detectarConteudoComercial(textoNovo);
      if (ehComercial && !isAdmin) {
        await registrarAcao({ acao: 'evento_edicao_bloqueada', categoria: 'seguranca', severidade: 'aviso', tabela: 'eventos', registroId: eventoId, detalhes: { motivo: 'BLOQUEIO_COMERCIAL' }, resultado: 'bloqueado' });
        throw new Error('BLOQUEIO_COMERCIAL');
      }
    }

    const { data, error } = await supabase
      .from('eventos')
      .update({ ...updates, atualizado_em: new Date().toISOString() })
      .eq('id', eventoId)
      .select('*, criador:profiles(*)')
      .single();

    if (error) throw new Error(error.message);

    await registrarAcao({ acao: 'evento_editado', categoria: 'evento', severidade: 'info', tabela: 'eventos', registroId: eventoId, detalhes: { campos_alterados: Object.keys(updates) }, resultado: 'sucesso' });
    return data;
  },

  // ── DELETAR (soft delete → status 'expirado') ──────────
  async deletar(eventoId: string): Promise<void> {
    if (!supabaseConfigured) {
      const idx = DEMO_EVENTOS.findIndex((e) => e.id === eventoId);
      if (idx !== -1) DEMO_EVENTOS.splice(idx, 1);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { data: evento } = await supabase.from('eventos').select('criador_id').eq('id', eventoId).single();
    const { data: profile } = await supabase.from('profiles').select('tipo_conta').eq('id', user.id).single();

    const isAdmin = profile?.tipo_conta === 'admin';
    const isDono  = evento?.criador_id === user.id;
    if (!isDono && !isAdmin) throw new Error('SEM_PERMISSAO');

    // Soft delete: marca como expirado em vez de deletar fisicamente
    const { error } = await supabase
      .from('eventos')
      .update({ status: 'expirado', atualizado_em: new Date().toISOString() })
      .eq('id', eventoId);

    if (error) throw new Error(error.message);

    await registrarAcao({ acao: 'evento_deletado', categoria: 'evento', severidade: 'aviso', tabela: 'eventos', registroId: eventoId, detalhes: { por_admin: isAdmin }, resultado: 'sucesso' });
  },

  // ── FAVORITAR / DESFAVORITAR ───────────────────────────
  async favoritar(eventoId: string): Promise<void> {
    if (!supabaseConfigured) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Não autenticado');
    await supabase.from('favoritos').insert({ usuario_id: user.id, evento_id: eventoId, criado_em: new Date().toISOString() });
  },

  async desfavoritar(eventoId: string): Promise<void> {
    if (!supabaseConfigured) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Não autenticado');
    await supabase.from('favoritos').delete().eq('usuario_id', user.id).eq('evento_id', eventoId);
  },

  async listarFavoritos(): Promise<string[]> {
    if (!supabaseConfigured) return [];
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data } = await supabase.from('favoritos').select('evento_id').eq('usuario_id', user.id);
    return data?.map((f) => f.evento_id) || [];
  },
};
