import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CORES, FONT_SIZE, SPACING } from '@/constants/theme';

const ULTIMA_ATUALIZACAO = '21 de maio de 2025';

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
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

export default function TermosDeServicoScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.botaoVoltar}>
          <Ionicons name="arrow-back" size={24} color={CORES.branco} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Termos de Serviço</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.subtitulo}>Última atualização: {ULTIMA_ATUALIZACAO}</Text>

      <Secao titulo="1. Aceitação dos Termos">
        <Paragrafo>
          Ao criar uma conta ou utilizar o AGORA, você concorda com estes Termos de Serviço e com
          nossa Política de Privacidade. Se não concordar, não utilize a plataforma.
        </Paragrafo>
        <Paragrafo>
          Estes termos constituem um contrato legal entre você e o AGORA, operado por Antonio Dan de
          Oliveira, Vilhena – RO, Brasil.
        </Paragrafo>
      </Secao>

      <Secao titulo="2. Descrição do Serviço">
        <Paragrafo>
          O AGORA é uma plataforma digital que conecta organizadores de eventos ao público em
          Vilhena e região. Oferecemos:
        </Paragrafo>
        <Item>Descoberta e divulgação de eventos culturais, esportivos e de lazer</Item>
        <Item>Sistema de inscrição e compra de ingressos</Item>
        <Item>Perfis para organizadores (pessoa física, jurídica e órgãos governamentais)</Item>
        <Item>Notificações sobre eventos de seu interesse</Item>
        <Item>Mapa de eventos com geolocalização</Item>
      </Secao>

      <Secao titulo="3. Cadastro e Conta">
        <Item>Você deve ter pelo menos 13 anos para criar uma conta</Item>
        <Item>As informações fornecidas no cadastro devem ser verdadeiras e atualizadas</Item>
        <Item>Você é responsável por manter a confidencialidade da sua senha</Item>
        <Item>Cada pessoa pode ter apenas uma conta pessoal ativa</Item>
        <Item>
          Contas empresariais (PJ) devem fornecer CNPJ válido e são responsáveis pelos eventos
          publicados
        </Item>
        <Item>Reservamo-nos o direito de suspender contas que violem estes Termos</Item>
      </Secao>

      <Secao titulo="4. Regras de Conduta">
        <Paragrafo>É proibido no AGORA:</Paragrafo>
        <Item>Publicar conteúdo falso, enganoso ou que induza outros usuários ao erro</Item>
        <Item>Criar eventos que promovam atividades ilegais, violência ou discriminação</Item>
        <Item>Assediar, ameaçar ou abusar de outros usuários</Item>
        <Item>Utilizar a plataforma para spam ou publicidade não autorizada</Item>
        <Item>Tentar acessar contas de outros usuários ou burlar medidas de segurança</Item>
        <Item>Realizar engenharia reversa ou copiar o código da plataforma</Item>
        <Item>Usar bots, scripts ou automações não autorizadas</Item>
      </Secao>

      <Secao titulo="5. Eventos e Organizadores">
        <Paragrafo>
          Organizadores que publicam eventos no AGORA são responsáveis por:
        </Paragrafo>
        <Item>Garantir que o evento seja real, seguro e realizado conforme divulgado</Item>
        <Item>Obter todas as licenças e autorizações legais necessárias</Item>
        <Item>Honrar os ingressos emitidos pela plataforma</Item>
        <Item>Informar antecipadamente cancelamentos ou mudanças relevantes</Item>
        <Item>Cumprir com todas as obrigações fiscais decorrentes das vendas</Item>
        <Paragrafo>
          O AGORA reserva-se o direito de remover eventos que violem estas regras, sem aviso prévio.
        </Paragrafo>
      </Secao>

      <Secao titulo="6. Pagamentos e Reembolsos">
        <Paragrafo>
          Os pagamentos são processados pelo Asaas, empresa regulamentada pelo Banco Central do Brasil.
        </Paragrafo>
        <Item>
          Taxas de serviço podem ser aplicadas sobre cada transação e serão exibidas claramente
          antes da confirmação do pagamento
        </Item>
        <Item>
          Reembolsos em caso de cancelamento do evento serão processados pelo organizador, conforme
          política individual de cada evento
        </Item>
        <Item>
          O AGORA não se responsabiliza por eventos cancelados por organizadores independentes
        </Item>
        <Item>
          Estornos por problemas técnicos da plataforma serão analisados caso a caso em até 5 dias úteis
        </Item>
      </Secao>

      <Secao titulo="7. Propriedade Intelectual">
        <Paragrafo>
          O código, design, marca e conteúdo do AGORA são de propriedade exclusiva do operador.
          É vedada a reprodução, modificação ou distribuição sem autorização expressa por escrito.
        </Paragrafo>
        <Paragrafo>
          Ao publicar conteúdo na plataforma (fotos, descrições de eventos), você concede ao AGORA
          uma licença não exclusiva para exibir esse conteúdo dentro da plataforma.
        </Paragrafo>
      </Secao>

      <Secao titulo="8. Limitação de Responsabilidade">
        <Paragrafo>
          O AGORA é uma plataforma intermediária e não organiza os eventos listados. Portanto:
        </Paragrafo>
        <Item>Não garantimos a realização de eventos de terceiros</Item>
        <Item>Não nos responsabilizamos por danos ocorridos durante eventos</Item>
        <Item>Não garantimos disponibilidade ininterrupta da plataforma</Item>
        <Item>
          Nossa responsabilidade máxima é limitada ao valor pago pelo usuário na transação que
          gerou o dano
        </Item>
      </Secao>

      <Secao titulo="9. Rescisão">
        <Paragrafo>
          Você pode encerrar sua conta a qualquer momento nas Configurações do aplicativo. O AGORA
          pode suspender ou encerrar contas que violem estes Termos, sem prejuízo de outras medidas legais.
        </Paragrafo>
      </Secao>

      <Secao titulo="10. Legislação Aplicável">
        <Paragrafo>
          Estes Termos são regidos pelas leis brasileiras. Fica eleito o Foro da Comarca de Vilhena – RO
          para dirimir quaisquer controvérsias, salvo quando a legislação aplicável determinar foro diverso
          (ex.: Código de Defesa do Consumidor).
        </Paragrafo>
      </Secao>

      <Secao titulo="11. Alterações nos Termos">
        <Paragrafo>
          Podemos atualizar estes Termos a qualquer momento. Mudanças relevantes serão comunicadas
          com pelo menos 15 dias de antecedência por e-mail ou aviso no aplicativo. O uso continuado
          após a vigência das novas condições implica aceitação.
        </Paragrafo>
      </Secao>

      <Secao titulo="12. Contato">
        <Paragrafo>
          Dúvidas ou solicitações relacionadas a estes Termos:
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

  rodape: { marginTop: SPACING.xl, alignItems: 'center' },
  rodapeTexto: { color: CORES.cinza, fontSize: FONT_SIZE.xs },
});
