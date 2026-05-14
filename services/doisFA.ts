/**
 * services/doisFA.ts
 * Autenticação de dois fatores (2FA) para contas admin.
 *
 * Fluxo:
 *   1. Admin entra com e-mail/senha → login normal
 *   2. Qualquer acesso a rota /admin/* exige 2FA verificado na sessão
 *   3. gerarCodigo() gera OTP 6 dígitos e "envia" (email/console em demo)
 *   4. verificarCodigo() valida + marca sessão como verificada
 *   5. resetar() é chamado no logout
 *
 * Em demo mode (supabaseConfigured = false):
 *   - Código fixo: "111111" — exibido em hint na tela
 *   - Não chama nenhuma API externa
 *
 * Em modo real (supabaseConfigured = true):
 *   - Código aleatório de 6 dígitos
 *   - Armazenado em memória + tabela admin_2fa_tokens (silencioso se não existir)
 *   - TODO: integrar envio por email/SMS via Supabase Edge Function
 */

import { supabase, supabaseConfigured } from './supabase';
import { registrarAcao } from './auditoria';

// ─────────────────────────────────────────────────────────
// Estado de sessão (memória — reset no logout)
// ─────────────────────────────────────────────────────────
let _verificado = false;
let _codigoAtual: string | null = null;
let _expiraEm: number | null = null;
let _adminId: string | null = null;

const VALIDADE_MS = 10 * 60_000;   // 10 minutos
const DEMO_CODIGO = '111111';

// ─────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────
export const doisFA = {

  /** Retorna true se 2FA foi verificado nesta sessão */
  estaVerificado(): boolean {
    return _verificado;
  },

  /**
   * Gera e "envia" o código 2FA.
   * Demo: código fixo "111111" (exibido em hint na tela).
   * Real: código aleatório + inserção na tabela admin_2fa_tokens.
   */
  async gerarCodigo(adminId: string): Promise<void> {
    _adminId = adminId;

    if (!supabaseConfigured) {
      // Demo: código fixo, sempre válido
      _codigoAtual = DEMO_CODIGO;
      _expiraEm = Date.now() + VALIDADE_MS;
      console.log(`[demo] Código 2FA admin: ${DEMO_CODIGO}`);
      return;
    }

    // Produção: gera código aleatório de 6 dígitos
    const codigo = String(Math.floor(100_000 + Math.random() * 900_000));
    _codigoAtual = codigo;
    _expiraEm = Date.now() + VALIDADE_MS;

    try {
      // Persiste token (silencioso se tabela não existir)
      await supabase.from('admin_2fa_tokens').upsert({
        user_id: adminId,
        codigo,
        expira_em: new Date(_expiraEm).toISOString(),
        usado: false,
      });

      // TODO: chamar Edge Function para enviar por email
      // await supabase.functions.invoke('send-2fa-email', { body: { adminId, codigo } });
    } catch {
      // Falha silenciosa — código ainda válido em memória
    }

    await registrarAcao({
      acao: '2fa_codigo_gerado',
      categoria: 'auth',
      severidade: 'info',
      detalhes: { admin_id: adminId },
      resultado: 'sucesso',
    });
  },

  /**
   * Verifica o código informado pelo usuário.
   * Valida expiração + correspondência.
   */
  async verificarCodigo(
    codigo: string,
  ): Promise<{ valido: boolean; erro?: string }> {
    const codigoLimpo = codigo.trim().replace(/\s/g, '');

    if (!_codigoAtual || !_expiraEm) {
      return {
        valido: false,
        erro: 'Código não solicitado. Clique em "Enviar código" primeiro.',
      };
    }

    if (Date.now() > _expiraEm) {
      _codigoAtual = null;
      _expiraEm = null;
      await registrarAcao({
        acao: '2fa_codigo_expirado',
        categoria: 'auth',
        severidade: 'aviso',
        detalhes: { admin_id: _adminId },
        resultado: 'falha',
      });
      return { valido: false, erro: 'Código expirado. Solicite um novo.' };
    }

    if (codigoLimpo !== _codigoAtual) {
      await registrarAcao({
        acao: '2fa_codigo_incorreto',
        categoria: 'auth',
        severidade: 'aviso',
        detalhes: { admin_id: _adminId },
        resultado: 'falha',
      });
      return { valido: false, erro: 'Código incorreto.' };
    }

    // Sucesso
    _verificado = true;
    _codigoAtual = null;
    _expiraEm = null;

    // Marca como usado no banco (silencioso se falhar)
    if (supabaseConfigured && _adminId) {
      try {
        await supabase
          .from('admin_2fa_tokens')
          .update({ usado: true })
          .eq('user_id', _adminId);
      } catch { /* silencioso */ }
    }

    await registrarAcao({
      acao: '2fa_verificado',
      categoria: 'auth',
      severidade: 'info',
      detalhes: { admin_id: _adminId },
      resultado: 'sucesso',
    });

    return { valido: true };
  },

  /**
   * Reseta todo o estado 2FA da sessão.
   * Deve ser chamado no logout.
   */
  resetar(): void {
    _verificado = false;
    _codigoAtual = null;
    _expiraEm = null;
    _adminId = null;
  },

  /** Retorna true se estamos em modo demo (para exibir hint do código) */
  modoDemo(): boolean {
    return !supabaseConfigured;
  },

  /**
   * Retorna o código 2FA gerado nesta sessão para exibição na tela.
   * Usado enquanto o envio por e-mail/SMS não está implementado.
   * Retorna null se nenhum código foi gerado ou se já expirou.
   */
  obterCodigoAtual(): string | null {
    if (!_codigoAtual || !_expiraEm) return null;
    if (Date.now() > _expiraEm) return null;
    return _codigoAtual;
  },
};
