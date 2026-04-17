import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { CORES } from '@/constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: CORES.laranja,
        tabBarInactiveTintColor: CORES.cinza,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
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
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: CORES.backgroundCard,
    borderTopWidth: 0,
    height: Platform.OS === 'web' ? 64 : 80,
    paddingBottom: Platform.OS === 'web' ? 8 : 20,
    paddingTop: 8,
    elevation: 0,
    shadowOpacity: 0,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
