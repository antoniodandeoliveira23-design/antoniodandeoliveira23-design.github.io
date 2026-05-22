import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CORES, FONT_SIZE, SPACING } from '@/constants/theme';

const ULTIMA_ATUALIZACAO = '21 de maio de 2025';

interface SecaoProps {
  titulo: string;
  children: React.ReactNode;
}

function Secao({ titulo, children }: SecaoProps) {
  return (
    <View style={styles.secao}>
      <Text style={styles.secaoTitulo}>{titulo}</Text>
      {children}
    </View>
  );
}

function Paragrafo({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paragrafo}>{children}</Text>;
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.itemRow}>
      <Text style={styles.bullet}>•</Text>
      <Text style={styles.itemTexto}>{children}</Text>
    </View>
  );
}

export default function PoliticaPrivacidadeScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.botaoVoltar}>
          <Ionicons name="arrow-back" size={24} color={CORES.branco} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Política de Privacidade</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.subtitulo}>Última atualização: {ULTIMA_ATUALIZACAO}</Text>

      <Secao titulo="1. Quem somos">
        <Paragrafo>
          O AGORA é uma plataforma de descoberta e inscrição em eventos culturais, esportivos e de lazer
          operada por Antonio Dan de Oliveira, com sede em Vilhena – RO, Brasil. Para dúvidas sobre esta
          Política, entre em contato pelo e-mail: antoniodandeoliveira23@gmail.com.
        </Paragrafo>
      </Secao>

      <Secao titulo="2. Dados que coletamos">
        <Paragrafo>Coletamos apenas os dados necessários para o funcionamento da plataforma:</Paragrafo>
        <Item>Nome, sobrenome e nome de usuário (username)</Item>
        <Item>Endereço de e-mail</Item>
        <Item>Senha (armazenada de forma criptografada — nunca em texto simples)</Item>
        <Item>Tipo de conta (pessoa física, jurídica ou governo)</Item>
        <Item>CNPJ (apenas para contas empresariais)</Item>
        <Item>Foto de perfil (opcional)</Item>
        <Item>Localização aproximada (somente se você autorizar)</Item>
        <Item>Dados de eventos criados ou inscrições realizadas</Item>
        <Item>Informações de pagamento processadas pelo Asaas (não armazenamos dados de cartão)</Item>
        <Item>Token de notificação push (somente em dispositivos móveis)</Item>
        <Item>Dados de acesso fornecidos pelo Google ao usar login social</Item>
      </Secao>

      <Secao titulo="3. Como usamos seus dados">
        <Item>Criar e gerenciar sua conta na plataforma</Item>
        <Item>Exibir eventos relevantes à sua localização e interesses</Item>
        <Item>Processar inscrições e pagamentos</Item>
        <Item>Enviar notificações sobre eventos que você segue</Item>
        <Item>Enviar e-mails transacionais (confirmação de cadastro, recibos, alertas)</Item>
        <Item>Prevenir fraudes e garantir a segurança da plataforma</Item>
        <Item>Cumprir obrigações legais e responder a autoridades competentes</Item>
      </Secao>

      <Secao titulo="4. Compartilhamento de dados">
        <Paragrafo>
          Não vendemos seus dados pessoais. Compartilhamos informações apenas com:
        </Paragrafo>
        <Item>
          <Text style={styles.negrito}>Supabase (supabase.com)</Text>: banco de dados e autenticação,
          hospedado nos EUA com proteções adequadas (SCCs)
        </Item>
        <Item>
          <Text style={styles.negrito}>Resend (resend.com)</Text>: envio de e-mails transacionais
        </Item>
        <Item>
          <Text style={styles.negrito}>Asaas (asaas.com)</Text>: processamento de pagamentos PIX e boleto,
          empresa brasileira regulamentada pelo Banco Central
        </Item>
        <Item>
          <Text style={styles.negrito}>Vercel (vercel.com)</Text>: hospedagem do aplicativo web
        </Item>
        <Item>
          <Text style={styles.negrito}>Google</Text>: autenticação via Google OAuth (caso você opte por
          esse método de login) e mapas
        </Item>
        <Item>Autoridades públicas, quando exigido por lei ou ordem judicial</Item>
      </Secao>

      <Secao titulo="5. Seus direitos (LGPD — Lei nº 13.709/2018)">
        <Paragrafo>
          Como titular de dados pessoais, você tem direito a:
        </Paragrafo>
        <Item>Confirmar a existência de tratamento de seus dados</Item>
        <Item>Acessar os dados que temos sobre você</Item>
        <Item>Corrigir dados incompletos, inexatos ou desatualizados</Item>
        <Item>Solicitar a anonimização, bloqueio ou eliminação de dados desnecessários</Item>
        <Item>Portabilidade dos seus dados para outro fornecedor de serviço</Item>
        <Item>Revogar o consentimento a qualquer momento</Item>
        <Item>Excluir sua conta e todos os dados associados diretamente no aplicativo</Item>
        <Item>
          Peticionar à Autoridade Nacional de Proteção de Dados (ANPD):
          www.gov.br/anpd
        </Item>
        <Paragrafo>
          Para exercer qualquer um desses direitos, acesse as Configurações do aplicativo ou envie um
          e-mail para antoniodandeoliveira23@gmail.com.
        </Paragrafo>
      </Secao>

      <Secao titulo="6. Retenção dos dados">
        <Paragrafo>
          Mantemos seus dados enquanto sua conta estiver ativa. Ao excluir sua conta, apagamos seus
          dados pessoais em até 30 dias, exceto aqueles que precisamos reter por obrigação legal
          (ex.: registros financeiros por 5 anos, conforme legislação fiscal brasileira).
        </Paragrafo>
      </Secao>

      <Secao titulo="7. Cookies e rastreamento">
        <Paragrafo>
          Utilizamos cookies técnicos estritamente necessários para manter sua sessão autenticada.
          Não utilizamos cookies de rastreamento publicitário ou de terceiros para fins de marketing.
        </Paragrafo>
      </Secao>

      <Secao titulo="8. Segurança">
        <Paragrafo>
          Adotamos as seguintes medidas para proteger seus dados:
        </Paragrafo>
        <Item>Comunicação criptografada via TLS/HTTPS</Item>
        <Item>Senhas armazenadas com hashing bcrypt</Item>
        <Item>Controle de acesso por linha (Row Level Security) no banco de dados</Item>
        <Item>Autenticação com tokens JWT de curta duração</Item>
        <Item>Monitoramento de anomalias e tentativas de acesso suspeitas</Item>
        <Item>Logs de auditoria para ações críticas</Item>
      </Secao>

      <Secao titulo="9. Menores de idade">
        <Paragrafo>
          O AGORA não é destinado a menores de 13 anos. Se tomarmos conhecimento de que coletamos
          dados de uma criança sem o consentimento dos responsáveis, excluiremos essas informações
          imediatamente.
        </Paragrafo>
      </Secao>

      <Secao titulo="10. Alterações nesta Política">
        <Paragrafo>
          Podemos atualizar esta Política periodicamente. Quando houver mudanças relevantes,
          notificaremos você por e-mail ou por aviso destacado no aplicativo. O uso continuado
          da plataforma após a notificação constitui aceitação da versão atualizada.
        </Paragrafo>
      </Secao>

      <Secao titulo="11. Contato">
        <Paragrafo>
          Dúvidas, solicitações ou reclamações relacionadas à privacidade:
        </Paragrafo>
        <Item>E-mail: antoniodandeoliveira23@gmail.com</Item>
        <Item>Plataforma: AGORA — Vilhena, RO, Brasil</Item>
      </Secao>

      <View style={styles.rodape}>
        <Text style={styles.rodapeTexto}>© 2025 AGORA. Todos os direitos reservados.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.background },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: 60, paddingTop: 50 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  botaoVoltar: { padding: 8 },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: 'bold',
    color: CORES.branco,
    flex: 1,
    textAlign: 'center',
  },

  subtitulo: {
    color: CORES.cinza,
    fontSize: FONT_SIZE.xs,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },

  secao: { marginBottom: SPACING.xl },
  secaoTitulo: {
    color: CORES.roxo,
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  paragrafo: {
    color: CORES.cinzaClaro,
    fontSize: FONT_SIZE.sm,
    lineHeight: 22,
    marginBottom: SPACING.sm,
  },
  itemRow: { flexDirection: 'row', marginBottom: 6, paddingLeft: 4 },
  bullet: { color: CORES.laranja, marginRight: 8, fontSize: FONT_SIZE.sm, lineHeight: 22 },
  itemTexto: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, lineHeight: 22, flex: 1 },
  negrito: { fontWeight: '700', color: CORES.branco },

  rodape: { marginTop: SPACING.xl, alignItems: 'center' },
  rodapeTexto: { color: CORES.cinza, fontSize: FONT_SIZE.xs },
});
