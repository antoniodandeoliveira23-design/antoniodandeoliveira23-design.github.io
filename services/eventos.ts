import { supabase, supabaseConfigured } from './supabase';
import { Evento, CategoriaEvento } from '@/types';
import type { CriarEventoData } from '@/contexts/EventosContext';
import { validacaoSemantica } from './validacao-semantica';
import { registrarAcao, registrarAnomalia } from './auditoria';

// Demo pendentes (R4) - eventos comerciais aguardando aprovação admin
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

// Demo data when Supabase is not configured
const DEMO_EVENTOS: Evento[] = [
  { id: '1', criador_id: 'demo', nome: 'Festival de Música', descricao: 'Grande festival ao ar livre com bandas locais.', local: 'Centro, Vilhena - RO', lat: -12.7405, lng: -60.1458, categoria: 'musica', data_inicio: new Date().toISOString(), comercial: false, exclusivo_mulheres: false, status: 'aprovado', pago: true, destaque: false, criado_em: new Date().toISOString() },
  { id: '2', criador_id: 'demo', nome: 'Feira de Artesanato', descricao: 'Artesanato local e comidas típicas.', local: 'Praça Central', lat: -12.7380, lng: -60.1430, categoria: 'feira', data_inicio: new Date(Date.now() + 86400000).toISOString(), comercial: false, exclusivo_mulheres: false, status: 'aprovado', pago: true, destaque: true, criado_em: new Date().toISOString() },
  { id: '3', criador_id: 'demo', nome: 'Teatro Infantil', descricao: 'Peça teatral para crianças.', local: 'Teatro Municipal', lat: -12.7420, lng: -60.1500, categoria: 'cultura', data_inicio: new Date(Date.now() + 172800000).toISOString(), comercial: false, exclusivo_mulheres: false, status: 'aprovado', pago: true, destaque: false, criado_em: new Date().toISOString() },
  { id: '4', criador_id: 'demo', nome: 'Workshop de Fotografia', descricao: 'Aprenda técnicas de fotografia.', local: 'Espaço Cultural', lat: -12.7390, lng: -60.1440, categoria: 'educacao', data_inicio: new Date(Date.now() + 259200000).toISOString(), comercial: false, exclusivo_mulheres: false, status: 'aprovado', pago: true, destaque: false, criado_em: new Date().toISOString() },
];

export const eventosService = {
  async listar(categoria?: CategoriaEvento | null, busca?: string): Promise<Evento[]> {
    if (!supabaseConfigured) {
      let result = [...DEMO_EVENTOS];
      if (categoria) result = result.filter((e) => e.categoria === categoria);
      if (busca?.trim()) {
        const b = busca.toLowerCase();
        result = result.filter((e) => e.nome.toLowerCase().includes(b) || e.local.toLowerCase().includes(b));
      }
      return result;
    }

    let query = supabase
      .from('eventos')
      .select('*, criador:profiles(*)')
      .eq('status', 'aprovado')
      .order('data_inicio', { ascending: true });

    if (categoria) {
      query = query.eq('categoria', categoria);
    }

    if (busca && busca.trim()) {
      query = query.or(`nome.ilike.%${busca}%,local.ilike.%${busca}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  },

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

  async criar(eventoData: CriarEventoData, tipoContaDemo?: 'pf' | 'pj' | 'gov', verificadoDemo?: boolean): Promise<Evento> {
    // Demo mode: valida regras localmente sem Supabase
    if (!supabaseConfigured) {
      const tipo = tipoContaDemo || 'pf';

      // R7: Gov precisa estar verificada
      if (tipo === 'gov' && !verificadoDemo) {
        throw new Error('GOV_NAO_VERIFICADO');
      }

      // R1/R2/R6: Validação semântica
      const ehComercialDemo = validacaoSemantica.detectarConteudoComercial(
        eventoData.nome + ' ' + eventoData.descricao
      );
      if ((tipo === 'pf' || tipo === 'gov') && ehComercialDemo) {
        throw new Error('BLOQUEIO_COMERCIAL');
      }

      const comercialDemo = tipo === 'pj';
      const novoDemo: Evento = {
        id: 'demo-' + Date.now(),
        criador_id: 'demo',
        nome: eventoData.nome,
        descricao: eventoData.descricao,
        local: eventoData.local,
        lat: eventoData.lat,
        lng: eventoData.lng,
        categoria: eventoData.categoria,
        data_inicio: eventoData.data_inicio,
        comercial: comercialDemo,
        exclusivo_mulheres: eventoData.exclusivo_mulheres,
        status: comercialDemo ? 'pendente' : 'aprovado', // R4
        pago: !comercialDemo, // R3
        destaque: false,
        criado_em: new Date().toISOString(),
      };
      if (novoDemo.status === 'pendente') {
        _demoPendentes.unshift(novoDemo);
      } else {
        DEMO_EVENTOS.unshift(novoDemo);
      }
      return novoDemo;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    // Buscar perfil do criador para verificar tipo de conta
    const { data: profile } = await supabase
      .from('profiles')
      .select('tipo_conta, verificado')
      .eq('id', user.id)
      .single();

    // R7: Gov precisa estar verificada
    if (profile?.tipo_conta === 'gov' && !profile?.verificado) {
      await registrarAcao({
        acao: 'evento_criacao_bloqueada',
        categoria: 'seguranca',
        severidade: 'aviso',
        detalhes: { motivo: 'GOV_NAO_VERIFICADO', tipo_conta: profile?.tipo_conta },
        resultado: 'bloqueado',
      });
      throw new Error('GOV_NAO_VERIFICADO');
    }

    // R1/R2/R6: Validação semântica - PF e Gov não podem publicar conteúdo comercial
    const ehComercial = validacaoSemantica.detectarConteudoComercial(
      eventoData.nome + ' ' + eventoData.descricao
    );

    if ((profile?.tipo_conta === 'pf' || profile?.tipo_conta === 'gov') && ehComercial) {
      await registrarAcao({
        acao: 'evento_criacao_bloqueada',
        categoria: 'seguranca',
        severidade: 'aviso',
        detalhes: { motivo: 'BLOQUEIO_COMERCIAL', tipo_conta: profile?.tipo_conta },
        resultado: 'bloqueado',
      });
      await registrarAnomalia({
        userId: user.id,
        tipo: 'conteudo_suspeito',
        descricao: 'PF tentou publicar evento com linguagem comercial',
        detalhes: { nome_evento: eventoData.nome.substring(0, 50) },
      });
      throw new Error('BLOQUEIO_COMERCIAL');
    }

    // R3: Verificar se PJ pagou antes de publicar
    const comercial = profile?.tipo_conta === 'pj';
    let status: 'aprovado' | 'pendente' = 'aprovado';

    if (comercial) {
      // R4: Conteúdo empresarial precisa de aprovação
      status = 'pendente';
    }

    const novoEvento = {
      criador_id: user.id,
      nome: eventoData.nome,
      descricao: eventoData.descricao,
      local: eventoData.local,
      lat: eventoData.lat,
      lng: eventoData.lng,
      categoria: eventoData.categoria,
      data_inicio: eventoData.data_inicio,
      data_fim: eventoData.data_fim || null,
      comercial,
      exclusivo_mulheres: eventoData.exclusivo_mulheres,
      status,
      pago: !comercial, // PF não precisa pagar; PJ precisa (R3)
      destaque: false,
      criado_em: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('eventos')
      .insert(novoEvento)
      .select('*, criador:profiles(*)')
      .single();

    if (error) {
      await registrarAcao({
        acao: 'evento_criacao_falha',
        categoria: 'evento',
        severidade: 'aviso',
        detalhes: { motivo: error.message },
        resultado: 'falha',
      });
      throw new Error(error.message);
    }

    await registrarAcao({
      acao: 'evento_criado',
      categoria: 'evento',
      severidade: 'info',
      tabela: 'eventos',
      registroId: data.id,
      detalhes: {
        nome: data.nome,
        status: data.status,
        comercial: data.comercial,
        tipo_conta: profile?.tipo_conta,
      },
      resultado: 'sucesso',
    });

    return data;
  },

  async favoritar(eventoId: string): Promise<void> {
    if (!supabaseConfigured) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Não autenticado');

    await supabase.from('favoritos').insert({
      usuario_id: user.id,
      evento_id: eventoId,
      criado_em: new Date().toISOString(),
    });
  },

  async desfavoritar(eventoId: string): Promise<void> {
    if (!supabaseConfigured) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Não autenticado');

    await supabase
      .from('favoritos')
      .delete()
      .eq('usuario_id', user.id)
      .eq('evento_id', eventoId);
  },

  async listarFavoritos(): Promise<string[]> {
    if (!supabaseConfigured) return [];
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
      .from('favoritos')
      .select('evento_id')
      .eq('usuario_id', user.id);

    return data?.map((f) => f.evento_id) || [];
  },
};
