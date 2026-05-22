import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useTema } from '@/contexts/TemaContext';
import { useChat } from '@/contexts/ChatContext';
import { useNotificacoes } from '@/contexts/NotificacoesContext';

export default function TabLayout() {
  const { totalNaoLidas } = useChat();
  const { totalNaoLidas: totalNotif } = useNotificacoes();
  const { cores } = useTema();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor:   cores.laranja,
        tabBarInactiveTintColor: cores.cinza,
        tabBarStyle: {
          backgroundColor: cores.backgroundCard,
          borderTopWidth:  0,
          borderTopColor:  cores.border,
          height:          Platform.OS === 'web' ? 64 : 80,
          paddingBottom:   Platform.OS === 'web' ? 8 : 20,
          paddingTop:      8,
          elevation:       0,
          shadowOpacity:   0,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="eventos"
        options={{
          title: 'Eventos',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="mensagens"
        options={{
          title: 'Mensagens',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={size} color={color} />
          ),
          tabBarBadge:      totalNaoLidas > 0 ? (totalNaoLidas > 9 ? '9+' : totalNaoLidas) : undefined,
          tabBarBadgeStyle: { backgroundColor: cores.laranja, fontSize: 10, minWidth: 16, height: 16, lineHeight: 16 },
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
          tabBarBadge:      totalNotif > 0 ? (totalNotif > 9 ? '9+' : totalNotif) : undefined,
          tabBarBadgeStyle: { backgroundColor: cores.roxoClaro, fontSize: 10, minWidth: 16, height: 16, lineHeight: 16 },
        }}
      />
    </Tabs>
  );
}
