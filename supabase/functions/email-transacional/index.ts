/**
 * Edge Function: email-transacional
 * Envia emails via Resend API com templates HTML responsivos.
 *
 * ── Deploy ──────────────────────────────────────────────────────
 *   supabase functions deploy email-transacional
 *
 * ── Variáveis de ambiente (Supabase Dashboard → Edge Functions) ─
 *   RESEND_API_KEY              → chave Resend (re_xxx...)
 *   FROM_EMAIL                  → "AGORA <nao-responda@agora.app>"
 *   ALERT_SECRET                → segredo para chamadas internas
 *   SUPABASE_URL                → injetado automaticamente
 *   SUPABASE_SERVICE_ROLE_KEY   → injetado automaticamente
 *
 * ── Tipos de email suportados ────────────────────────────────────
 *   boas_vindas          → novo usuário cadastrado
 *   evento_pendente      → criador de evento PJ aguarda análise
 *   evento_aprovado      → evento comercial aprovado pelo admin
 *   evento_rejeitado     → evento rejeitado com motivo
 *   pagamento_confirmado → recibo de pagamento
 *   senha_redefinida     → confirmação de troca de senha
 *   alerta_denuncia      → admin notificado de denúncia crítica
 *   nova_mensagem        → notificação de mensagem não lida
 *
 * ── Segurança ────────────────────────────────────────────────────
 *   • Aceita JWT de usuário autenticado OU ALERT_SECRET (sistema)
 *   • Rate limit em memória: 1 email do mesmo tipo/destinatário a cada 2 min
 *   • CORS headers incluídos
 *   • Nunca expõe RESEND_API_KEY ao cliente
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { validarAuth, buscarEmailUsuario, rateLimitCheck, getAdminClient } from '../_shared/auth.ts';

// ─────────────────────────────────────────────────────────────────
// Configuração
// ─────────────────────────────────────────────────────────────────

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL') ?? 'AGORA <nao-responda@agora.app>';
const APP_URL        = Deno.env.get('APP_URL')    ?? 'https://agora-vilhena.vercel.app';

// ─────────────────────────────────────────────────────────────────
// Formata ISO date → dd/mm/aaaa em horário de Vilhena (UTC-4)
// ─────────────────────────────────────────────────────────────────
export function formatarData(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      timeZone: 'America/Porto_Velho',
      day:   '2-digit',
      month: '2-digit',
      year:  'numeric',
    });
  } catch {
    return iso;
  }
}

// ─────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────

interface EmailPayload {
  tipo:        string;
  para?:       string;         // email explícito do destinatário
  usuario_id?: string;         // alternativa: busca email pelo UUID
  nome?:       string;
  dados?:      Record<string, string>;
  idempotency_key?: string;    // Resend idempotency (evita duplicatas)
}

// ─────────────────────────────────────────────────────────────────
// TEMPLATES HTML responsivos
// ─────────────────────────────────────────────────────────────────

// Estilos base reutilizáveis
const S = {
  wrapper: `margin:0;padding:16px;background:#07070E;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;`,
  card:    `max-width:520px;margin:0 auto;background:#0F0F1A;border-radius:12px;overflow:hidden;`,
  header:  `background:linear-gradient(135deg,#6C3FC5 0%,#FF6B00 100%);padding:28px 24px;text-align:center;`,
  body:    `padding:32px 24px;`,
  footer:  `background:#1A1A2E;padding:16px 24px;text-align:center;color:#888;font-size:12px;`,
  h1:      `margin:0;font-size:26px;letter-spacing:4px;color:#fff;`,
  sub:     `margin:4px 0 0;color:rgba(255,255,255,0.65);font-size:12px;`,
  h2:      `margin-top:0;`,
  p:       `color:#CCCCCC;line-height:1.7;`,
  btn:     `display:inline-block;background:#6C3FC5;color:#fff;padding:13px 30px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;margin-top:18px;`,
  info:    `background:#1A1A2E;border-radius:8px;padding:16px 18px;margin:16px 0;`,
  warn:    `background:#2A1515;border-left:4px solid #EF4444;padding:12px 16px;border-radius:0 8px 8px 0;`,
  success: `background:#0F2A1F;border-left:4px solid #22C55E;padding:12px 16px;border-radius:0 8px 8px 0;`,
  orange:  `color:#FF7A00;`,
  green:   `color:#22C55E;`,
  red:     `color:#EF4444;`,
  muted:   `color:#888;font-size:12px;`,
};

export function layout(body: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${S.wrapper}">
  <div style="${S.card}">
    <div style="${S.header}">
      <h1 style="${S.h1}">AGORA</h1>
      <p style="${S.sub}">Plataforma de Eventos de Vilhena · RO</p>
    </div>
    <div style="${S.body}">${body}</div>
    <div style="${S.footer}">
      <p style="margin:0">Este é um email automático. Por favor, não responda.</p>
      <p style="margin:4px 0 0">© ${new Date().getFullYear()} AGORA — Vilhena, Rondônia</p>
    </div>
  </div>
</body></html>`;
}

// Mapa de templates: tipo → função geradora
type TemplateResult = { subject: string; html: string };
type TemplateData   = Record<string, string>;

export const TEMPLATES: Record<string, (nome: string, d: TemplateData) => TemplateResult> = {

  boas_vindas: (nome, _d) => ({
    subject: `Bem-vindo ao AGORA, ${nome}! 🎉`,
    html: layout(`
      <h2 style="${S.h2}${S.orange}">Olá, ${nome}! 👋</h2>
      <p style="${S.p}">Bem-vindo ao <strong>AGORA</strong>, a plataforma de eventos de Vilhena — RO.
      Aqui você descobre e divulga o que acontece na sua cidade em tempo real.</p>
      <div style="${S.info}">
        <p style="margin:0 0 10px;color:#fff;font-weight:bold;font-size:14px">O que você pode fazer agora:</p>
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:6px 0;color:#CCCCCC;font-size:14px">📅</td>
            <td style="padding:6px 8px;color:#CCCCCC;font-size:14px">Descobrir eventos próximos no mapa interativo</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#CCCCCC;font-size:14px">💬</td>
            <td style="padding:6px 8px;color:#CCCCCC;font-size:14px">Conversar diretamente com organizadores de eventos</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#CCCCCC;font-size:14px">💛</td>
            <td style="padding:6px 8px;color:#CCCCCC;font-size:14px">Favoritar eventos e receber lembretes</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#CCCCCC;font-size:14px">🏢</td>
            <td style="padding:6px 8px;color:#CCCCCC;font-size:14px">Divulgar eventos do seu negócio para toda a cidade</td>
          </tr>
        </table>
      </div>
      <div style="${S.success}">
        <p style="margin:0;color:#A7F3D0;font-size:14px">
          ✅ Sua conta foi criada com sucesso! Confirme seu email para ativar todos os recursos.
        </p>
      </div>
      <div style="text-align:center">
        <a href="${APP_URL}" style="${S.btn}">Explorar eventos agora</a>
      </div>
      <p style="margin-top:20px;${S.p}${S.muted}">
        Dúvidas? Acesse <a href="${APP_URL}/ajuda" style="color:#8B5CF6">Central de Ajuda</a> ou responda a este email.
      </p>
    `),
  }),

  evento_pendente: (nome, d) => ({
    subject: `Evento "${d.evento_nome}" recebido — aguardando análise`,
    html: layout(`
      <h2 style="${S.h2}${S.orange}">Evento recebido! ✅</h2>
      <p style="${S.p}">Olá, <strong>${nome}</strong>! Seu evento foi enviado com sucesso.</p>
      <div style="${S.info}">
        <p style="margin:0;color:#fff;font-weight:bold">${d.evento_nome}</p>
        ${d.data_inicio ? `<p style="margin:6px 0 0;${S.muted}">📅 ${d.data_inicio}</p>` : ''}
        ${d.local ? `<p style="margin:4px 0 0;${S.muted}">📍 ${d.local}</p>` : ''}
      </div>
      <div style="${S.success}">
        <p style="margin:0;color:#A7F3D0;font-size:14px">
          ⏱️ <strong>Prazo de análise:</strong> até 48 horas úteis.<br>
          Você receberá um email assim que o evento for aprovado ou revisado.
        </p>
      </div>
      <p style="${S.p}${S.muted}">Acompanhe em <em>Perfil → Meus Eventos</em>.</p>
    `),
  }),

  evento_aprovado: (nome, d) => ({
    subject: `🎉 "${d.evento_nome}" foi aprovado e está no ar!`,
    html: layout(`
      <h2 style="${S.h2}${S.green}">Evento aprovado! 🚀</h2>
      <p style="${S.p}">Olá, <strong>${nome}</strong>! Sua publicação passou pela moderação. Ótima notícia:</p>
      <div style="${S.info}">
        <p style="margin:0 0 4px;color:#fff;font-weight:bold;font-size:16px">${d.evento_nome}</p>
        ${d.data_inicio ? `<p style="margin:6px 0 0;${S.muted}">📅 ${d.data_inicio}</p>` : ''}
        ${d.local       ? `<p style="margin:4px 0 0;${S.muted}">📍 ${d.local}</p>`       : ''}
      </div>
      <div style="${S.success}">
        <p style="margin:0;color:#A7F3D0;font-size:14px">
          ✅ Seu evento está <strong>ao vivo no mapa</strong> e visível para todos os usuários do AGORA em Vilhena.
        </p>
      </div>
      <p style="${S.p}">Agora você pode compartilhar o link com seu público e acompanhar o interesse dos participantes pelo chat.</p>
      <div style="text-align:center">
        <a href="${APP_URL}/meus-eventos" style="${S.btn}">Ver meu evento publicado</a>
      </div>
      <p style="margin-top:20px;${S.p}${S.muted}">
        Acesse <em>Perfil → Meus Eventos</em> para editar detalhes a qualquer momento.
      </p>
    `),
  }),

  evento_rejeitado: (nome, d) => ({
    subject: `Revisão necessária — "${d.evento_nome}"`,
    html: layout(`
      <h2 style="${S.h2}${S.red}">Evento não aprovado</h2>
      <p style="${S.p}">Olá, <strong>${nome}</strong>. Infelizmente o evento
      <strong>"${d.evento_nome}"</strong> não foi aprovado.</p>
      <div style="${S.warn}">
        <p style="margin:0;color:#FCA5A5;font-size:14px">
          <strong>Motivo:</strong><br>
          ${d.motivo || 'Conteúdo não está de acordo com as diretrizes da plataforma.'}
        </p>
      </div>
      <p style="${S.p}">Você pode <strong>editar e reenviar</strong> o evento.
      Acesse <em>Perfil → Meus Eventos</em> para fazer os ajustes necessários.</p>
      <div style="text-align:center">
        <a href="${APP_URL}/meus-eventos" style="${S.btn}">Editar evento</a>
      </div>
    `),
  }),

  pagamento_confirmado: (nome, d) => ({
    subject: `Pagamento confirmado — ${d.plano_nome || 'Plano AGORA'}`,
    html: layout(`
      <h2 style="${S.h2}${S.green}">Pagamento confirmado! 💳</h2>
      <p style="${S.p}">Olá, <strong>${nome}</strong>! Seu pagamento foi processado.</p>
      <div style="${S.info}">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#888">Plano</td>
              <td style="text-align:right;color:#fff;font-weight:bold">${d.plano_nome || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Valor</td>
              <td style="text-align:right;${S.orange}font-weight:bold">R$ ${d.valor || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Válido até</td>
              <td style="text-align:right;color:#fff">${formatarData(d.validade)}</td></tr>
          ${d.metodo ? `<tr><td style="padding:6px 0;color:#888">Método</td>
              <td style="text-align:right;color:#fff">${d.metodo}</td></tr>` : ''}
          ${d.id_externo ? `<tr><td style="padding:6px 0;color:#888">ID</td>
              <td style="text-align:right;${S.muted}">${d.id_externo}</td></tr>` : ''}
        </table>
      </div>
      <div style="${S.success}">
        <p style="margin:0;color:#A7F3D0;font-size:14px">
          🌟 Seus eventos agora têm <strong>destaque</strong> no mapa do AGORA!
        </p>
      </div>
    `),
  }),

  senha_redefinida: (nome, _d) => ({
    subject: '🔐 Senha alterada com sucesso — AGORA',
    html: layout(`
      <h2 style="${S.h2}${S.green}">Senha redefinida com sucesso ✅</h2>
      <p style="${S.p}">Olá, <strong>${nome}</strong>. A senha da sua conta no <strong>AGORA</strong>
      foi alterada com sucesso em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Porto_Velho', dateStyle: 'short', timeStyle: 'short' })}.</p>
      <div style="${S.success}">
        <p style="margin:0;color:#A7F3D0;font-size:14px">
          ✅ Você já pode entrar com a nova senha pelo app ou site.
        </p>
      </div>
      <div style="${S.warn}">
        <p style="margin:0;color:#FCA5A5;font-size:14px">
          ⚠️ <strong>Não foi você?</strong> Se não autorizou esta alteração, sua conta pode
          estar comprometida. Entre em contato respondendo este email imediatamente.
        </p>
      </div>
      <div style="text-align:center;margin-top:20px">
        <a href="${APP_URL}/login" style="${S.btn}">Entrar com a nova senha</a>
      </div>
      <p style="margin-top:20px;${S.p}${S.muted}">
        Por segurança, todos os outros dispositivos foram desconectados automaticamente.
      </p>
    `),
  }),

  alerta_denuncia: (_, d) => ({
    subject: `⚠️ Nova denúncia ${d.tipo ? `(${d.tipo})` : ''} — AGORA Admin`,
    html: layout(`
      <h2 style="${S.h2}${S.orange}">Nova denúncia recebida ⚠️</h2>
      <p style="${S.p}">Uma denúncia requer atenção no painel de moderação:</p>
      <div style="${S.info}">
        ${d.tipo    ? `<p style="margin:0 0 6px;color:#888;font-size:12px">TIPO</p>
                       <p style="margin:0 0 12px;color:#fff;font-weight:bold">${d.tipo}</p>` : ''}
        ${d.motivo  ? `<p style="margin:0 0 6px;color:#888;font-size:12px">MOTIVO</p>
                       <p style="margin:0 0 12px;color:#fff">${d.motivo}</p>` : ''}
        ${d.alvo_id ? `<p style="margin:0 0 6px;color:#888;font-size:12px">ALVO ID</p>
                       <p style="margin:0;${S.muted}">${d.alvo_id}</p>` : ''}
      </div>
      <div style="text-align:center">
        <a href="${APP_URL}/admin/moderacao" style="${S.btn}">Acessar moderação</a>
      </div>
    `),
  }),

  nova_mensagem: (nome, d) => ({
    subject: `💬 ${d.remetente_nome || 'Alguém'} enviou uma mensagem para você`,
    html: layout(`
      <h2 style="${S.h2}${S.orange}">Você tem uma nova mensagem 💬</h2>
      <p style="${S.p}">Olá, <strong>${nome}</strong>!
      <strong>${d.remetente_nome || 'Um usuário'}</strong> enviou uma mensagem:</p>
      <div style="${S.info}">
        <p style="margin:0 0 8px;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px">
          Prévia
        </p>
        <p style="margin:0;color:#CCCCCC;font-style:italic;line-height:1.7;font-size:15px;border-left:3px solid #6C3FC5;padding-left:12px">
          "${d.preview || 'Abra o app para ver a mensagem completa.'}"
        </p>
      </div>
      <div style="text-align:center">
        <a href="${APP_URL}/(tabs)/mensagens" style="${S.btn}">Responder agora</a>
      </div>
      <p style="margin-top:20px;${S.p}${S.muted}">
        Você está recebendo este email porque estava offline quando a mensagem chegou.<br>
        Para desativar: <em>Perfil → Configurações → Notificações por email</em>.
      </p>
    `),
  }),
};

// ─────────────────────────────────────────────────────────────────
// Envio via Resend
// ─────────────────────────────────────────────────────────────────

interface ResendPayload {
  from:    string;
  to:      string[];
  subject: string;
  html:    string;
  headers?: Record<string, string>;
}

async function enviarResend(payload: ResendPayload, idempotencyKey?: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY ausente — email não enviado (log apenas)');
    console.log('[email] Para:', payload.to, '| Assunto:', payload.subject);
    return;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization:  `Bearer ${RESEND_API_KEY}`,
  };

  // Idempotency key evita duplicatas em caso de retry
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Resend ${resp.status}: ${txt}`);
  }

  const result = await resp.json();
  console.log(`[email] Enviado via Resend — ID: ${result.id}`);
}

// ─────────────────────────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────────────────────────

export async function handler(req: Request): Promise<Response> {
  // Preflight CORS
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'POST')   return errorResponse('Method Not Allowed', 405);

  // ── Autenticação ──────────────────────────────────────────────
  const auth = await validarAuth(req);
  if (!auth.ok) return errorResponse(auth.erro, 401);

  // ── Parse do payload ──────────────────────────────────────────
  let payload: EmailPayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('JSON inválido', 400);
  }

  const { tipo, para, usuario_id, nome, dados = {}, idempotency_key } = payload;

  if (!tipo) return errorResponse('"tipo" é obrigatório', 400);

  // ── Resolve destinatário ──────────────────────────────────────
  let emailDestinatario = para ?? '';
  let nomeDestinatario  = nome ?? '';

  if (!emailDestinatario && usuario_id) {
    // Busca email via service role (auth.users)
    const emailEncontrado = await buscarEmailUsuario(usuario_id);
    if (!emailEncontrado) return errorResponse('Usuário não encontrado', 404);
    emailDestinatario = emailEncontrado;

    // Se nome também não veio, busca do profile
    if (!nomeDestinatario) {
      const { data: profile } = await getAdminClient()
        .from('profiles')
        .select('nome')
        .eq('id', usuario_id)
        .single();
      nomeDestinatario = profile?.nome ?? '';
    }
  }

  if (!emailDestinatario) return errorResponse('"para" ou "usuario_id" são obrigatórios', 400);

  // ── Permissões por tipo ───────────────────────────────────────
  // Tipos que só admin/sistema pode enviar
  const TIPOS_ADMIN = ['alerta_denuncia', 'evento_aprovado', 'evento_rejeitado'];
  if (TIPOS_ADMIN.includes(tipo) && auth.tipo === 'usuario' && !auth.isAdmin) {
    return errorResponse(`Tipo "${tipo}" requer permissão de administrador`, 403);
  }

  // ── Rate limit: 1 email do mesmo tipo para o mesmo destinatário a cada 2 min ──
  const rlKey = `${tipo}:${emailDestinatario}`;
  if (!rateLimitCheck(rlKey, 2)) {
    console.warn(`[email] Rate limit atingido — ${rlKey}`);
    return jsonResponse({ ok: true, aviso: 'Email recentemente enviado — ignorado por rate limit' });
  }

  // ── Gera HTML a partir do template ────────────────────────────
  const templateFn = TEMPLATES[tipo];
  if (!templateFn) return errorResponse(`Tipo "${tipo}" não suportado`, 400);

  let emailContent: TemplateResult;
  try {
    emailContent = templateFn(nomeDestinatario || 'usuário', dados);
  } catch (err) {
    return errorResponse(`Erro ao gerar template: ${String(err)}`, 500);
  }

  // ── Envia via Resend ──────────────────────────────────────────
  try {
    await enviarResend(
      {
        from:    FROM_EMAIL,
        to:      [emailDestinatario],
        subject: emailContent.subject,
        html:    emailContent.html,
      },
      idempotency_key ?? `${tipo}-${emailDestinatario}-${Date.now()}`,
    );

    return jsonResponse({
      ok:        true,
      tipo,
      para:      emailDestinatario,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[email] Falha ao enviar:', err);
    return errorResponse(`Falha ao enviar: ${String(err)}`, 502);
  }
}

if (!Deno.env.get('DENO_TESTING')) { serve(handler); }
