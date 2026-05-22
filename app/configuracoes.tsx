import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTema } from '@/contexts/TemaContext';

export default function ConfiguracoesScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const { modoEscuro, notificacoesAtivas, cores, toggleTema, toggleNotificacoes } = useTema();
  const [localizacao, setLocalizacao] = useState(true);
  const [excluindo, setExcluindo] = useState(false);

  async function excluirConta() {
    if (excluindo) return;

    // Passo 1 — confirmação inicial
    Alert.alert(
      'Excluir conta',
      'Tem certeza que deseja excluir sua conta? Todos os seus dados, eventos e inscrições serão apagados permanentemente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          style: 'destructive',
          onPress: confirmarExclusaoFinal,
        },
      ]
    );
  }

  async function confirmarExclusaoFinal() {
    // Passo 2 — segunda confirmação (ação irreversível)
    Alert.alert(
      'Confirmação final',
      'Esta ação é irreversível. Sua conta será excluída permanentemente agora.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir definitivamente',
          style: 'destructive',
          onPress: realizarExclusao,
        },
      ]
    );
  }

  async function realizarExclusao() {
    setExcluindo(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão inválida');

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
      const resp = await fetch(`${supabaseUrl}/functions/v1/excluir-conta`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error ?? `Erro ${resp.status}`);
      }

      // Limpa sessão local e redireciona para login
      await logout();
      router.replace('/login');
    } catch (err: any) {
      setExcluindo(false);
      Alert.alert(
        'Erro ao excluir conta',
        err?.message ?? 'Tente novamente mais tarde.',
        [{ text: 'OK' }]
      );
    }
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: cores.background }]} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={cores.branco} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: cores.branco }]}>Configurações</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Geral */}
      <Text style={[styles.sectionTitle, { color: cores.cinzaClaro }]}>Geral</Text>
      <View style={[styles.card, { backgroundColor: cores.backgroundCard }]}>
        <View style={styles.settingRow}>
          <Ionicons name="notifications-outline" size={20} color={cores.branco} />
          <View style={styles.settingInfo}>
            <Text style={[styles.settingLabel, { color: cores.branco }]}>Notificações push</Text>
            <Text style={[styles.settingDesc, { color: cores.cinza }]}>
              {notificacoesAtivas ? 'Receba alertas de eventos próximos' : 'Notificações desativadas'}
            </Text>
          </View>
          <Switch
            value={notificacoesAtivas}
            onValueChange={toggleNotificacoes}
            trackColor={{ false: cores.border, true: cores.roxo }}
            thumbColor={notificacoesAtivas ? cores.laranja : cores.cinza}
          />
        </View>

        <View style={[styles.divider, { backgroundColor: cores.border }]} />

        <View style={styles.settingRow}>
          <Ionicons name="location-outline" size={20} color={cores.branco} />
          <View style={styles.settingInfo}>
            <Text style={[styles.settingLabel, { color: cores.branco }]}>Localização</Text>
            <Text style={[styles.settingDesc, { color: cores.cinza }]}>Permite buscar eventos na sua região</Text>
          </View>
          <Switch value={localizacao} onValueChange={setLocalizacao} trackColor={{ false: cores.border, true: cores.roxo }} thumbColor={localizacao ? cores.laranja : cores.cinza} />
        </View>

        <View style={[styles.divider, { backgroundColor: cores.border }]} />

        <View style={styles.settingRow}>
          <Ionicons name={modoEscuro ? 'moon' : 'sunny'} size={20} color={cores.branco} />
          <View style={styles.settingInfo}>
            <Text style={[styles.settingLabel, { color: cores.branco }]}>Modo escuro</Text>
            <Text style={[styles.settingDesc, { color: cores.cinza }]}>
              {modoEscuro ? 'Tema escuro ativado' : 'Tema claro ativado'}
            </Text>
          </View>
          <Switch
            value={modoEscuro}
            onValueChange={toggleTema}
            trackColor={{ false: cores.border, true: cores.roxo }}
            thumbColor={modoEscuro ? cores.laranja : cores.cinza}
          />
        </View>
      </View>

      {/* Privacidade */}
      <Text style={[styles.sectionTitle, { color: cores.cinzaClaro }]}>Privacidade</Text>
      <View style={[styles.card, { backgroundColor: cores.backgroundCard }]}>
        <TouchableOpacity style={styles.settingRow} onPress={() => router.push('/politica-privacidade')}>
          <Ionicons name="shield-outline" size={20} color={cores.branco} />
          <View style={styles.settingInfo}>
            <Text style={[styles.settingLabel, { color: cores.branco }]}>Política de privacidade</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={cores.cinza} />
        </TouchableOpacity>

        <View style={[styles.divider, { backgroundColor: cores.border }]} />

        <TouchableOpacity style={styles.settingRow} onPress={() => router.push('/termos-de-servico')}>
          <Ionicons name="document-text-outline" size={20} color={cores.branco} />
          <View style={styles.settingInfo}>
            <Text style={[styles.settingLabel, { color: cores.branco }]}>Termos de serviço</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={cores.cinza} />
        </TouchableOpacity>
      </View>

      {/* Sobre */}
      <Text style={[styles.sectionTitle, { color: cores.cinzaClaro }]}>Sobre</Text>
      <View style={[styles.card, { backgroundColor: cores.backgroundCard }]}>
        <View style={styles.settingRow}>
          <Ionicons name="information-circle-outline" size={20} color={cores.branco} />
          <View style={styles.settingInfo}>
            <Text style={[styles.settingLabel, { color: cores.branco }]}>Versão</Text>
            <Text style={[styles.settingDesc, { color: cores.cinza }]}>1.0.0</Text>
          </View>
        </View>
      </View>

      {/* Danger zone */}
      <Text style={[styles.sectionTitle, { color: cores.erro }]}>Zona de perigo</Text>
      <View style={[styles.card, { backgroundColor: cores.backgroundCard, borderWidth: 1, borderColor: cores.erro + '44' }]}>
        <TouchableOpacity
          style={styles.settingRow}
          onPress={excluirConta}
          disabled={excluindo}
        >
          <Ionicons name="trash-outline" size={20} color={excluindo ? cores.cinza : cores.erro} />
          <View style={styles.settingInfo}>
            <Text style={[styles.settingLabel, { color: excluindo ? cores.cinza : cores.erro }]}>
              {excluindo ? 'Excluindo...' : 'Excluir minha conta'}
            </Text>
            <Text style={[styles.settingDesc, { color: cores.cinza }]}>Esta ação é irreversível</Text>
          </View>
          {!excluindo && <Ionicons name="chevron-forward" size={18} color={cores.erro} />}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, paddingTop: 50 },
  scrollContent: { paddingHorizontal: SPACING.lg, paddingBottom: 40 },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xl },
  headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: 'bold' },

  sectionTitle: { fontSize: FONT_SIZE.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: SPACING.sm, marginTop: SPACING.lg },

  card:        { borderRadius: RADIUS.lg, overflow: 'hidden' },
  settingRow:  { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, gap: SPACING.md },
  settingInfo: { flex: 1 },
  settingLabel: { fontSize: FONT_SIZE.sm, fontWeight: '500' },
  settingDesc:  { fontSize: FONT_SIZE.xs, marginTop: 2 },
  divider:      { height: 1, marginHorizontal: SPACING.md },
});
