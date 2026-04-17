import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';

const FAQ = [
  {
    pergunta: 'Como criar um evento?',
    resposta: 'Toque no botão "+" na tela inicial ou em "Criar novo evento" na barra de ferramentas. Preencha as informações e publique.',
  },
  {
    pergunta: 'Qual a diferença entre conta PF e PJ?',
    resposta: 'Contas Pessoa Física (PF) são para uso pessoal e publicam eventos gratuitos. Contas Empresariais (PJ) podem divulgar eventos comerciais mediante pagamento.',
  },
  {
    pergunta: 'Como denunciar um evento?',
    resposta: 'Abra o evento tocando nele e toque no ícone de bandeira vermelha. Selecione o motivo e envie a denúncia para nossa equipe de moderação.',
  },
  {
    pergunta: 'O que são eventos exclusivos para mulheres?',
    resposta: 'São eventos visíveis apenas para usuárias que se identificam como feminino. Isso garante um espaço seguro para eventos direcionados.',
  },
  {
    pergunta: 'Como funciona o pagamento para empresas?',
    resposta: 'Empresas (PJ) precisam selecionar um plano antes de publicar. Existem planos avulsos, mensais e anuais com diferentes limites de eventos.',
  },
  {
    pergunta: 'O que é a moderação de eventos?',
    resposta: 'Eventos comerciais de empresas passam por moderação antes de serem publicados. Nossa equipe verifica se o conteúdo está de acordo com as diretrizes.',
  },
];

export default function AjudaScreen() {
  const router = useRouter();
  const [expandido, setExpandido] = useState<number | null>(null);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={CORES.branco} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ajuda</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Hero */}
      <View style={styles.hero}>
        <Ionicons name="help-buoy" size={48} color={CORES.roxoClaro} />
        <Text style={styles.heroTitle}>Como podemos ajudar?</Text>
        <Text style={styles.heroSub}>Encontre respostas para as dúvidas mais comuns.</Text>
      </View>

      {/* FAQ */}
      <Text style={styles.sectionTitle}>Perguntas frequentes</Text>
      {FAQ.map((item, i) => (
        <TouchableOpacity
          key={i}
          style={styles.faqItem}
          onPress={() => setExpandido(expandido === i ? null : i)}
        >
          <View style={styles.faqHeader}>
            <Text style={styles.faqPergunta}>{item.pergunta}</Text>
            <Ionicons name={expandido === i ? 'chevron-up' : 'chevron-down'} size={18} color={CORES.cinza} />
          </View>
          {expandido === i && (
            <Text style={styles.faqResposta}>{item.resposta}</Text>
          )}
        </TouchableOpacity>
      ))}

      {/* Contato */}
      <Text style={styles.sectionTitle}>Precisa de mais ajuda?</Text>
      <View style={styles.contatoCard}>
        <Ionicons name="mail-outline" size={24} color={CORES.roxoClaro} />
        <View style={styles.contatoInfo}>
          <Text style={styles.contatoLabel}>Entre em contato</Text>
          <Text style={styles.contatoText}>suporte@agora.app</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.background, paddingTop: 50 },
  scrollContent: { paddingHorizontal: SPACING.lg, paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.lg },
  headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: 'bold', color: CORES.branco },

  hero: { alignItems: 'center', marginBottom: SPACING.xl },
  heroTitle: { color: CORES.branco, fontSize: FONT_SIZE.xl, fontWeight: 'bold', marginTop: SPACING.md },
  heroSub: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, marginTop: SPACING.xs, textAlign: 'center' },

  sectionTitle: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: SPACING.sm, marginTop: SPACING.md },

  faqItem: { backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  faqPergunta: { color: CORES.branco, fontSize: FONT_SIZE.sm, fontWeight: '600', flex: 1, marginRight: SPACING.sm },
  faqResposta: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, lineHeight: 22, marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: CORES.border },

  contatoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.md },
  contatoInfo: { flex: 1 },
  contatoLabel: { color: CORES.branco, fontSize: FONT_SIZE.sm, fontWeight: '600' },
  contatoText: { color: CORES.roxoClaro, fontSize: FONT_SIZE.sm, marginTop: 2 },
});
