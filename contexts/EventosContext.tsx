import React, { createContext, useContext, useState } from 'react';
import { Evento, CategoriaEvento } from '@/types';
import { eventosService } from '@/services/eventos';

interface EventosContextData {
  eventos: Evento[];
  loading: boolean;
  filtroCategoria: CategoriaEvento | null;
  busca: string;
  carregarEventos: () => Promise<void>;
  criarEvento: (data: CriarEventoData, tipoContaDemo?: 'pf' | 'pj' | 'gov', verificadoDemo?: boolean) => Promise<Evento>;
  buscarEventos: (termo: string) => Promise<void>;
  filtrarPorCategoria: (cat: CategoriaEvento | null) => void;
  favoritarEvento: (eventoId: string) => Promise<void>;
  desfavoritarEvento: (eventoId: string) => Promise<void>;
  favoritos: string[]; // ids dos eventos favoritos
}

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
}

const EventosContext = createContext<EventosContextData>({} as EventosContextData);

export function EventosProvider({ children }: { children: React.ReactNode }) {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaEvento | null>(null);
  const [busca, setBusca] = useState('');
  const [favoritos, setFavoritos] = useState<string[]>([]);

  async function carregarEventos() {
    setLoading(true);
    try {
      const data = await eventosService.listar(filtroCategoria, busca);
      setEventos(data);
    } finally {
      setLoading(false);
    }
  }

  async function criarEvento(
    data: CriarEventoData,
    tipoContaDemo?: 'pf' | 'pj' | 'gov',
    verificadoDemo?: boolean,
  ): Promise<Evento> {
    setLoading(true);
    try {
      const novo = await eventosService.criar(data, tipoContaDemo, verificadoDemo);
      setEventos((prev) => [novo, ...prev]);
      return novo;
    } finally {
      setLoading(false);
    }
  }

  async function buscarEventos(termo: string) {
    setBusca(termo);
    setLoading(true);
    try {
      const data = await eventosService.listar(filtroCategoria, termo);
      setEventos(data);
    } finally {
      setLoading(false);
    }
  }

  function filtrarPorCategoria(cat: CategoriaEvento | null) {
    setFiltroCategoria(cat);
  }

  async function favoritarEvento(eventoId: string) {
    await eventosService.favoritar(eventoId);
    setFavoritos((prev) => [...prev, eventoId]);
  }

  async function desfavoritarEvento(eventoId: string) {
    await eventosService.desfavoritar(eventoId);
    setFavoritos((prev) => prev.filter((id) => id !== eventoId));
  }

  return (
    <EventosContext.Provider
      value={{
        eventos,
        loading,
        filtroCategoria,
        busca,
        carregarEventos,
        criarEvento,
        buscarEventos,
        filtrarPorCategoria,
        favoritarEvento,
        desfavoritarEvento,
        favoritos,
      }}
    >
      {children}
    </EventosContext.Provider>
  );
}

export function useEventos() {
  const context = useContext(EventosContext);
  if (!context) {
    throw new Error('useEventos must be used within EventosProvider');
  }
  return context;
}
