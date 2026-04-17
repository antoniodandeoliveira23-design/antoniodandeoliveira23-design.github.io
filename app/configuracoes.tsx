import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';

export default function ConfiguracoesScreen() {
  const router = useRouter();
  const [notificacoes, setNotificacoes] = useState(true);
  const [localizacao, setLocalizacao] = useState(true);
  const [modoEscuro, setModoEscuro] = useState(true);

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
        <TouchableOpacity style={styles.settingRow}>
          <Ionicons name="shield-outline" size={20} color={CORES.branco} />
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Política de privacidade</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={CORES.cinza} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.settingRow}>
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
        <TouchableOpacity style={styles.settingRow}>
          <Ionicons name="trash-outline" size={20} color={CORES.erro} />
          <View style={styles.settingInfo}>
            <Text style={[styles.settingLabel, { color: CORES.erro }]}>Excluir minha conta</Text>
            <Text style={styles.settingDesc}>Esta ação é irreversível</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={CORES.erro} />
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
