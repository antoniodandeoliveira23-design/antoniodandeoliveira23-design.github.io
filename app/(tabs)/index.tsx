import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';

const CORES = {
  principal: '#6A32C9',
  background: '#1A0B2E',
  card: '#2D1B4E',
  destaque: '#FF7A00',
  texto: '#FFFFFF',
  preto: '#000000'
};

export default function App() {
  const [etapa, setEtapa] = useState('SPLASH');
  const [modalVisivel, setModalVisivel] = useState(false);
  const [itemSelecionado, setItemSelecionado] = useState<any>(null);
  const [carregando, setCarregando] = useState(false);
  
  const [dadosGlobais, setDadosGlobais] = useState<any[]>([
    { id: '1', nome: 'Exemplo Vilhena', local: 'Vilhena, RO', lat: -12.7405, lng: -60.1458 },
  ]);

  const [nomeTemp, setNomeTemp] = useState('');
  const [localTemp, setLocalTemp] = useState('');

  const cadastrarNovoItem = async () => {
    if (!nomeTemp || !localTemp) return Alert.alert("Erro", "Preencha o nome e o endereço.");
    
    setCarregando(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Erro', 'Permissão de localização negada.');
        return;
      }

      const resultado = await Location.geocodeAsync(localTemp);
      
      if (resultado && resultado.length > 0) {
        const { latitude, longitude } = resultado[0];
        const novo = {
          id: Math.random().toString(),
          nome: nomeTemp,
          local: localTemp,
          lat: latitude,
          lng: longitude
        };
        setDadosGlobais([...dadosGlobais, novo]);
        setNomeTemp(''); setLocalTemp('');
        setEtapa('PF_HOME');
      } else {
        Alert.alert("Erro", "Endereço não encontrado.");
      }
    } catch (e) {
      Alert.alert("Erro", "Falha na geolocalização.");
    } finally {
      setCarregando(false);
    }
  };

  // --- COMPONENTES DE TELA ---

  if (etapa === 'SPLASH') return (
    <View style={styles.containerCenter}>
      <Text style={styles.logoTexto}>AGORA</Text>
      <TouchableOpacity style={styles.btnLaranja} onPress={() => setEtapa('SELECAO')}>
        <Text style={styles.btnTexto}>INICIAR</Text>
      </TouchableOpacity>
    </View>
  );

  if (etapa === 'SELECAO') return (
    <View style={styles.container}>
      <Text style={styles.titulo}>ESCOLHA SEU PERFIL</Text>
      <TouchableOpacity style={styles.cardOpcao} onPress={() => setEtapa('PF_HOME')}>
        <Ionicons name="person" size={30} color={CORES.principal} />
        <Text style={styles.cardTexto}>SOU PESSOA FÍSICA</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.cardOpcao} onPress={() => setEtapa('PJ_ADD')}>
        <MaterialCommunityIcons name="office-building" size={30} color={CORES.principal} />
        <Text style={styles.cardTexto}>SOU UMA EMPRESA</Text>
      </TouchableOpacity>
    </View>
  );

  if (etapa === 'PJ_ADD') return (
    <View style={styles.container}>
      <Text style={styles.voltar} onPress={() => setEtapa('SELECAO')}>{"< Voltar"}</Text>
      <TextInput style={styles.input} placeholder="Nome do Evento" placeholderTextColor="#666" value={nomeTemp} onChangeText={setNomeTemp} />
      <TextInput style={styles.input} placeholder="Endereço (Ex: Av. Brasil, Vilhena)" placeholderTextColor="#666" value={localTemp} onChangeText={setLocalTemp} />
      <TouchableOpacity style={styles.btnLaranja} onPress={cadastrarNovoItem} disabled={carregando}>
        {carregando ? <ActivityIndicator color="#000" /> : <Text style={styles.btnTexto}>PUBLICAR EVENTO</Text>}
      </TouchableOpacity>
    </View>
  );

  if (etapa === 'PF_HOME') return (
    <View style={styles.container}>
      <Text style={styles.voltar} onPress={() => setEtapa('SELECAO')}>{"< Sair"}</Text>
      <Text style={styles.tituloEventos}>Eventos de hoje</Text>

      {/* MAPA NA TELA PRINCIPAL */}
      <View style={styles.mapaContainer}>
        {Platform.OS !== 'web' ? (
          <MapView 
            style={styles.mapaFixo} 
            initialRegion={{ latitude: -12.7405, longitude: -60.1458, latitudeDelta: 0.1, longitudeDelta: 0.1 }}
          >
            {dadosGlobais.map(item => (
              <Marker key={item.id} coordinate={{ latitude: item.lat, longitude: item.lng }} title={item.nome} />
            ))}
          </MapView>
        ) : (
          <View style={styles.placeholderMapa}><Text style={styles.textoBranco}>Mapa disponível apenas no Celular</Text></View>
        )}
      </View>

      <FlatList
        data={dadosGlobais}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.itemCard} onPress={() => { setItemSelecionado(item); setModalVisivel(true); }}>
            <Text style={styles.itemNome}>{item.nome}</Text>
            <Ionicons name="ellipsis-vertical" size={24} color="black" />
          </TouchableOpacity>
        )}
      />

      {/* MODAL COM MAPA */}
      <Modal visible={modalVisivel} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {itemSelecionado && (
              <>
                <Text style={styles.modalTitulo}>{itemSelecionado.nome}</Text>
                <Text style={styles.modalLocalTexto}>{itemSelecionado.local}</Text>
                <View style={styles.mapaDetalheContainer}>
                  {Platform.OS !== 'web' ? (
                    <MapView 
                      style={styles.mapaDetalhe} 
                      region={{ latitude: itemSelecionado.lat, longitude: itemSelecionado.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
                    >
                      <Marker coordinate={{ latitude: itemSelecionado.lat, longitude: itemSelecionado.lng }} />
                    </MapView>
                  ) : (
                    <View style={styles.placeholderMapa}><Text style={styles.textoBranco}>Mapa indisponível na Web</Text></View>
                  )}
                </View>
              </>
            )}
            <TouchableOpacity style={styles.btnLaranja} onPress={() => setModalVisivel(false)}>
              <Text style={styles.btnTexto}>FECHAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.tabBar}>
           <View style={styles.tabItem}><Ionicons name="heart" size={24} color="black" /><Text style={styles.tabText}>favoritos</Text></View>
           <View style={styles.tabItem}><Ionicons name="home" size={24} color="black" /><Text style={styles.tabText}>home</Text></View>
           <View style={styles.tabItem}><Ionicons name="chatbubble" size={24} color="black" /><Text style={styles.tabText}>mensagens</Text></View>
      </View>
    </View>
  );

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.background, padding: 20, paddingTop: 50 },
  containerCenter: { flex: 1, backgroundColor: CORES.background, justifyContent: 'center', alignItems: 'center' },
  logoTexto: { fontSize: 40, color: '#FFF', fontWeight: 'bold', marginBottom: 20 },
  titulo: { color: '#FFF', marginBottom: 20, textAlign: 'center' },
  tituloEventos: { color: CORES.principal, fontSize: 32, fontWeight: 'bold', marginBottom: 15 },
  btnLaranja: { backgroundColor: CORES.destaque, padding: 15, borderRadius: 25, alignItems: 'center', width: '100%', marginTop: 10 },
  btnTexto: { color: '#000', fontWeight: 'bold' },
  cardOpcao: { borderColor: CORES.principal, borderWidth: 2, borderRadius: 15, padding: 20, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  cardTexto: { color: '#FFF', marginLeft: 15, fontWeight: 'bold' },
  input: { backgroundColor: CORES.card, borderRadius: 10, padding: 15, color: '#FFF', marginBottom: 10 },
  mapaContainer: { height: 180, width: '100%', borderRadius: 15, overflow: 'hidden', marginBottom: 20 },
  mapaFixo: { flex: 1 },
  placeholderMapa: { flex: 1, backgroundColor: CORES.card, justifyContent: 'center', alignItems: 'center' },
  textoBranco: { color: '#FFF' },
  itemCard: { backgroundColor: CORES.principal, padding: 25, borderRadius: 35, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemNome: { color: '#000', fontSize: 24, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: CORES.card, borderRadius: 20, padding: 20 },
  modalTitulo: { color: '#FFF', fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  modalLocalTexto: { color: '#CCC', textAlign: 'center', marginBottom: 10 },
  mapaDetalheContainer: { width: '100%', height: 250, borderRadius: 15, overflow: 'hidden', marginBottom: 15 },
  mapaDetalhe: { flex: 1 },
  tabBar: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: CORES.destaque, padding: 10, position: 'absolute', bottom: 0, width: Dimensions.get('window').width, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  tabItem: { alignItems: 'center' },
  tabText: { fontSize: 12, fontWeight: 'bold' },
  voltar: { color: '#FFF', marginBottom: 15 }
});