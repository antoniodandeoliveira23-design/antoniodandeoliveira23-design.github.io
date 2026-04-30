/**
 * app/nova-senha.tsx
 * Tela de definição de nova senha após clicar no link do email.
 *
 * Fluxo de chegada:
 *   Email (reset-password.html)
 *     → /auth/callback?type=recovery&access_token=...
 *     → auth/callback.tsx detecta type=recovery
 *     → router.replace('/nova-senha')
 *
 * Supabase mantém a sessão do tipo 'recovery' ativa até que
 * updateUser() seja chamado ou a sessão expire (1h).
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { validarSenha } from '@/services/seguranca';

type Estado = 'form' | 'sucesso';

export default function NovaSenha() {
  const router = useRouter();
  const { atualizarSenha } = useAuth();

  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [confirmacaoVisivel, setConfirmacaoVisivel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [estado, setEstado] = useState<Estado>('form');

  const forca = senha.length > 0 ? validarSenha(senha) : null;

  const corForca = () => {
    if (!forca) return CORES.border;
    if (!forca.valida) return CORES.erro;
    const score = senha.length >= 12 ? 3 : senha.length >= 10 ? 2 : 1;
    return score >= 3 ? '#22C55E' : score === 2 ? CORES.laranja : CORES.erro;
  };

  const labelForca = () => {
    if (!forca || senha.length === 0) return '';
    if (!forca.valida) return 'Fraca';
    if (senha.length >= 12) return 'Forte';
    if (senha.length >= 10) return 'Média';
    return 'Razoável';
  };

  const handleSalvar = async () => {
    setErro('');

    if (!senha) { setErro('Informe a nova senha.'); return; }
    if (senha !== confirmacao) { setErro('As senhas não coincidem.'); return; }

    const validacao = validarSenha(senha);
    if (!validacao.valida) {
      setErro(validacao.erros[0]);
      return;
    }

    setLoading(true);
    try {
      await atualizarSenha(senha);
      setEstado('sucesso');
    } catch (e: any) {
      const msg: string = e.message || '';
      if (msg.startsWith('SENHA_FRACA:')) {
        setErro(msg.split(':')[1].split('|')[0]);
      } else if (msg.includes('session') || msg.includes('expired')) {
        setErro('Sessão expirada. Solicite um novo link de recuperação.');
      } else {
        setErro('Erro ao atualizar senha. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Estado: senha atualizada com sucesso ───────────────────────────
  if (estado === 'sucesso') {
    return (
      <View style={styles.container}>
        <View style={styles.successBox}>
          <View style={[styles.iconCircle, { borderColor: 'rgba(34,197,94,0.3)', backgroundColor: 'rgba(34,197,94,0.08)' }]}>
            <Ionicons name="checkmark-circle-outline" size={44} color="#22C55E" />
          </View>

          <Text style={styles.titulo}>Senha atualizada!</Text>
          <Text style={styles.subtitulo}>
            Sua senha foi redefinida com sucesso. Um email de confirmação foi enviado para você.
          </Text>

          <View style={styles.alertBox}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#A7F3D0" />
            <Text style={styles.alertText}>
              Se não foi você quem fez esta alteração, entre em contato com o suporte imediatamente.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.replace('/login')}
          >
            <Text style={styles.ctaBtnText}>Entrar com a nova senha</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Estado: form ──────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="key-outline" size={40} color={CORES.roxo} />
        </View>

        <Text style={styles.titulo}>Nova senha</Text>
        <Text style={styles.subtitulo}>
          Crie uma senha forte com pelo menos 8 caracteres, letras maiúsculas, minúsculas e números.
        </Text>

        {/* Campo nova senha */}
        <Text style={styles.label}>Nova senha</Text>
        <View style={[styles.inputWrapper, erro && !confirmacao ? styles.inputErro : null]}>
          <Ionicons name="lock-closed-outline" size={18} color={CORES.cinza} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Nova senha"
            placeholderTextColor={CORES.cinza}
            value={senha}
            onChangeText={t => { setSenha(t); setErro(''); }}
            secureTextEntry={!senhaVisivel}
            autoComplete="new-password"
          />
          <TouchableOpacity onPress={() => setSenhaVisivel(v => !v)}>
            <Ionicons
              name={senhaVisivel ? 'eye-outline' : 'eye-off-outline'}
              size={18}
              color={CORES.cinza}
            />
          </TouchableOpacity>
        </View>

        {/* Indicador de força */}
        {senha.length > 0 && (
          <View style={styles.forcaRow}>
            <View style={styles.forcaBarra}>
              <View style={[
                styles.forcaPreenchido,
                {
                  width: `${forca?.valida ? (senha.length >= 12 ? 100 : senha.length >= 10 ? 66 : 33) : 20}%`,
                  backgroundColor: corForca(),
                },
              ]} />
            </View>
            <Text style={[styles.forcaLabel, { color: corForca() }]}>{labelForca()}</Text>
          </View>
        )}

        {/* Campo confirmação */}
        <Text style={styles.label}>Confirmar nova senha</Text>
        <View style={[
          styles.inputWrapper,
          confirmacao && senha !== confirmacao ? styles.inputErro : null,
          confirmacao && senha === confirmacao ? styles.inputSucesso : null,
        ]}>
          <Ionicons name="lock-closed-outline" size={18} color={CORES.cinza} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Confirmar senha"
            placeholderTextColor={CORES.cinza}
            value={confirmacao}
            onChangeText={t => { setConfirmacao(t); setErro(''); }}
            secureTextEntry={!confirmacaoVisivel}
            autoComplete="new-password"
          />
          <TouchableOpacity onPress={() => setConfirmacaoVisivel(v => !v)}>
            <Ionicons
              name={confirmacaoVisivel ? 'eye-outline' : 'eye-off-outline'}
              size={18}
              color={CORES.cinza}
            />
          </TouchableOpacity>
        </View>
        {confirmacao && senha !== confirmacao && (
          <Text style={styles.matchErro}>As senhas não coincidem</Text>
        )}

        {/* Erro geral */}
        {erro ? (
          <View style={styles.erroBox}>
            <Ionicons name="warning-outline" size={14} color={CORES.erro} />
            <Text style={styles.erroText}>{erro}</Text>
          </View>
        ) : null}

        {/* Requisitos */}
        <View style={styles.requisitosBox}>
          {[
            { ok: senha.length >= 8,                  label: 'Pelo menos 8 caracteres' },
            { ok: /[A-Z]/.test(senha),                label: 'Uma letra maiúscula'      },
            { ok: /[a-z]/.test(senha),                label: 'Uma letra minúscula'      },
            { ok: /[0-9]/.test(senha),                label: 'Um número'               },
          ].map(({ ok, label }) => (
            <View key={label} style={styles.requisitoRow}>
              <Ionicons
                name={ok ? 'checkmark-circle' : 'ellipse-outline'}
                size={14}
                color={ok ? '#22C55E' : CORES.cinza}
              />
              <Text style={[styles.requisitoText, ok && styles.requisitoOk]}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Botão salvar */}
        <TouchableOpacity
          style={[styles.ctaBtn, (loading || !forca?.valida) && styles.ctaBtnDisabled]}
          onPress={handleSalvar}
          disabled={loading || !forca?.valida}
        >
          {loading ? (
            <ActivityIndicator color={CORES.branco} size="small" />
          ) : (
            <Text style={styles.ctaBtnText}>Salvar nova senha</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => router.replace('/recuperar-senha' as any)}
        >
          <Text style={styles.linkText}>Solicitar novo link de recuperação</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CORES.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: 80,
    paddingBottom: 40,
  },
  successBox: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: 100,
    paddingBottom: 40,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(108, 63, 197, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(108, 63, 197, 0.25)',
  },
  titulo: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: CORES.branco,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitulo: {
    fontSize: FONT_SIZE.sm,
    color: CORES.cinzaClaro,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
    maxWidth: 340,
  },
  label: {
    color: CORES.branco,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    alignSelf: 'flex-start',
    width: '100%',
    maxWidth: 400,
    marginBottom: SPACING.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CORES.backgroundInput,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    width: '100%',
    maxWidth: 400,
    height: 52,
    marginBottom: SPACING.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputErro: { borderColor: CORES.erro },
  inputSucesso: { borderColor: '#22C55E' },
  inputIcon: { marginRight: SPACING.sm },
  input: {
    flex: 1,
    color: CORES.branco,
    fontSize: FONT_SIZE.sm,
  },
  matchErro: {
    color: CORES.erro,
    fontSize: FONT_SIZE.xs,
    alignSelf: 'flex-start',
    maxWidth: 400,
    width: '100%',
    marginTop: -SPACING.xs,
    marginBottom: SPACING.xs,
  },
  forcaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    width: '100%',
    maxWidth: 400,
    marginTop: -SPACING.xs,
    marginBottom: SPACING.md,
  },
  forcaBarra: {
    flex: 1,
    height: 4,
    backgroundColor: CORES.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  forcaPreenchido: {
    height: 4,
    borderRadius: 2,
  },
  forcaLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    minWidth: 50,
    textAlign: 'right',
  },
  erroBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    maxWidth: 400,
    width: '100%',
    marginBottom: SPACING.sm,
  },
  erroText: {
    color: CORES.erro,
    fontSize: FONT_SIZE.xs,
    flex: 1,
  },
  requisitosBox: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: CORES.backgroundCard,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    gap: SPACING.xs,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: CORES.border,
  },
  requisitoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  requisitoText: {
    fontSize: FONT_SIZE.xs,
    color: CORES.cinza,
  },
  requisitoOk: {
    color: '#22C55E',
  },
  ctaBtn: {
    width: '100%',
    maxWidth: 400,
    paddingVertical: 15,
    backgroundColor: CORES.roxo,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  ctaBtnDisabled: { opacity: 0.5 },
  ctaBtnText: {
    color: CORES.branco,
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
  },
  alertBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: 'rgba(34,197,94,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    marginBottom: SPACING.xl,
    maxWidth: 360,
    width: '100%',
  },
  alertText: {
    color: '#A7F3D0',
    fontSize: FONT_SIZE.xs,
    lineHeight: 18,
    flex: 1,
  },
  linkBtn: {
    paddingVertical: SPACING.sm,
  },
  linkText: {
    color: CORES.cinzaClaro,
    fontSize: FONT_SIZE.xs,
    textAlign: 'center',
  },
});
