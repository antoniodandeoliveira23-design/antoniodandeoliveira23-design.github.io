// === USUARIOS ===

export type TipoConta = 'pf' | 'pj' | 'gov' | 'admin';
export type Genero = 'masculino' | 'feminino' | 'outro' | 'prefiro_nao_dizer';

export interface User {
  id: string;
  email: string;
  nome: string;
  sobrenome: string;
  username: string;
  tipo_conta: TipoConta;
  genero?: Genero;
  avatar_url?: string;
  bio?: string;
  cnpj?: string; // apenas PJ
  verificado: boolean; // true para gov verificado
  criado_em: string;
  atualizado_em: string;
}

// === EVENTOS ===

export type CategoriaEvento =
  | 'musica'
  | 'teatro'
  | 'esporte'
  | 'educacao'
  | 'feira'
  | 'cultura'
  | 'gastronomia'
  | 'negocios'
  | 'religiao'
  | 'governo'
  | 'outro';

export type StatusEvento = 'rascunho' | 'pendente' | 'aprovado' | 'rejeitado' | 'expirado';

export interface Evento {
  id: string;
  criador_id: string;
  criador?: User;
  nome: string;
  descricao: string;
  local: string;
  lat: number;
  lng: number;
  categoria: CategoriaEvento;
  data_inicio: string;
  data_fim?: string;
  imagem_url?: string;
  comercial: boolean; // true = evento pago/comercial (PJ)
  exclusivo_mulheres: boolean; // R9
  status: StatusEvento; // R4 - aprovacao
  pago: boolean; // R3 - pagamento feito
  destaque: boolean; // impulsionamento
  criado_em: string;
}

// === MENSAGENS ===

export interface Conversa {
  id: string;
  participante_ids: string[];
  participantes?: User[];
  ultima_mensagem?: string;
  atualizado_em: string;
}

export interface Mensagem {
  id: string;
  conversa_id: string;
  autor_id: string;
  autor?: User;
  texto: string;
  lida: boolean;
  criado_em: string;
}

// === DENUNCIAS (R8) ===

export type StatusDenuncia = 'aberta' | 'em_analise' | 'resolvida' | 'descartada';
export type TipoDenuncia = 'evento' | 'usuario' | 'mensagem';

export interface Denuncia {
  id: string;
  denunciante_id: string;
  tipo: TipoDenuncia;
  alvo_id: string; // id do evento, usuario ou mensagem
  motivo: string;
  descricao?: string;
  status: StatusDenuncia;
  criado_em: string;
}

// === PAGAMENTOS (R3) ===

export type StatusPagamento = 'pendente' | 'processando' | 'aprovado' | 'recusado';

export interface Pagamento {
  id: string;
  usuario_id: string;
  evento_id: string;
  valor: number;
  moeda: string;
  status: StatusPagamento;
  metodo: string;
  criado_em: string;
}

// === FAVORITOS ===

export interface Favorito {
  id: string;
  usuario_id: string;
  evento_id: string;
  criado_em: string;
}

// === PRODUTOS (PJ) ===

export type CategoriaProduto = 'alimentacao' | 'vestuario' | 'servicos' | 'artesanato' | 'tecnologia' | 'saude' | 'outro';
export type StatusProduto = 'ativo' | 'inativo' | 'pendente';

export interface Produto {
  id: string;
  criador_id: string;
  criador?: User;
  nome: string;
  descricao: string;
  preco: number;
  moeda: string;
  categoria: CategoriaProduto;
  imagem_url?: string;
  local: string;
  lat: number;
  lng: number;
  status: StatusProduto;
  evento_id?: string; // vinculado a um evento (opcional)
  criado_em: string;
}

// === FILTRO TEMPORAL ===

export type FiltroTemporal = 'hoje' | 'semana' | 'mes' | 'semestre';

// === PLANOS (Monetizacao) ===

export type TipoPlano = 'avulso' | 'mensal' | 'trimestral' | 'anual';

export interface Plano {
  id: string;
  nome: string;
  tipo: TipoPlano;
  preco: number;
  max_eventos: number;
  destaque_incluso: boolean;
  descricao: string;
}

// === AUTH STATE ===

export interface AuthState {
  user: User | null;
  loading: boolean;
  signed: boolean;
}
