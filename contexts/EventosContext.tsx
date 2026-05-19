import React, { createContext, useContext, useState, useCallback } from 'react';
import { Evento, CategoriaEvento } from '@/types';
import {
  eventosService,
  OpcoesFiltro,
  RespostaPaginada,
  EventoComDistancia,
} from '@/services/eventos';

// ─────────────────────────────────────────────────────────
// Tipos exportados
// ─────────────────────────────────────────────────────────

export interface CriarEventoData {
  nome: string;
  descricao: string;
  local: string;
  lat: number;
  lng: number;
  categoria: CategoriaEvento;
  data_inicio: string;
  data_fim?: string;
  exclusivo_mulheres: boolean;
  imagem_url?: string;
}

export interface EstadoPaginacao {
  pagina: number;
  porPagina: number;
  total: number;
  temMais: boolean;
}

interface EventosContextData {
  // Estado
  eventos: Evento[];
  loading: boolean;
  filtroCategoria: CategoriaEvento | null;
  busca: string;
  paginacao: EstadoPaginacao;
  favoritos: string[];

  // Listagem e busca
  carregarEventos: (opcoes?: OpcoesFiltro) => Promise<void>;
  carregarMais: () => Promise<void>;
  buscarEventos: (termo: string) => Promise<void>;
  filtrarPorCategoria: (cat: CategoriaEvento | null) => void;

  // Geolocalização
  buscarPorRaio: (
    lat: number,
    lng: number,
    raioKm?: number,
    opcoes?: { categoria?: CategoriaEvento | null; pagina?: number }
  ) => Promise<RespostaPaginada<EventoComDistancia>>;

  // CRUD
  criarEvento: (
    data: CriarEventoData,
    tipoContaDemo?: 'pf' | 'pj' | 'gov' | 'admin',
    verificadoDemo?: boolean
  ) => Promise<Evento>;
  editarEvento: (eventoId: string, updates: Partial<CriarEventoData>) => Promise<Evento>;
  deletarEvento: (eventoId: string) => Promise<void>;

  // Favoritos
  favoritarEvento: (eventoId: string) => Promise<void>;
  desfavoritarEvento: (eventoId: string) => Promise<void>;
}

// ─────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────

const PAGINACAO_INICIAL: EstadoPaginacao = {
  pagina: 1,
  porPagina: 20,
  total: 0,
  temMais: false,
};

const EventosContext = createContext<EventosContextData>({} as EventosContextData);

// ─────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────

export function EventosProvider({ children }: { children: React.ReactNode }) {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaEvento | null>(null);
  const [busca, setBusca] = useState('');
  const [paginacao, setPaginacao] = useState<EstadoPaginacao>(PAGINACAO_INICIAL);
  const [favoritos, setFavoritos] = useState<string[]>([]);

  // ── Carregar eventos (substitui lista atual) ───────────
  const carregarEventos = useCallback(async (opcoes: OpcoesFiltro = {}) => {
    setLoading(true);
    try {
      const resultado: RespostaPaginada<Evento> = await eventosService.listar({
        categoria: filtroCategoria,
        busca,
        pagina: 1,
        porPagina: paginacao.porPagina,
        ...opcoes,
      });
      setEventos(resultado.dados);
      setPaginacao({
        pagina: resultado.pagina,
        porPagina: resultado.porPagina,
        total: resultado.total,
        temMais: resultado.temMais,
      });
    } finally {
      setLoading(false);
    }
  }, [filtroCategoria, busca, paginacao.porPagina]);

  // ── Carregar mais (append — infinite scroll) ───────────
  const carregarMais = useCallback(async () => {
    if (!paginacao.temMais || loading) return;
    setLoading(true);
    try {
      const proxPagina = paginacao.pagina + 1;
      const resultado = await eventosService.listar({
        categoria: filtroCategoria,
        busca,
        pagina: proxPagina,
        porPagina: paginacao.porPagina,
      });
      setEventos((prev) => [...prev, ...resultado.dados]);
      setPaginacao({
        pagina: resultado.pagina,
        porPagina: resultado.porPagina,
        total: resultado.total,
        temMais: resultado.temMais,
      });
    } finally {
      setLoading(false);
    }
  }, [paginacao, filtroCategoria, busca, loading]);

  // ── Busca por texto ────────────────────────────────────
  const buscarEventos = useCallback(async (termo: string) => {
    setBusca(termo);
    setLoading(true);
    try {
      const resultado = await eventosService.listar({
        categoria: filtroCategoria,
        busca: termo,
        pagina: 1,
        porPagina: paginacao.porPagina,
      });
      setEventos(resultado.dados);
      setPaginacao({ pagina: resultado.pagina, porPagina: resultado.porPagina, total: resultado.total, temMais: resultado.temMais });
    } finally {
      setLoading(false);
    }
  }, [filtroCategoria, paginacao.porPagina]);

  // ── Filtro por categoria ───────────────────────────────
  const filtrarPorCategoria = useCallback((cat: CategoriaEvento | null) => {
    setFiltroCategoria(cat);
  }, []);

  // ── Busca geográfica por raio ──────────────────────────
  const buscarPorRaio = useCallback(async (
    lat: number,
    lng: number,
    raioKm: number = 10,
    opcoes: { categoria?: CategoriaEvento | null; pagina?: number } = {}
  ): Promise<RespostaPaginada<EventoComDistancia>> => {
    return eventosService.listarPorRaio(lat, lng, raioKm, {
      categoria: opcoes.categoria ?? filtroCategoria,
      pagina: opcoes.pagina ?? 1,
      porPagina: paginacao.porPagina,
    });
  }, [filtroCategoria, paginacao.porPagina]);

  // ── Criar evento ───────────────────────────────────────
  // Não usa o loading compartilhado — o caller (criar-evento.tsx) tem seu próprio estado
  // de carregando, evitando spinner na lista durante a criação.
  const criarEvento = useCallback(async (
    data: CriarEventoData,
    tipoContaDemo?: 'pf' | 'pj' | 'gov' | 'admin',
    verificadoDemo?: boolean,
  ): Promise<Evento> => {
    const novo = await eventosService.criar(data, tipoContaDemo, verificadoDemo);
    // Insere no topo apenas se aprovado (pendente vai para moderação)
    if (novo.status === 'aprovado') {
      setEventos((prev) => [novo, ...prev]);
      setPaginacao((p) => ({ ...p, total: p.total + 1 }));
    }
    return novo;
  }, []);

  // ── Editar evento ──────────────────────────────────────
  const editarEvento = useCallback(async (
    eventoId: string,
    updates: Partial<CriarEventoData>,
  ): Promise<Evento> => {
    const atualizado = await eventosService.editar(eventoId, updates);
    setEventos((prev) =>
      prev.map((e) => (e.id === eventoId ? atualizado : e))
    );
    return atualizado;
  }, []);

  // ── Deletar evento ─────────────────────────────────────
  const deletarEvento = useCallback(async (eventoId: string): Promise<void> => {
    await eventosService.deletar(eventoId);
    setEventos((prev) => prev.filter((e) => e.id !== eventoId));
    setPaginacao((p) => ({ ...p, total: Math.max(0, p.total - 1) }));
  }, []);

  // ── Favoritar ──────────────────────────────────────────
  const favoritarEvento = useCallback(async (eventoId: string) => {
    await eventosService.favoritar(eventoId);
    setFavoritos((prev) => [...prev, eventoId]);
  }, []);

  const desfavoritarEvento = useCallback(async (eventoId: string) => {
    await eventosService.desfavoritar(eventoId);
    setFavoritos((prev) => prev.filter((id) => id !== eventoId));
  }, []);

  return (
    <EventosContext.Provider
      value={{
        eventos,
        loading,
        filtroCategoria,
        busca,
        paginacao,
        favoritos,
        carregarEventos,
        carregarMais,
        buscarEventos,
        filtrarPorCategoria,
        buscarPorRaio,
        criarEvento,
        editarEvento,
        deletarEvento,
        favoritarEvento,
        desfavoritarEvento,
      }}
    >
      {children}
    </EventosContext.Provider>
  );
}

export function useEventos() {
  const context = useContext(EventosContext);
  if (!context) throw new Error('useEventos must be used within EventosProvider');
  return context;
}
