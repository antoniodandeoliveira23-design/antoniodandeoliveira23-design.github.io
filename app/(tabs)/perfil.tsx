import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FONT_SIZE, RADIUS, SPACING, type Cores } from '@/constants/theme';
import { useCores } from '@/contexts/TemaContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEventos } from '@/contexts/EventosContext';
import { _demoPendentes } from '@/services/eventos';
import { storageService } from '@/services/storage';
import ImageUpload from '@/components/ImageUpload';

const MENU_ITEMS = [
  { icon: 'person-outline', label: 'Editar perfil', route: '/editar-perfil' },
  { icon: 'calendar-outline', label: 'Meus Eventos', route: '/meus-eventos' },
  { icon: 'heart-outline', label: 'Favoritos', route: '/favoritos' },
  { icon: 'ticket-outline', label: 'Minhas Inscrições', route: '/minhas-inscricoes' },
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
  const cores = useCores();
  const styles = createStyles(cores);
  const router = useRouter();
  const { user, logout, updateUser } = useAuth();
  const { favoritos, eventos, carregarEventos } = useEventos();

  useEffect(() => { carregarEventos(); }, []);

  const handleAvatarUpload = async (url: string) => {
    try {
      await updateUser({ avatar_url: url } as any);
    } catch {
      // silencioso — o preview já foi atualizado pelo componente
    }
  };

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
        <ImageUpload
          bucket="avatares"
          caminho={storageService.gerarCaminho(user?.id || 'demo', 'image/jpeg')}
          urlAtual={user?.avatar_url}
          onUpload={handleAvatarUpload}
          shape="circle"
          width={88}
          height={88}
          placeholder={user?.nome?.charAt(0)?.toUpperCase() || 'U'}
          label="Alterar foto"
        />
        <Text style={styles.userName}>{user?.nome} {user?.sobrenome}</Text>
        <Text style={styles.userHandle}>@{user?.username}</Text>

        {/* Badge tipo de conta */}
        <View style={styles.tipoBadge}>
          {user?.tipo_conta === 'pj' ? (
            <MaterialCommunityIcons name="office-building" size={14} color={cores.laranja} />
          ) : user?.tipo_conta === 'gov' ? (
            <Ionicons name="shield-checkmark" size={14} color={cores.sucesso} />
          ) : (
            <Ionicons name="person" size={14} color={cores.roxoClaro} />
          )}
          <Text style={styles.tipoBadgeText}>{TIPO_LABEL[user?.tipo_conta || 'pf']}</Text>
          {user?.verificado && <Ionicons name="checkmark-circle" size={14} color={cores.sucesso} />}
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
            <Ionicons name={item.icon as any} size={22} color={cores.branco} />
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={cores.cinza} />
          </TouchableOpacity>
        ))}

        {/* R4: Admin área — só visível para admins */}
        {user?.tipo_conta === 'admin' && (
          <View style={styles.adminSection}>
            <Text style={styles.adminSectionLabel}>Administrador</Text>
            <TouchableOpacity
              style={[styles.menuItem, styles.adminItem]}
              onPress={() => router.push('/admin/moderacao')}
            >
              <Ionicons name="shield-checkmark" size={22} color={cores.laranja} />
              <Text style={[styles.menuLabel, { color: cores.laranja }]}>Moderação</Text>
              <Ionicons name="chevron-forward" size={18} color={cores.laranja} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.menuItem, styles.adminItem, { borderColor: cores.roxoClaro }]}
              onPress={() => router.push('/admin/dashboard')}
            >
              <Ionicons name="stats-chart" size={22} color={cores.roxoClaro} />
              <Text style={[styles.menuLabel, { color: cores.roxoClaro }]}>Dashboard Analítico</Text>
              <Ionicons name="chevron-forward" size={18} color={cores.roxoClaro} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color={cores.erro} />
        <Text style={styles.logoutText}>Sair</Text>
      </TouchableOpacity>

      <Text style={styles.version}>AGORA v1.0.0</Text>
    </ScrollView>
  );
}

function createStyles(cores: Cores) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: cores.background, paddingTop: 60 },
    scrollContent: { paddingHorizontal: SPACING.lg, paddingBottom: 100 },
    titulo: { fontSize: FONT_SIZE.xxl, fontWeight: 'bold', color: cores.branco, marginBottom: SPACING.lg },

    avatarSection: { alignItems: 'center', marginBottom: SPACING.lg, gap: SPACING.sm },
    userName: { color: cores.branco, fontSize: FONT_SIZE.lg, fontWeight: 'bold', marginTop: 4 },
    userHandle: { color: cores.cinzaClaro, fontSize: FONT_SIZE.sm, marginTop: 4 },
    tipoBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm, backgroundColor: cores.backgroundCard, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs },
    tipoBadgeText: { color: cores.cinzaClaro, fontSize: FONT_SIZE.xs },

    statsRow: { flexDirection: 'row', backgroundColor: cores.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg, justifyContent: 'space-around', alignItems: 'center' },
    statItem: { alignItems: 'center', flex: 1 },
    statValue: { color: cores.branco, fontSize: FONT_SIZE.xl, fontWeight: 'bold' },
    statLabel: { color: cores.cinzaClaro, fontSize: FONT_SIZE.xs, marginTop: 2 },
    statDivider: { width: 1, height: 32, backgroundColor: cores.border },

    menu: { gap: 4 },
    menuItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: cores.backgroundCard, borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.md },
    adminItem: { borderWidth: 1, borderColor: cores.laranja, marginTop: 4 },
    adminSection: { marginTop: SPACING.md, gap: 4 },
    adminSectionLabel: { color: cores.cinzaClaro, fontSize: FONT_SIZE.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
    menuLabel: { flex: 1, color: cores.branco, fontSize: FONT_SIZE.md },

    logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.xl, padding: SPACING.md },
    logoutText: { color: cores.erro, fontSize: FONT_SIZE.md, fontWeight: '600' },

    version: { color: cores.cinza, fontSize: FONT_SIZE.xs, textAlign: 'center', marginTop: SPACING.md },
  });
}
