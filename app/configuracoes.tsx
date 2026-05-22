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

export default function ConfiguracoesScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const [notificacoes, setNotificacoes] = useState(true);
  const [localizacao, setLocalizacao] = useState(true);
  const [modoEscuro, setModoEscuro] = useState(true);
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
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={CORES.branco} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Configurações</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Notificações */}
      <Text style={styles.sectionTitle}>Geral</Text>
      <View style={styles.card}>
        <View style={styles.settingRow}>
          <Ionicons name="notifications-outline" size={20} color={CORES.branco} />
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Notificações push</Text>
            <Text style={styles.settingDesc}>Receba alertas de eventos próximos</Text>
          </View>
          <Switch value={notificacoes} onValueChange={setNotificacoes} trackColor={{ false: CORES.border, true: CORES.roxo }} thumbColor={notificacoes ? CORES.laranja : CORES.cinza} />
        </View>

        <View style={styles.divider} />

        <View style={styles.settingRow}>
          <Ionicons name="location-outline" size={20} color={CORES.branco} />
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Localização</Text>
            <Text style={styles.settingDesc}>Permite buscar eventos na sua região</Text>
          </View>
          <Switch value={localizacao} onValueChange={setLocalizacao} trackColor={{ false: CORES.border, true: CORES.roxo }} thumbColor={localizacao ? CORES.laranja : CORES.cinza} />
        </View>

        <View style={styles.divider} />

        <View style={styles.settingRow}>
          <Ionicons name="moon-outline" size={20} color={CORES.branco} />
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Modo escuro</Text>
            <Text style={styles.settingDesc}>Tema escuro ativado</Text>
          </View>
          <Switch value={modoEscuro} onValueChange={setModoEscuro} trackColor={{ false: CORES.border, true: CORES.roxo }} thumbColor={modoEscuro ? CORES.laranja : CORES.cinza} />
        </View>
      </View>

      {/* Privacidade */}
      <Text style={styles.sectionTitle}>Privacidade</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.settingRow} onPress={() => router.push('/politica-privacidade')}>
          <Ionicons name="shield-outline" size={20} color={CORES.branco} />
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Política de privacidade</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={CORES.cinza} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.settingRow} onPress={() => router.push('/termos-de-servico')}>
          <Ionicons name="document-text-outline" size={20} color={CORES.branco} />
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Termos de serviço</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={CORES.cinza} />
        </TouchableOpacity>
      </View>

      {/* Sobre */}
      <Text style={styles.sectionTitle}>Sobre</Text>
      <View style={styles.card}>
        <View style={styles.settingRow}>
          <Ionicons name="information-circle-outline" size={20} color={CORES.branco} />
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Versão</Text>
            <Text style={styles.settingDesc}>1.0.0</Text>
          </View>
        </View>
      </View>

      {/* Danger zone */}
      <Text style={[styles.sectionTitle, { color: CORES.erro }]}>Zona de perigo</Text>
      <View style={[styles.card, { borderWidth: 1, borderColor: CORES.erro + '44' }]}>
        <TouchableOpacity
          style={styles.settingRow}
          onPress={excluirConta}
          disabled={excluindo}
        >
          <Ionicons name="trash-outline" size={20} color={excluindo ? CORES.cinza : CORES.erro} />
          <View style={styles.settingInfo}>
            <Text style={[styles.settingLabel, { color: excluindo ? CORES.cinza : CORES.erro }]}>
              {excluindo ? 'Excluindo...' : 'Excluir minha conta'}
            </Text>
            <Text style={styles.settingDesc}>Esta ação é irreversível</Text>
          </View>
          {!excluindo && <Ionicons name="chevron-forward" size={18} color={CORES.erro} />}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.background, paddingTop: 50 },
  scrollContent: { paddingHorizontal: SPACING.lg, paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xl },
  headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: 'bold', color: CORES.branco },

  sectionTitle: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: SPACING.sm, marginTop: SPACING.lg },

  card: { backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.lg, overflow: 'hidden' },

  settingRow: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, gap: SPACING.md },
  settingInfo: { flex: 1 },
  settingLabel: { color: CORES.branco, fontSize: FONT_SIZE.sm, fontWeight: '500' },
  settingDesc: { color: CORES.cinza, fontSize: FONT_SIZE.xs, marginTop: 2 },

  divider: { height: 1, backgroundColor: CORES.border, marginHorizontal: SPACING.md },
});
