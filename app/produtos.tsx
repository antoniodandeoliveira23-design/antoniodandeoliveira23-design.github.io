import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { produtosService } from '@/services/produtos';
import { validacaoSemantica } from '@/services/validacao-semantica';
import { registrarAnomalia } from '@/services/auditoria';
import { storageService } from '@/services/storage';
import ImageUpload from '@/components/ImageUpload';
import type { Produto, CategoriaProduto } from '@/types';

const CATEGORIAS_PRODUTO: { value: CategoriaProduto; label: string; icon: string }[] = [
  { value: 'alimentacao', label: 'Alimentação', icon: 'restaurant' },
  { value: 'vestuario', label: 'Vestuário', icon: 'shirt' },
  { value: 'servicos', label: 'Serviços', icon: 'construct' },
  { value: 'artesanato', label: 'Artesanato', icon: 'color-palette' },
  { value: 'tecnologia', label: 'Tecnologia', icon: 'hardware-chip' },
  { value: 'saude', label: 'Saúde', icon: 'medkit' },
  { value: 'outro', label: 'Outro', icon: 'ellipsis-horizontal' },
];

export default function ProdutosScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [modalCriar, setModalCriar] = useState(false);

  // Form state
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [preco, setPreco] = useState('');
  const [local, setLocal] = useState('');
  const [categoria, setCategoria] = useState<CategoriaProduto>('outro');
  const [imagemUrl, setImagemUrl] = useState<string | undefined>();
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState(false);

  const campoCaminhoImagem = storageService.gerarCaminho(user?.id || 'demo');

  useEffect(() => {
    loadProdutos();
  }, []);

  const loadProdutos = async () => {
    const data = await produtosService.listar();
    setProdutos(data.dados);
  };

  const handleCriar = async () => {
    setErro('');
    if (!nome.trim() || !local.trim() || !preco.trim()) {
      setErro('Preencha nome, local e preço.');
      return;
    }

    // R1b/R1c — Validação semântica: spam + conteúdo ofensivo
    const textoCompleto = `${nome.trim()} ${descricao.trim()}`;
    const analise = validacaoSemantica.analisar(textoCompleto, 'produto');

    if (analise.bloqueado) {
      // Registra anomalia silenciosamente
      await registrarAnomalia({
        userId: user?.id,
        tipo: 'conteudo_suspeito',
        descricao: `Produto bloqueado por conteúdo: ${analise.motivo}`,
        detalhes: {
          contexto: 'produto',
          nome_produto: nome.trim().substring(0, 80),
          score: analise.score,
          motivos: analise.alertas.slice(0, 3),
        },
      });
      setErro(analise.motivo ?? 'Conteúdo não permitido. Revise nome e descrição.');
      return;
    }

    // Aviso leve (spam parcial) — permite criar mas exibe alerta
    if (analise.alertas.length > 0) {
      setErro(`Atenção: ${analise.alertas[0]} — o produto foi salvo mas pode ser revisado.`);
    }

    try {
      await produtosService.criar({
        nome: nome.trim(),
        descricao: descricao.trim(),
        preco: parseFloat(preco.replace(',', '.')),
        moeda: 'BRL',
        categoria,
        imagem_url: imagemUrl,
        local: local.trim(),
        lat: -12.7405 + (Math.random() * 0.01 - 0.005),
        lng: -60.1458 + (Math.random() * 0.01 - 0.005),
      });
      setSucesso(true);
      setNome(''); setDescricao(''); setPreco(''); setLocal(''); setImagemUrl(undefined);
      setErro('');
      await loadProdutos();
      setTimeout(() => { setSucesso(false); setModalCriar(false); }, 1500);
    } catch {
      setErro('Erro ao criar produto.');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={CORES.branco} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Produtos</Text>
        <TouchableOpacity onPress={() => setModalCriar(true)}>
          <Ionicons name="add-circle" size={28} color={CORES.roxo} />
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>Produtos vinculados a eventos na sua região</Text>

      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {produtos.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="bag-outline" size={48} color={CORES.cinza} />
            <Text style={styles.emptyTitle}>Nenhum produto cadastrado</Text>
          </View>
        ) : (
          produtos.map(prod => (
            <View key={prod.id} style={styles.card}>
              <View style={styles.cardIcon}>
                {prod.imagem_url ? (
                  <Image
                    source={{ uri: prod.imagem_url }}
                    style={styles.cardImg}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <Ionicons name="bag-handle" size={24} color={CORES.laranja} />
                )}
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardNome} numberOfLines={1}>{prod.nome}</Text>
                <Text style={styles.cardDesc} numberOfLines={2}>{prod.descricao}</Text>
                <View style={styles.cardMeta}>
                  <Ionicons name="location-outline" size={12} color={CORES.cinzaClaro} />
                  <Text style={styles.cardLocal} numberOfLines={1}>{prod.local}</Text>
                </View>
              </View>
              <View style={styles.cardPreco}>
                <Text style={styles.precoLabel}>R$</Text>
                <Text style={styles.precoValor}>{prod.preco.toFixed(2).replace('.', ',')}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Modal Criar Produto */}
      <Modal visible={modalCriar} transparent animationType="slide" onRequestClose={() => setModalCriar(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitulo}>Novo Produto</Text>
                <TouchableOpacity onPress={() => setModalCriar(false)}>
                  <Ionicons name="close" size={24} color={CORES.cinza} />
                </TouchableOpacity>
              </View>

              {sucesso ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons name="checkmark-circle" size={56} color={CORES.sucesso} />
                  <Text style={[styles.modalTitulo, { marginTop: 12 }]}>Produto criado!</Text>
                </View>
              ) : (
                <>
                  {/* Foto do produto */}
                  <View style={styles.imagemProdutoWrapper}>
                    <ImageUpload
                      bucket="produtos"
                      caminho={campoCaminhoImagem}
                      urlAtual={imagemUrl}
                      onUpload={setImagemUrl}
                      shape="rect"
                      width={280}
                      height={160}
                      label="Adicionar foto do produto"
                    />
                  </View>

                  <Text style={styles.label}>Nome do produto</Text>
                  <View style={styles.inputWrapper}>
                    <TextInput style={styles.input} placeholder="Ex: Cesta de café regional" placeholderTextColor={CORES.cinza} value={nome} onChangeText={setNome} />
                  </View>

                  <Text style={styles.label}>Descrição</Text>
                  <View style={[styles.inputWrapper, { height: 80, alignItems: 'flex-start', paddingTop: 12 }]}>
                    <TextInput style={[styles.input, { textAlignVertical: 'top' }]} placeholder="Descreva o produto..." placeholderTextColor={CORES.cinza} value={descricao} onChangeText={setDescricao} multiline />
                  </View>

                  <Text style={styles.label}>Preço (R$)</Text>
                  <View style={styles.inputWrapper}>
                    <Text style={{ color: CORES.laranja, fontWeight: 'bold', marginRight: 4 }}>R$</Text>
                    <TextInput style={styles.input} placeholder="0,00" placeholderTextColor={CORES.cinza} value={preco} onChangeText={setPreco} keyboardType="numeric" />
                  </View>

                  <Text style={styles.label}>Local de venda</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="location-outline" size={18} color={CORES.cinza} style={{ marginRight: 8 }} />
                    <TextInput style={styles.input} placeholder="Onde encontrar?" placeholderTextColor={CORES.cinza} value={local} onChangeText={setLocal} />
                  </View>

                  <Text style={styles.label}>Categoria</Text>
                  <View style={styles.catGrid}>
                    {CATEGORIAS_PRODUTO.map(c => (
                      <TouchableOpacity
                        key={c.value}
                        style={[styles.catChip, categoria === c.value && styles.catChipAtivo]}
                        onPress={() => setCategoria(c.value)}
                      >
                        <Ionicons name={c.icon as any} size={14} color={categoria === c.value ? CORES.laranja : CORES.cinza} />
                        <Text style={[styles.catText, categoria === c.value && styles.catTextAtivo]}>{c.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {erro ? <Text style={styles.erroText}>{erro}</Text> : null}

                  <TouchableOpacity style={styles.ctaBtn} onPress={handleCriar}>
                    <Text style={styles.ctaBtnText}>Cadastrar Produto</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'web' ? 20 : 50, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: 'bold', color: CORES.branco },
  subtitle: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs, paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },

  listContent: { paddingHorizontal: SPACING.lg, paddingBottom: 40, gap: SPACING.sm },

  imagemProdutoWrapper: { alignItems: 'center', marginBottom: SPACING.md },

  card: { flexDirection: 'row', backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, gap: SPACING.sm, alignItems: 'center' },
  cardIcon: { width: 56, height: 56, borderRadius: 12, backgroundColor: CORES.background, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  cardImg: { width: 56, height: 56, borderRadius: 12 },
  cardInfo: { flex: 1, gap: 2 },
  cardNome: { color: CORES.branco, fontSize: FONT_SIZE.sm, fontWeight: 'bold' },
  cardDesc: { color: CORES.cinzaClaro, fontSize: 11, lineHeight: 16 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  cardLocal: { color: CORES.cinzaClaro, fontSize: 10, flex: 1 },
  cardPreco: { alignItems: 'flex-end' },
  precoLabel: { color: CORES.cinzaClaro, fontSize: 10 },
  precoValor: { color: CORES.laranja, fontSize: FONT_SIZE.lg, fontWeight: 'bold' },

  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, marginTop: SPACING.sm },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: CORES.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: CORES.backgroundCard, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
  modalTitulo: { color: CORES.branco, fontSize: FONT_SIZE.xl, fontWeight: 'bold' },

  label: { color: CORES.branco, fontSize: FONT_SIZE.sm, fontWeight: '600', marginBottom: SPACING.xs },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: CORES.backgroundInput, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, height: 48, marginBottom: SPACING.md },
  input: { flex: 1, color: CORES.branco, fontSize: FONT_SIZE.sm },

  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: CORES.background, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderWidth: 1, borderColor: 'transparent' },
  catChipAtivo: { borderColor: CORES.laranja },
  catText: { color: CORES.cinza, fontSize: FONT_SIZE.xs },
  catTextAtivo: { color: CORES.laranja },

  erroText: { color: CORES.erro, fontSize: FONT_SIZE.xs, marginBottom: SPACING.sm },
  ctaBtn: { paddingVertical: 14, backgroundColor: CORES.roxo, borderRadius: RADIUS.sm, alignItems: 'center', marginTop: SPACING.sm },
  ctaBtnText: { color: CORES.branco, fontSize: FONT_SIZE.md, fontWeight: 'bold' },
});
