import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useEventos } from '@/contexts/EventosContext';
import { _demoPendentes } from '@/services/eventos';

const MENU_ITEMS = [
  { icon: 'person-outline', label: 'Editar perfil', route: '/editar-perfil' },
  { icon: 'calendar-outline', label: 'Meus Eventos', route: '/meus-eventos' },
  { icon: 'heart-outline', label: 'Favoritos', route: '/favoritos' },
  { icon: 'bag-handle-outline', label: 'Produtos', route: '/produtos' },
  { icon: 'business-outline', label: 'Cadastro Empresa', route: '/cadastro-empresa' },
  { icon: 'notifications-outline', label: 'Notificações', route: '/notificacoes' },
  { icon: 'settings-outline', label: 'Configurações', route: '/configuracoes' },
  { icon: 'help-circle-outline', label: 'Ajuda', route: '/ajuda' },
];

const TIPO_LABEL: Record<string, string> = {
  pf: 'Pessoa Física',
  pj: 'Empresa',
  gov: 'Órgão Público',
  admin: 'Administrador',
};

export default function PerfilScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { favoritos, eventos, carregarEventos } = useEventos();

  useEffect(() => { carregarEventos(); }, []);

  const todosEventos = [...eventos, ..._demoPendentes];
  const meusEventos = todosEventos.filter(ev => ev.criador_id === user?.id || ev.criador_id === 'demo' || ev.criador_id === 'demo-pj');

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.titulo}>Perfil</Text>

      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.nome?.charAt(0)?.toUpperCase() || 'U'}</Text>
        </View>
        <Text style={styles.userName}>{user?.nome} {user?.sobrenome}</Text>
        <Text style={styles.userHandle}>@{user?.username}</Text>

        {/* Badge tipo de conta */}
        <View style={styles.tipoBadge}>
          {user?.tipo_conta === 'pj' ? (
            <MaterialCommunityIcons name="office-building" size={14} color={CORES.laranja} />
          ) : user?.tipo_conta === 'gov' ? (
            <Ionicons name="shield-checkmark" size={14} color={CORES.sucesso} />
          ) : (
            <Ionicons name="person" size={14} color={CORES.roxoClaro} />
          )}
          <Text style={styles.tipoBadgeText}>{TIPO_LABEL[user?.tipo_conta || 'pf']}</Text>
          {user?.verificado && <Ionicons name="checkmark-circle" size={14} color={CORES.sucesso} />}
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{favoritos.length}</Text>
          <Text style={styles.statLabel}>Favoritos</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{meusEventos.length}</Text>
          <Text style={styles.statLabel}>Eventos</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{meusEventos.filter(e => e.status === 'aprovado').length}</Text>
          <Text style={styles.statLabel}>Publicados</Text>
        </View>
      </View>

      <View style={styles.menu}>
        {MENU_ITEMS.map((item, i) => (
          <TouchableOpacity key={i} style={styles.menuItem} onPress={() => item.route ? router.push(item.route as any) : undefined}>
            <Ionicons name={item.icon as any} size={22} color={CORES.branco} />
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={CORES.cinza} />
          </TouchableOpacity>
        ))}

        {/* R4: Admin moderação (visível para admin e em modo demo) */}
        {(user?.tipo_conta === 'admin' || true) && (
          <TouchableOpacity style={[styles.menuItem, styles.adminItem]} onPress={() => router.push('/admin/moderacao')}>
            <Ionicons name="shield-checkmark" size={22} color={CORES.laranja} />
            <Text style={[styles.menuLabel, { color: CORES.laranja }]}>Moderação (Admin)</Text>
            <Ionicons name="chevron-forward" size={18} color={CORES.laranja} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color={CORES.erro} />
        <Text style={styles.logoutText}>Sair</Text>
      </TouchableOpacity>

      <Text style={styles.version}>AGORA v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.background, paddingTop: 60 },
  scrollContent: { paddingHorizontal: SPACING.lg, paddingBottom: 100 },
  titulo: { fontSize: FONT_SIZE.xxl, fontWeight: 'bold', color: CORES.branco, marginBottom: SPACING.lg },

  avatarSection: { alignItems: 'center', marginBottom: SPACING.lg },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: CORES.roxo, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md },
  avatarText: { fontSize: 32, fontWeight: 'bold', color: CORES.branco },
  userName: { color: CORES.branco, fontSize: FONT_SIZE.lg, fontWeight: 'bold' },
  userHandle: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.sm, marginTop: 4 },
  tipoBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm, backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs },
  tipoBadgeText: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs },

  statsRow: { flexDirection: 'row', backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg, justifyContent: 'space-around', alignItems: 'center' },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { color: CORES.branco, fontSize: FONT_SIZE.xl, fontWeight: 'bold' },
  statLabel: { color: CORES.cinzaClaro, fontSize: FONT_SIZE.xs, marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: CORES.border },

  menu: { gap: 4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: CORES.backgroundCard, borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.md },
  adminItem: { borderWidth: 1, borderColor: CORES.laranja, marginTop: SPACING.sm },
  menuLabel: { flex: 1, color: CORES.branco, fontSize: FONT_SIZE.md },

  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.xl, padding: SPACING.md },
  logoutText: { color: CORES.erro, fontSize: FONT_SIZE.md, fontWeight: '600' },

  version: { color: CORES.cinza, fontSize: FONT_SIZE.xs, textAlign: 'center', marginTop: SPACING.md },
});
