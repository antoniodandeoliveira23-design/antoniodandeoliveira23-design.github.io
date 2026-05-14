/**
 * components/Admin2FAChallenge.tsx
 * Desafio de 2FA obrigatório para acesso ao painel admin.
 *
 * Renderizado no lugar do conteúdo real quando doisFA.estaVerificado() === false.
 * Chama onVerificado() ao confirmar o código correto.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { doisFA } from '@/services/doisFA';

interface Props {
  /** Chamado após verificação bem-sucedida — aciona re-render da tela pai */
  onVerificado: () => void;
}

export default function Admin2FAChallenge({ onVerificado }: Props) {
  const { user } = useAuth();
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [erro, setErro] = useState('');
  const [codigoVisivel, setCodigoVisivel] = useState<string | null>(null);
  const isDemo = doisFA.modoDemo();

  const handleEnviarCodigo = async () => {
    if (!user?.id) return;
    setEnviando(true);
    setErro('');
    try {
      await doisFA.gerarCodigo(user.id);
      setCodigoEnviado(true);
      // Exibe o código na tela enquanto envio por e-mail não está implementado
      setCodigoVisivel(doisFA.obterCodigoAtual());
    } catch (e: any) {
      setErro('Erro ao gerar código. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  const handleVerificar = async () => {
    if (!codigo.trim()) {
      setErro('Digite o código de 6 dígitos.');
      return;
    }
    setVerificando(true);
    setErro('');
    try {
      const resultado = await doisFA.verificarCodigo(codigo.trim());
      if (resultado.valido) {
        onVerificado();
      } else {
        setErro(resultado.erro ?? 'Código inválido.');
        setCodigo('');
      }
    } finally {
      setVerificando(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Ícone */}
      <View style={styles.iconBox}>
        <Ionicons name="shield-checkmark" size={48} color={CORES.roxo} />
      </View>

      <Text style={styles.titulo}>Verificação em duas etapas</Text>
      <Text style={styles.subtitulo}>
        Para acessar o painel administrativo, confirme sua identidade com um código de segurança.
      </Text>

      {/* Hint para modo demo */}
      {isDemo && (
        <View style={styles.demoBox}>
          <Ionicons name="information-circle-outline" size={16} color={CORES.laranja} />
          <Text style={styles.demoText}>
            Modo demo ativo — use o código: <Text style={styles.demoCode}>111111</Text>
          </Text>
        </View>
      )}

      {/* Código visível em produção enquanto envio de e-mail não está ativo */}
      {!isDemo && codigoVisivel && (
        <View style={styles.demoBox}>
          <Ionicons name="key-outline" size={16} color={CORES.roxoClaro} />
          <Text style={styles.demoText}>
            Seu código de acesso: <Text style={styles.demoCode}>{codigoVisivel}</Text>
          </Text>
        </View>
      )}

      {/* Passo 1: Enviar código */}
      {!codigoEnviado ? (
        <>
          <Text style={styles.instrucao}>
            {isDemo
              ? 'Clique em "Enviar código" para ativar o desafio demo.'
              : `Enviaremos um código de 6 dígitos para o e-mail associado à conta ${user?.email ?? 'admin'}.`}
          </Text>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimario, enviando && styles.btnDisabled]}
            onPress={handleEnviarCodigo}
            disabled={enviando}
          >
            {enviando ? (
              <ActivityIndicator size="small" color={CORES.branco} />
            ) : (
              <>
                <Ionicons name="send" size={18} color={CORES.branco} />
                <Text style={styles.btnText}>Enviar código</Text>
              </>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          {/* Passo 2: Inserir e verificar */}
          <Text style={styles.instrucao}>
            {isDemo
              ? 'Código enviado (demo). Digite "111111" abaixo.'
              : 'Código enviado. Verifique seu e-mail e insira o código abaixo.'}
          </Text>

          {/* Input de 6 dígitos */}
          <View style={[styles.codigoWrapper, erro ? styles.codigoWrapperErro : null]}>
            <Ionicons name="keypad-outline" size={20} color={CORES.cinza} />
            <TextInput
              style={styles.codigoInput}
              placeholder="000000"
              placeholderTextColor={CORES.cinza}
              value={codigo}
              onChangeText={(t) => {
                setCodigo(t.replace(/\D/g, '').substring(0, 6));
                setErro('');
              }}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            {codigo.length === 6 && (
              <Ionicons name="checkmark-circle" size={20} color={CORES.sucesso} />
            )}
          </View>

          {erro ? (
            <View style={styles.erroRow}>
              <Ionicons name="alert-circle-outline" size={14} color={CORES.erro} />
              <Text style={styles.erroText}>{erro}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[
              styles.btn,
              styles.btnPrimario,
              (verificando || codigo.length !== 6) && styles.btnDisabled,
            ]}
            onPress={handleVerificar}
            disabled={verificando || codigo.length !== 6}
          >
            {verificando ? (
              <ActivityIndicator size="small" color={CORES.branco} />
            ) : (
              <>
                <Ionicons name="lock-open-outline" size={18} color={CORES.branco} />
                <Text style={styles.btnText}>Verificar acesso</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Reenviar */}
          <TouchableOpacity
            style={styles.reenviarBtn}
            onPress={() => {
              setCodigoEnviado(false);
              setCodigo('');
              setErro('');
            }}
          >
            <Text style={styles.reenviarText}>Reenviar código</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Validade */}
      <View style={styles.footerInfo}>
        <Ionicons name="time-outline" size={13} color={CORES.cinza} />
        <Text style={styles.footerText}>O código expira em 10 minutos</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CORES.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: CORES.roxo + '22',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  titulo: {
    color: CORES.branco,
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitulo: {
    color: CORES.cinzaClaro,
    fontSize: FONT_SIZE.sm,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
    marginBottom: SPACING.lg,
  },
  demoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: CORES.laranja + '1A',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CORES.laranja + '44',
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    width: '100%',
    maxWidth: 360,
  },
  demoText: {
    color: CORES.cinzaClaro,
    fontSize: FONT_SIZE.sm,
    flex: 1,
  },
  demoCode: {
    color: CORES.laranja,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  instrucao: {
    color: CORES.cinzaClaro,
    fontSize: FONT_SIZE.sm,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
    marginBottom: SPACING.lg,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    width: '100%',
    maxWidth: 360,
    paddingVertical: 14,
    borderRadius: RADIUS.sm,
  },
  btnPrimario: { backgroundColor: CORES.roxo },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },

  codigoWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CORES.backgroundInput,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    height: 56,
    width: '100%',
    maxWidth: 360,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  codigoWrapperErro: { borderColor: CORES.erro },
  codigoInput: {
    flex: 1,
    color: CORES.branco,
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    letterSpacing: 8,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  erroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.sm,
    alignSelf: 'flex-start',
    maxWidth: 360,
    width: '100%',
  },
  erroText: { color: CORES.erro, fontSize: FONT_SIZE.xs },
  reenviarBtn: { marginTop: SPACING.md, padding: SPACING.sm },
  reenviarText: { color: CORES.roxoClaro, fontSize: FONT_SIZE.sm, fontWeight: '600' },
  footerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: SPACING.xl,
  },
  footerText: { color: CORES.cinza, fontSize: FONT_SIZE.xs },
});
