import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import SocialLoginButtons from '@/components/SocialLoginButtons';
import { useSEO } from '@/hooks/useSEO';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FONT_SIZE, RADIUS, SPACING, type Cores } from '@/constants/theme';
import { useCores } from '@/contexts/TemaContext';
import { useAuth } from '@/contexts/AuthContext';
import { validarSenha, validarCNPJ, formatarCNPJ } from '@/services/seguranca';
import type { TipoConta, Genero } from '@/types';

type Passo = 1 | 2 | 3;

export default function Register() {
  const cores = useCores();
  const styles = createStyles(cores);
  const router = useRouter();
  const { register, loginSocial, loading } = useAuth();

  useSEO({
    titulo:   'Criar conta',
    descricao: 'Crie sua conta gratuita no AGORA e comece a descobrir eventos, shows e promoções em Vilhena – RO.',
  });
  const [passo, setPasso] = useState<Passo>(1);
  const [erro, setErro] = useState('');
  const [confirmacaoPendente, setConfirmacaoPendente] = useState(false);

  // Passo 1: Social ou email
  const [nome, setNome] = useState('');
  const [sobrenome, setSobrenome] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [senhaVisivel, setSenhaVisivel] = useState(false);

  // Passo 2: Tipo de conta
  const [tipoConta, setTipoConta] = useState<TipoConta>('pf');

  // Passo 3 PJ: CNPJ
  const [cnpj, setCnpj] = useState('');

  // Passo 3 PF: Gênero (R9 - para filtrar eventos exclusivos mulheres)
  const [genero, setGenero] = useState<Genero | ''>('');

  const forcaSenha = senha.length > 0 ? validarSenha(senha) : null;

  const validarPasso1 = () => {
    if (!nome.trim()) return 'Preencha o primeiro nome.';
    if (!sobrenome.trim()) return 'Preencha o sobrenome.';
    if (!username.trim()) return 'Preencha o nome de usuário.';
    if (!email.trim() || !email.includes('@')) return 'Informe um e-mail válido.';
    if (!forcaSenha || !forcaSenha.valida) {
      const erros = forcaSenha?.erros || ['A senha deve ter pelo menos 8 caracteres.'];
      return erros[0];
    }
    return '';
  };

  const avancar = () => {
    setErro('');
    if (passo === 1) {
      const err = validarPasso1();
      if (err) { setErro(err); return; }
      setPasso(2);
    } else if (passo === 2) {
      setPasso(3);
    }
  };

  const voltar = () => {
    setErro('');
    if (passo === 2) setPasso(1);
    else if (passo === 3) setPasso(2);
    else router.back();
  };

  const handleRegister = async () => {
    setErro('');

    // Validação completa de CNPJ para PJ (formato + dígitos verificadores)
    if (tipoConta === 'pj') {
      if (!cnpj.trim()) {
        setErro('Informe o CNPJ da empresa.');
        return;
      }
      const validacaoCnpj = validarCNPJ(cnpj);
      if (!validacaoCnpj.valido) {
        setErro(validacaoCnpj.erro ?? 'CNPJ inválido.');
        return;
      }
    }

    try {
      await register({
        nome: nome.trim(),
        sobrenome: sobrenome.trim(),
        username: username.trim().toLowerCase(),
        email: email.trim(),
        senha,
        tipo_conta: tipoConta,
        cnpj: tipoConta === 'pj' ? cnpj.trim() : undefined,
        genero: genero || undefined,
      });
      // Navegação delegada ao AuthGuard — ele detecta signed=true e redireciona
    } catch (e: any) {
      const msg: string = e.message || '';
      if (msg === 'EMAIL_CONFIRMACAO_NECESSARIA') {
        // Conta criada, mas Supabase exige confirmação antes de liberar sessão
        setConfirmacaoPendente(true);
        return;
      } else if (msg.startsWith('SENHA_FRACA:')) {
        const erros = msg.replace('SENHA_FRACA:', '').split('|');
        setErro('Senha fraca: ' + erros[0]);
      } else if (msg.startsWith('RATE_LIMIT:')) {
        const s = msg.replace('RATE_LIMIT:', '');
        setErro(`Muitas tentativas. Aguarde ${s} segundos.`);
      } else if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already been registered')) {
        setErro('Este e-mail já está cadastrado. Faça login.');
      } else {
        setErro(msg || 'Erro ao criar conta. Tente novamente.');
      }
    }
  };

  const handleSocial = async (provider: 'google' | 'apple' | 'x') => {
    setErro('');
    try {
      await loginSocial(provider);
    } catch (e: any) {
      const msg: string = e.message || '';
      if (msg === 'LOGIN_CANCELADO') return;
      if (msg.includes('provider') || msg.includes('not enabled') || msg.includes('disabled')) {
        setErro('Este método ainda não está ativo. Use e-mail e senha.');
        return;
      }
      setErro(msg || 'Erro ao registrar com login social.');
    }
  };

  // ==================== PASSO 1: Dados básicos ====================
  const renderPasso1 = () => (
    <>
      <Text style={styles.socialLabel}>Registrar com:</Text>
      <SocialLoginButtons onPress={handleSocial} disabled={loading} variant="full" />

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>Ou cadastre com e-mail</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.rowFields}>
        <View style={styles.halfField}>
          <Text style={styles.label}>Primeiro nome</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={18} color={cores.cinza} style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="Primeiro nome" placeholderTextColor={cores.cinza} value={nome} onChangeText={setNome} />
          </View>
        </View>
        <View style={styles.halfField}>
          <Text style={styles.label}>Sobrenome</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={18} color={cores.cinza} style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="Sobrenome" placeholderTextColor={cores.cinza} value={sobrenome} onChangeText={setSobrenome} />
          </View>
        </View>
      </View>

      <Text style={styles.label}>Nome de usuário</Text>
      <View style={styles.inputWrapper}>
        <Ionicons name="at-outline" size={18} color={cores.cinza} style={styles.inputIcon} />
        <TextInput style={styles.input} placeholder="Nome de usuário" placeholderTextColor={cores.cinza} value={username} onChangeText={setUsername} autoCapitalize="none" />
      </View>

      <Text style={styles.label}>E-mail</Text>
      <View style={styles.inputWrapper}>
        <Ionicons name="mail-outline" size={18} color={cores.cinza} style={styles.inputIcon} />
        <TextInput style={styles.input} placeholder="E-mail" placeholderTextColor={cores.cinza} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      </View>

      <Text style={styles.label}>Senha</Text>
      <View style={styles.inputWrapper}>
        <Ionicons name="lock-closed-outline" size={18} color={cores.cinza} style={styles.inputIcon} />
        <TextInput style={styles.input} placeholder="Senha" placeholderTextColor={cores.cinza} value={senha} onChangeText={setSenha} secureTextEntry={!senhaVisivel} />
        <TouchableOpacity onPress={() => setSenhaVisivel(!senhaVisivel)}>
          <Ionicons name={senhaVisivel ? 'eye-outline' : 'eye-off-outline'} size={18} color={cores.cinza} />
        </TouchableOpacity>
      </View>

      {/* Indicador de força da senha */}
      {forcaSenha && (
        <View style={styles.forcaContainer}>
          <View style={styles.forcaBarras}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[
                  styles.forcaBarra,
                  i < forcaSenha.pontuacao && {
                    backgroundColor:
                      forcaSenha.pontuacao <= 1 ? cores.erro
                      : forcaSenha.pontuacao === 2 ? '#F59E0B'
                      : forcaSenha.pontuacao === 3 ? '#3B82F6'
                      : cores.sucesso,
                  },
                ]}
              />
            ))}
          </View>
          <Text style={[styles.forcaLabel, {
            color: forcaSenha.pontuacao <= 1 ? cores.erro
              : forcaSenha.pontuacao === 2 ? '#F59E0B'
              : forcaSenha.pontuacao === 3 ? '#3B82F6'
              : cores.sucesso,
          }]}>
            {forcaSenha.forca === 'fraca' ? 'Fraca'
              : forcaSenha.forca === 'media' ? 'Média'
              : forcaSenha.forca === 'forte' ? 'Forte'
              : 'Muito forte'}
          </Text>
        </View>
      )}
      <Text style={styles.hint}>Use 8+ chars com maiúscula, número e símbolo (!@#...).</Text>
    </>
  );

  // ==================== PASSO 2: Tipo de conta ====================
  const renderPasso2 = () => (
    <>
      <Text style={styles.passoTitulo}>Qual é o seu perfil?</Text>
      <Text style={styles.passoSubtitulo}>Isso define como você usa o AGORA.</Text>

      <TouchableOpacity
        style={[styles.cardOpcao, tipoConta === 'pf' && styles.cardOpcaoAtivo]}
        onPress={() => setTipoConta('pf')}
      >
        <Ionicons name="person" size={28} color={tipoConta === 'pf' ? cores.laranja : cores.roxo} />
        <View style={styles.cardOpcaoInfo}>
          <Text style={styles.cardOpcaoTitulo}>Pessoa Física</Text>
          <Text style={styles.cardOpcaoDesc}>Explore eventos, salve favoritos e crie convites simples.</Text>
        </View>
        {tipoConta === 'pf' && <Ionicons name="checkmark-circle" size={24} color={cores.laranja} />}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.cardOpcao, tipoConta === 'pj' && styles.cardOpcaoAtivo]}
        onPress={() => setTipoConta('pj')}
      >
        <MaterialCommunityIcons name="office-building" size={28} color={tipoConta === 'pj' ? cores.laranja : cores.roxo} />
        <View style={styles.cardOpcaoInfo}>
          <Text style={styles.cardOpcaoTitulo}>Empresa</Text>
          <Text style={styles.cardOpcaoDesc}>Divulgue eventos, promoções e anúncios comerciais.</Text>
        </View>
        {tipoConta === 'pj' && <Ionicons name="checkmark-circle" size={24} color={cores.laranja} />}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.cardOpcao, tipoConta === 'gov' && styles.cardOpcaoAtivo]}
        onPress={() => setTipoConta('gov')}
      >
        <Ionicons name="shield-checkmark" size={28} color={tipoConta === 'gov' ? cores.laranja : cores.roxo} />
        <View style={styles.cardOpcaoInfo}>
          <Text style={styles.cardOpcaoTitulo}>Órgão Público</Text>
          <Text style={styles.cardOpcaoDesc}>Publique ações institucionais e campanhas públicas.</Text>
        </View>
        {tipoConta === 'gov' && <Ionicons name="checkmark-circle" size={24} color={cores.laranja} />}
      </TouchableOpacity>
    </>
  );

  // ==================== PASSO 3: Dados específicos ====================
  const renderPasso3 = () => (
    <>
      {tipoConta === 'pj' ? (
        <>
          <Text style={styles.passoTitulo}>Dados da Empresa</Text>
          <Text style={styles.label}>CNPJ</Text>
          <View style={[styles.inputWrapper, cnpj && !validarCNPJ(cnpj).valido && cnpj.replace(/\D/g,'').length === 14 && { borderWidth: 1, borderColor: cores.erro }]}>
            <MaterialCommunityIcons name="file-document-outline" size={18} color={cores.cinza} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="00.000.000/0000-00"
              placeholderTextColor={cores.cinza}
              value={cnpj}
              onChangeText={(t) => setCnpj(formatarCNPJ(t))}
              keyboardType="number-pad"
              maxLength={18}
            />
            {cnpj.replace(/\D/g,'').length === 14 && (
              <Ionicons
                name={validarCNPJ(cnpj).valido ? 'checkmark-circle' : 'close-circle'}
                size={18}
                color={validarCNPJ(cnpj).valido ? cores.sucesso : cores.erro}
              />
            )}
          </View>
          {cnpj.replace(/\D/g,'').length === 14 && !validarCNPJ(cnpj).valido && (
            <Text style={[styles.hint, { color: cores.erro }]}>{validarCNPJ(cnpj).erro}</Text>
          )}
          <Text style={styles.hint}>Necessário para publicar eventos comerciais (R5).</Text>
        </>
      ) : tipoConta === 'gov' ? (
        <>
          <Text style={styles.passoTitulo}>Conta Institucional</Text>
          <Text style={styles.infoText}>
            Após o cadastro, sua conta passará por verificação antes de ser ativada.
            Você receberá um e-mail quando a conta for aprovada.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.passoTitulo}>Mais sobre você</Text>
          <Text style={styles.passoSubtitulo}>Usado para personalizar sua experiência (ex: eventos exclusivos).</Text>

          <Text style={styles.label}>Gênero (opcional)</Text>
          {(['feminino', 'masculino', 'outro', 'prefiro_nao_dizer'] as Genero[]).map((g) => (
            <TouchableOpacity
              key={g}
              style={[styles.generoOpcao, genero === g && styles.generoOpcaoAtivo]}
              onPress={() => setGenero(g)}
            >
              <Text style={styles.generoTexto}>
                {g === 'feminino' ? 'Feminino' : g === 'masculino' ? 'Masculino' : g === 'outro' ? 'Outro' : 'Prefiro não dizer'}
              </Text>
              {genero === g && <Ionicons name="checkmark" size={18} color={cores.laranja} />}
            </TouchableOpacity>
          ))}
        </>
      )}
    </>
  );

  // ==================== RENDER ====================

  if (confirmacaoPendente) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.scroll, { justifyContent: 'center' }]} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', width: '100%', maxWidth: 400 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: cores.roxo, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xl }}>
              <Ionicons name="mail" size={36} color={cores.branco} />
            </View>
            <Text style={{ fontSize: FONT_SIZE.xl, fontWeight: 'bold', color: cores.branco, textAlign: 'center', marginBottom: SPACING.md }}>
              Confirme seu e-mail
            </Text>
            <Text style={{ fontSize: FONT_SIZE.sm, color: cores.cinzaClaro, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.xs }}>
              Enviamos um link de ativação para:
            </Text>
            <Text style={{ fontSize: FONT_SIZE.md, color: cores.branco, fontWeight: 'bold', textAlign: 'center', marginBottom: SPACING.lg }}>
              {email.trim()}
            </Text>
            <Text style={{ fontSize: FONT_SIZE.xs, color: cores.cinzaClaro, textAlign: 'center', lineHeight: 20, marginBottom: SPACING.xl }}>
              Clique no link do e-mail para ativar sua conta. Verifique também a pasta de spam.
            </Text>
            <TouchableOpacity style={styles.ctaBtn} onPress={() => router.replace('/login')}>
              <Text style={styles.ctaBtnText}>Ir para o login</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header com voltar + indicador de passo */}
        <View style={styles.header}>
          <TouchableOpacity onPress={voltar}>
            <Ionicons name="arrow-back" size={24} color={cores.branco} />
          </TouchableOpacity>
          <View style={styles.stepRow}>
            {[1, 2, 3].map((s) => (
              <View key={s} style={[styles.dot, s === passo ? styles.dotActive : s < passo ? styles.dotDone : styles.dotInactive]} />
            ))}
          </View>
          <Text style={styles.stepLabel}>Passo {passo}/3</Text>
        </View>

        {passo === 1 && renderPasso1()}
        {passo === 2 && renderPasso2()}
        {passo === 3 && renderPasso3()}

        {erro ? <Text style={styles.erroText}>{erro}</Text> : null}

        <TouchableOpacity
          style={[styles.ctaBtn, loading && styles.ctaBtnDisabled]}
          onPress={passo < 3 ? avancar : handleRegister}
          disabled={loading}
        >
          <Text style={styles.ctaBtnText}>
            {passo < 3 ? 'Próximo' : loading ? 'Criando conta...' : 'Registrar'}
          </Text>
        </TouchableOpacity>

        {passo === 1 && (
          <>
            <Text style={styles.terms}>
              Ao criar uma conta você concorda com os nossos{' '}
              <Text style={styles.termsLink}>Termos de Serviços.</Text>
            </Text>
            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Já possui uma conta? </Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={styles.footerLink}>Logar</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(cores: Cores) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: cores.background },
    scroll: { flexGrow: 1, alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: 50, paddingBottom: 40 },
    header: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 400, marginBottom: SPACING.xl, gap: SPACING.md },
    stepRow: { flexDirection: 'row', gap: 6, flex: 1 },
    stepLabel: { color: cores.cinzaClaro, fontSize: FONT_SIZE.xs },
    dot: { height: 4, borderRadius: 2 },
    dotActive: { width: 32, backgroundColor: cores.laranja },
    dotDone: { width: 32, backgroundColor: cores.roxo },
    dotInactive: { width: 32, backgroundColor: cores.border },

    // Passo 2 - cards
    passoTitulo: { fontSize: FONT_SIZE.xl, fontWeight: 'bold', color: cores.branco, alignSelf: 'flex-start', maxWidth: 400, marginBottom: SPACING.sm },
    passoSubtitulo: { fontSize: FONT_SIZE.sm, color: cores.cinzaClaro, alignSelf: 'flex-start', maxWidth: 400, marginBottom: SPACING.lg },
    cardOpcao: { flexDirection: 'row', alignItems: 'center', backgroundColor: cores.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, width: '100%', maxWidth: 400, marginBottom: SPACING.md, gap: SPACING.md, borderWidth: 2, borderColor: 'transparent' },
    cardOpcaoAtivo: { borderColor: cores.laranja },
    cardOpcaoInfo: { flex: 1 },
    cardOpcaoTitulo: { color: cores.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },
    cardOpcaoDesc: { color: cores.cinzaClaro, fontSize: FONT_SIZE.xs, marginTop: 4 },

    // Passo 3 - gênero
    generoOpcao: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: cores.backgroundCard, borderRadius: RADIUS.sm, padding: SPACING.md, width: '100%', maxWidth: 400, marginBottom: SPACING.sm, borderWidth: 1, borderColor: 'transparent' },
    generoOpcaoAtivo: { borderColor: cores.laranja },
    generoTexto: { color: cores.branco, fontSize: FONT_SIZE.sm },
    infoText: { color: cores.cinzaClaro, fontSize: FONT_SIZE.sm, lineHeight: 22, maxWidth: 400, marginBottom: SPACING.lg },

    // Social
    socialLabel: { color: cores.cinzaClaro, fontSize: FONT_SIZE.sm, marginBottom: SPACING.md, alignSelf: 'flex-start', maxWidth: 400, width: '100%' },
    dividerRow: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 400, marginBottom: SPACING.lg },
    dividerLine: { flex: 1, height: 1, backgroundColor: cores.border },
    dividerText: { color: cores.cinzaClaro, marginHorizontal: SPACING.md, fontSize: FONT_SIZE.sm },

    // Form
    rowFields: { flexDirection: 'row', gap: SPACING.md, width: '100%', maxWidth: 400 },
    halfField: { flex: 1 },
    label: { color: cores.branco, fontSize: FONT_SIZE.sm, fontWeight: '600', alignSelf: 'flex-start', maxWidth: 400, width: '100%', marginBottom: SPACING.xs },
    inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: cores.backgroundInput, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, width: '100%', maxWidth: 400, height: 48, marginBottom: SPACING.md },
    inputIcon: { marginRight: SPACING.sm },
    input: { flex: 1, color: cores.branco, fontSize: FONT_SIZE.sm },
    hint: { color: cores.cinza, fontSize: FONT_SIZE.xs, alignSelf: 'flex-start', maxWidth: 400, marginBottom: SPACING.md, marginTop: 2 },
    forcaContainer: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 400, gap: SPACING.sm, marginBottom: SPACING.xs, marginTop: -8 },
    forcaBarras: { flexDirection: 'row', gap: 4, flex: 1 },
    forcaBarra: { flex: 1, height: 4, borderRadius: 2, backgroundColor: cores.border },
    forcaLabel: { fontSize: FONT_SIZE.xs, fontWeight: '600', minWidth: 60, textAlign: 'right' },
    erroText: { color: cores.erro, fontSize: FONT_SIZE.xs, alignSelf: 'flex-start', maxWidth: 400, marginBottom: SPACING.sm },

    // CTA
    ctaBtn: { width: '100%', maxWidth: 400, paddingVertical: 14, backgroundColor: cores.roxo, borderRadius: RADIUS.sm, alignItems: 'center', marginTop: SPACING.md, marginBottom: SPACING.md },
    ctaBtnDisabled: { opacity: 0.6 },
    ctaBtnText: { color: cores.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },

    // Footer
    terms: { color: cores.cinzaClaro, fontSize: FONT_SIZE.xs, textAlign: 'center', marginBottom: SPACING.md },
    termsLink: { textDecorationLine: 'underline', color: cores.branco },
    footerRow: { flexDirection: 'row' },
    footerText: { color: cores.cinzaClaro, fontSize: FONT_SIZE.sm },
    footerLink: { color: cores.roxoClaro, fontSize: FONT_SIZE.sm, fontWeight: '600' },
  });
}
