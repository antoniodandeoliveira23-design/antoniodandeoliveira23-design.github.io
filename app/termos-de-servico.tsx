import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FONT_SIZE, SPACING, type Cores } from '@/constants/theme';
import { useCores } from '@/contexts/TemaContext';

const ULTIMA_ATUALIZACAO = '12 de abril de 2026';

function Secao({ titulo, children, styles }: { titulo: string; children: React.ReactNode; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.secao}>
      <Text style={styles.secaoTitulo}>{titulo}</Text>
      {children}
    </View>
  );
}

function Paragrafo({ children, styles }: { children: React.ReactNode; styles: ReturnType<typeof createStyles> }) {
  return <Text style={styles.paragrafo}>{children}</Text>;
}

function Item({ children, styles }: { children: React.ReactNode; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.itemRow}>
      <Text style={styles.bullet}>•</Text>
      <Text style={styles.itemTexto}>{children}</Text>
    </View>
  );
}

export default function TermosDeServicoScreen() {
  const cores = useCores();
  const styles = createStyles(cores);
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.botaoVoltar}>
          <Ionicons name="arrow-back" size={24} color={cores.branco} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Termos de Uso</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.subtitulo}>Última atualização: {ULTIMA_ATUALIZACAO}</Text>

      <Text style={styles.introducao}>
        Bem-vindo ao AGORA. Ao acessar ou utilizar nossa plataforma, você concorda com os termos abaixo.
      </Text>

      <Secao titulo="1. Sobre o AGORA" styles={styles}>
        <Paragrafo styles={styles}>
          O AGORA é uma plataforma digital que conecta usuários, empresas e instituições por meio da
          divulgação de eventos, serviços e promoções locais.
        </Paragrafo>
      </Secao>

      <Secao titulo="2. Cadastro e Conta" styles={styles}>
        <Paragrafo styles={styles}>
          Para utilizar determinadas funcionalidades, o usuário deverá realizar cadastro, fornecendo
          informações como:
        </Paragrafo>
        <Item styles={styles}>Nome</Item>
        <Item styles={styles}>E-mail</Item>
        <Item styles={styles}>Telefone</Item>
        <Paragrafo styles={styles}>
          O usuário declara que as informações fornecidas são verdadeiras e atualizadas.
        </Paragrafo>
      </Secao>

      <Secao titulo="3. Perfis de Usuário" styles={styles}>
        <Paragrafo styles={styles}>A plataforma possui diferentes perfis:</Paragrafo>
        <Item styles={styles}>Usuário comum</Item>
        <Item styles={styles}>Empresas</Item>
        <Item styles={styles}>Órgãos públicos</Item>
        <Paragrafo styles={styles}>
          Cada perfil possui permissões específicas dentro da plataforma.
        </Paragrafo>
      </Secao>

      <Secao titulo="4. Uso da Plataforma" styles={styles}>
        <Paragrafo styles={styles}>O usuário se compromete a:</Paragrafo>
        <Item styles={styles}>Utilizar a plataforma de forma ética e legal</Item>
        <Item styles={styles}>Não publicar conteúdo enganoso, fraudulento ou ilegal</Item>
        <Item styles={styles}>Não utilizar conta comum para fins comerciais indevidos</Item>
      </Secao>

      <Secao titulo="5. Conteúdo e Responsabilidade" styles={styles}>
        <Paragrafo styles={styles}>O AGORA atua como intermediador de informações.</Paragrafo>
        <Item styles={styles}>A responsabilidade pelas informações publicadas é do usuário ou empresa que as criou</Item>
        <Item styles={styles}>O AGORA poderá remover conteúdos que violem regras ou legislação</Item>
      </Secao>

      <Secao titulo="6. Publicações Comerciais" styles={styles}>
        <Paragrafo styles={styles}>Empresas que desejam divulgar eventos ou promoções:</Paragrafo>
        <Item styles={styles}>Devem realizar pagamento prévio (quando aplicável)</Item>
        <Item styles={styles}>Estão sujeitas à aprovação de conteúdo</Item>
      </Secao>

      <Secao titulo="7. Dados e Privacidade" styles={styles}>
        <Paragrafo styles={styles}>
          O uso de dados é regido pela Política de Privacidade do AGORA.
        </Paragrafo>
        <Paragrafo styles={styles}>
          O compartilhamento de dados com empresas só ocorrerá mediante consentimento do usuário.
        </Paragrafo>
      </Secao>

      <Secao titulo="8. Limitação de Responsabilidade" styles={styles}>
        <Paragrafo styles={styles}>O AGORA não se responsabiliza por:</Paragrafo>
        <Item styles={styles}>Cancelamento de eventos</Item>
        <Item styles={styles}>Informações incorretas fornecidas por terceiros</Item>
        <Item styles={styles}>Problemas ocorridos durante eventos</Item>
      </Secao>

      <Secao titulo="9. Moderação e Segurança" styles={styles}>
        <Paragrafo styles={styles}>O AGORA poderá:</Paragrafo>
        <Item styles={styles}>Remover conteúdos</Item>
        <Item styles={styles}>Suspender contas</Item>
        <Item styles={styles}>Analisar denúncias</Item>
        <Paragrafo styles={styles}>
          Com o objetivo de manter a segurança da plataforma.
        </Paragrafo>
      </Secao>

      <Secao titulo="10. Alterações" styles={styles}>
        <Paragrafo styles={styles}>
          O AGORA pode atualizar estes termos a qualquer momento.
        </Paragrafo>
      </Secao>

      <Secao titulo="11. Legislação" styles={styles}>
        <Paragrafo styles={styles}>
          Este termo é regido pelas leis brasileiras, especialmente pela Lei Geral de Proteção de Dados.
        </Paragrafo>
      </Secao>

      <View style={styles.rodape}>
        <Text style={styles.rodapeTexto}>© 2026 AGORA. Todos os direitos reservados.</Text>
      </View>
    </ScrollView>
  );
}

function createStyles(cores: Cores) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: cores.background },
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
      color: cores.branco,
      flex: 1,
      textAlign: 'center',
    },

    subtitulo: {
      color: cores.cinza,
      fontSize: FONT_SIZE.xs,
      textAlign: 'center',
      marginBottom: SPACING.md,
    },

    introducao: {
      color: cores.cinzaClaro,
      fontSize: FONT_SIZE.sm,
      lineHeight: 22,
      marginBottom: SPACING.xl,
      fontStyle: 'italic',
    },

    secao: { marginBottom: SPACING.xl },
    secaoTitulo: {
      color: cores.roxo,
      fontSize: FONT_SIZE.md,
      fontWeight: '700',
      marginBottom: SPACING.sm,
    },
    paragrafo: {
      color: cores.cinzaClaro,
      fontSize: FONT_SIZE.sm,
      lineHeight: 22,
      marginBottom: SPACING.sm,
    },
    itemRow: { flexDirection: 'row', marginBottom: 6, paddingLeft: 4 },
    bullet: { color: cores.laranja, marginRight: 8, fontSize: FONT_SIZE.sm, lineHeight: 22 },
    itemTexto: { color: cores.cinzaClaro, fontSize: FONT_SIZE.sm, lineHeight: 22, flex: 1 },

    rodape: { marginTop: SPACING.xl, alignItems: 'center' },
    rodapeTexto: { color: cores.cinza, fontSize: FONT_SIZE.xs },
  });
}
