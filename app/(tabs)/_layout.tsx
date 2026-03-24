import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ 
      headerShown: false,
      tabBarActiveTintColor: '#000',
      tabBarStyle: { backgroundColor: '#FF7A00', height: 65, borderTopWidth: 0 }
    }}>
      {/*  Mostrar APENAS o seu index.tsx */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'home',
          tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color="black" />,
        }}
      />
    </Tabs>
  );
}