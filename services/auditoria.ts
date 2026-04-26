import { supabase, supabaseConfigured } from './supabase';

// ─────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────
export type CategoriaAudit =
  | 'auth'
  | 'evento'
  | 'moderacao'
  | 'pagamento'
  | 'denuncia'
  | 'admin'
  | 'seguranca';

export type SeveridadeAudit = 'info' | 'aviso' | 'critico';
export type ResultadoAudit = 'sucesso' | 'falha' | 'bloqueado';

export interface RegistrarAcaoParams {
  acao: string;
  categoria: CategoriaAudit;
  severidade?: SeveridadeAudit;
  tabela?: string;
  registroId?: string;
  detalhes?: Record<string, any>;
  resultado?: ResultadoAudit;
}

export interface AuditEntry {
  id: string;
  user_id: string | null;
  acao: string;
  categoria: CategoriaAudit;
  severidade: SeveridadeAudit;
  tabela: string | null;
  registro_id: string | null;
  detalhes: Record<string, any>;
  resultado: ResultadoAudit;
  created_at: string;
}

export interface AccessEntry {
  id: string;
  user_id: string | null;
  evento: string;
  user_agent: string | null;
  created_at: string;
}

export interface AnomaliaEntry {
  id: string;
  user_id: string | null;
  tipo: string;
  descricao: string;
  detalhes: Record<string, any>;
  resolvido: boolean;
  created_at: string;
  usuario_nome?: string;
  tipo_conta?: string;
}

// ─────────────────────────────────────────────────────────
// Buffer em memória — evita perda de logs se banco offline
// ─────────────────────────────────────────────────────────
const _buffer: RegistrarAcaoParams[] = [];
let _flushAgendado = false;

async function flushBuffer() {
  if (!supabaseConfigured || _buffer.length === 0) return;

  const lote = _buffer.splice(0, 20);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const registros = lote.map((p) => ({
      user_id: user?.id ?? null,
      acao: p.acao,
      categoria: p.categoria,
      severidade: p.severidade ?? 'info',
      tabela: p.tabela ?? null,
      registro_id: p.registroId ?? null,
      detalhes: p.detalhes ?? {},
      resultado: p.resultado ?? 'sucesso',
    }));
    await supabase.from('audit_log').insert(registros);
  } catch {
    // Devolve ao buffer se falhar
    _buffer.unshift(...lote);
  }
  _flushAgendado = false;
}

// ─────────────────────────────────────────────────────────
// registrarAcao — principal função de auditoria
// Nunca lança exceção (não pode quebrar o fluxo principal)
// ─────────────────────────────────────────────────────────
export async function registrarAcao(params: RegistrarAcaoParams): Promise<void> {
  if (!supabaseConfigured) return;

  _buffer.push(params);

  if (!_flushAgendado) {
    _flushAgendado = true;
    // Flush assíncrono — não bloqueia o chamador
    setTimeout(flushBuffer, 300);
  }
}

// ─────────────────────────────────────────────────────────
// registrarAcesso — logins, logouts, falhas de auth
// ─────────────────────────────────────────────────────────
export async function registrarAcesso(
  evento: 'login' | 'logout' | 'login_falha' | 'cadastro' | 'token_renovado',
  userId?: string
): Promise<void> {
  if (!supabaseConfigured) return;

  try {
    const userAgent =
      typeof navigator !== 'undefined'
        ? navigator.userAgent.substring(0, 200)
        : 'SSR';

    await supabase.from('access_log').insert({
      user_id: userId ?? null,
      evento,
      user_agent: userAgent,
    });
  } catch {
    // Silencioso — log nunca quebra o fluxo
  }
}

// ─────────────────────────────────────────────────────────
// registrarAnomalia — comportamento suspeito detectado no frontend
// ─────────────────────────────────────────────────────────
export async function registrarAnomalia(params: {
  userId?: string;
  tipo:
    | 'login_falha_repetida'
    | 'velocidade'
    | 'conteudo_suspeito'
    | 'ip_duplicado'
    | 'evento_clonado'
    | 'multiplas_denuncias';
  descricao: string;
  detalhes?: Record<string, any>;
}): Promise<void> {
  if (!supabaseConfigured) return;

  try {
    await supabase.from('anomalia_log').insert({
      user_id: params.userId ?? null,
      tipo: params.tipo,
      descricao: params.descricao,
      detalhes: params.detalhes ?? {},
      resolvido: false,
    });
  } catch {
    // Silencioso
  }
}

// ─────────────────────────────────────────────────────────
// Detecção de login com falha repetida (frontend)
// ─────────────────────────────────────────────────────────
const _loginFalhas: Record<string, number> = {};

export function trackLoginFalha(email: string): void {
  const chave = email.toLowerCase().trim();
  _loginFalhas[chave] = (_loginFalhas[chave] ?? 0) + 1;

  if (_loginFalhas[chave] >= 5) {
    registrarAnomalia({
      tipo: 'login_falha_repetida',
      descricao: `5+ tentativas de login falhas para o mesmo email`,
      detalhes: {
        email_hash: chave.substring(0, 3) + '***',
        tentativas: _loginFalhas[chave],
      },
    });
    // Reset após registrar
    _loginFalhas[chave] = 0;
  }
}

// ─────────────────────────────────────────────────────────
// Consultas para o painel Admin
// ─────────────────────────────────────────────────────────
export async function listarAuditRecente(limite = 100): Promise<AuditEntry[]> {
  if (!supabaseConfigured) return _mockAuditDemo();

  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limite);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function listarAcessosRecentes(limite = 50): Promise<AccessEntry[]> {
  if (!supabaseConfigured) return [];

  const { data, error } = await supabase
    .from('access_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limite);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function listarAnomalias(apenasAtivas = true): Promise<AnomaliaEntry[]> {
  if (!supabaseConfigured) return _mockAnomaliasDemo();

  let query = supabase
    .from('anomalia_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (apenasAtivas) {
    query = query.eq('resolvido', false);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function resolverAnomalia(id: string): Promise<void> {
  if (!supabaseConfigured) return;

  const { error } = await supabase
    .from('anomalia_log')
    .update({ resolvido: true })
    .eq('id', id);

  if (error) throw new Error(error.message);

  // Audita a resolução
  await registrarAcao({
    acao: 'anomalia_resolvida',
    categoria: 'admin',
    severidade: 'info',
    tabela: 'anomalia_log',
    registroId: id,
  });
}

export async function contarAnomaliasPendentes(): Promise<number> {
  if (!supabaseConfigured) return 2; // demo

  const { count } = await supabase
    .from('anomalia_log')
    .select('*', { count: 'exact', head: true })
    .eq('resolvido', false);

  return count ?? 0;
}

// ─────────────────────────────────────────────────────────
// Dados demo para quando Supabase não está configurado
// ─────────────────────────────────────────────────────────
function _mockAuditDemo(): AuditEntry[] {
  return [
    {
      id: 'demo-audit-1',
      user_id: 'demo-user-admin',
      acao: 'evento_aprovado',
      categoria: 'moderacao',
      severidade: 'info',
      tabela: 'eventos',
      registro_id: 'pend-1',
      detalhes: {},
      resultado: 'sucesso',
      created_at: new Date().toISOString(),
    },
    {
      id: 'demo-audit-2',
      user_id: null,
      acao: 'login_falha',
      categoria: 'auth',
      severidade: 'aviso',
      tabela: null,
      registro_id: null,
      detalhes: { email_hash: 'tes***' },
      resultado: 'falha',
      created_at: new Date(Date.now() - 300000).toISOString(),
    },
  ];
}

function _mockAnomaliasDemo(): AnomaliaEntry[] {
  return [
    {
      id: 'demo-anom-1',
      user_id: 'demo-user-pf',
      tipo: 'velocidade',
      descricao: 'Usuário criou 5+ eventos em menos de 1 hora',
      detalhes: { eventos_na_hora: 6 },
      resolvido: false,
      created_at: new Date().toISOString(),
      usuario_nome: 'Maria Silva',
      tipo_conta: 'pf',
    },
    {
      id: 'demo-anom-2',
      user_id: null,
      tipo: 'login_falha_repetida',
      descricao: '5+ tentativas de login falhas',
      detalhes: { email_hash: 'tes***', tentativas: 7 },
      resolvido: false,
      created_at: new Date(Date.now() - 600000).toISOString(),
    },
  ];
}
