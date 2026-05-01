/**
 * ImageUpload — componente reutilizável de seleção + upload de imagem.
 *
 * Funciona em:
 *   - Web:    input[type=file] nativo do browser
 *   - Native: expo-image-picker (requer `npx expo install expo-image-picker`)
 *
 * Props:
 *   bucket    — 'avatares' | 'eventos' | 'produtos'
 *   caminho   — path dentro do bucket ex: "userId/evento.jpg"
 *   urlAtual  — URL existente para preview inicial (opcional)
 *   onUpload  — callback chamado com a URL pública após upload bem-sucedido
 *   shape     — 'circle' (avatar) | 'rect' (evento/produto)
 *   width/height — dimensões da área de preview
 *   placeholder  — texto fallback (ex: inicial do nome)
 *   label        — texto do botão (padrão: "Adicionar foto")
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { storageService, type BucketName } from '@/services/storage';

// Importação dinâmica de expo-image-picker (nativo)
let ImagePickerLib: typeof import('expo-image-picker') | null = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ImagePickerLib = require('expo-image-picker');
  } catch {
    // expo-image-picker não instalado — funciona na web de qualquer forma
  }
}

// ─────────────────────────────────────────────────────────

interface Props {
  bucket: BucketName;
  caminho: string;
  urlAtual?: string;
  onUpload: (url: string) => void;
  shape?: 'circle' | 'rect';
  width?: number;
  height?: number;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
}

export default function ImageUpload({
  bucket,
  caminho,
  urlAtual,
  onUpload,
  shape = 'rect',
  width = 120,
  height = 120,
  placeholder,
  label = 'Adicionar foto',
  disabled = false,
}: Props) {
  const [preview, setPreview] = useState<string | undefined>(urlAtual);
  const [uploading, setUploading] = useState(false);
  const [erro, setErro] = useState('');

  const borderRadius = shape === 'circle' ? width / 2 : RADIUS.lg;

  // ── Seletor cross-platform ────────────────────────────

  const abrirSeletor = async () => {
    if (disabled || uploading) return;
    setErro('');

    if (Platform.OS === 'web') {
      await selecionarWeb();
    } else {
      await selecionarNativo();
    }
  };

  const selecionarWeb = () =>
    new Promise<void>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp';

      input.onchange = async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) { resolve(); return; }

        if (file.size > 10 * 1024 * 1024) {
          setErro('Imagem muito grande (máx. 10 MB).');
          resolve();
          return;
        }

        const uri = URL.createObjectURL(file);
        setPreview(uri);
        await realizarUpload(uri, undefined, file.type);
        resolve();
      };

      input.oncancel = () => resolve();
      input.click();
    });

  const selecionarNativo = async () => {
    if (!ImagePickerLib) {
      setErro('expo-image-picker não disponível. Execute: npx expo install expo-image-picker');
      return;
    }

    const { status } = await ImagePickerLib.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setErro('Permissão de galeria negada. Verifique as configurações do dispositivo.');
      return;
    }

    const result = await ImagePickerLib.launchImageLibraryAsync({
      mediaTypes: ImagePickerLib.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: shape === 'circle' ? [1, 1] : [4, 3],
      quality: 0.82,
      base64: false,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    setPreview(asset.uri);
    await realizarUpload(asset.uri, undefined, asset.mimeType ?? 'image/jpeg');
  };

  // ── Upload ────────────────────────────────────────────

  const realizarUpload = async (
    uri?: string,
    base64?: string,
    mimeType?: string,
  ) => {
    setUploading(true);
    try {
      const { url } = await storageService.upload(bucket, caminho, {
        uri,
        base64,
        mimeType,
      });
      onUpload(url);
    } catch (e: any) {
      setErro(e.message ?? 'Erro no upload. Tente novamente.');
    } finally {
      setUploading(false);
    }
  };

  // ── Render ────────────────────────────────────────────

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        onPress={abrirSeletor}
        disabled={disabled || uploading}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View style={[styles.imageBox, { width, height, borderRadius }]}>
          {/* Preview */}
          {preview ? (
            <Image
              source={{ uri: preview }}
              style={{ width, height, borderRadius }}
              contentFit="cover"
              transition={250}
            />
          ) : (
            <View style={[styles.placeholderBox, { width, height, borderRadius }]}>
              {placeholder ? (
                <Text style={styles.placeholderLetra}>{placeholder}</Text>
              ) : (
                <Ionicons name="image-outline" size={36} color={CORES.cinza} />
              )}
            </View>
          )}

          {/* Loading overlay */}
          {uploading && (
            <View style={[styles.overlay, { borderRadius }]}>
              <ActivityIndicator size="small" color={CORES.branco} />
              <Text style={styles.overlayText}>Enviando...</Text>
            </View>
          )}

          {/* Ícone de câmera */}
          {!uploading && (
            <View
              style={[
                styles.cameraBadge,
                shape === 'circle' ? styles.cameraBadgeCircle : styles.cameraBadgeRect,
              ]}
            >
              <Ionicons name="camera" size={13} color={CORES.branco} />
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Label abaixo */}
      {!preview && (
        <Text style={styles.labelText}>{label}</Text>
      )}
      {preview && !uploading && (
        <TouchableOpacity onPress={abrirSeletor} style={styles.trocarBtn}>
          <Ionicons name="pencil-outline" size={13} color={CORES.roxoClaro} />
          <Text style={styles.trocarText}>Alterar</Text>
        </TouchableOpacity>
      )}

      {/* Erro */}
      {!!erro && <Text style={styles.erroText}>{erro}</Text>}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: SPACING.xs },

  imageBox: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: CORES.backgroundCard,
  },

  placeholderBox: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: CORES.backgroundCard,
    borderWidth: 1.5,
    borderColor: CORES.border,
    borderStyle: 'dashed',
  },
  placeholderLetra: {
    fontSize: 36,
    fontWeight: 'bold',
    color: CORES.branco,
  },

  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  overlayText: {
    color: CORES.branco,
    fontSize: 11,
    fontWeight: '600',
  },

  cameraBadge: {
    position: 'absolute',
    backgroundColor: CORES.roxo,
    padding: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 3,
  },
  cameraBadgeCircle: { bottom: 6, right: 6 },
  cameraBadgeRect: { bottom: 10, right: 10 },

  labelText: {
    color: CORES.cinzaClaro,
    fontSize: FONT_SIZE.xs,
    marginTop: 2,
  },
  trocarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  trocarText: {
    color: CORES.roxoClaro,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
  },

  erroText: {
    color: CORES.erro,
    fontSize: FONT_SIZE.xs,
    textAlign: 'center',
    maxWidth: 220,
  },
});
