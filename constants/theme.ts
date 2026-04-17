import { Platform } from 'react-native';

export const CORES = {
  background: '#1A0B2E',
  backgroundCard: '#2D1B4E',
  backgroundInput: '#1E1233',
  roxo: '#6A32C9',
  roxoClaro: '#8B5CF6',
  roxoGradientStart: '#7C3AED',
  roxoGradientEnd: '#5B21B6',
  laranja: '#FF7A00',
  laranjaClaro: '#FF9A33',
  branco: '#FFFFFF',
  cinzaClaro: '#A0A0B0',
  cinza: '#666680',
  preto: '#000000',
  overlay: 'rgba(0,0,0,0.6)',
  border: '#3D2B5E',
  sucesso: '#22C55E',
  erro: '#EF4444',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const FONT_SIZE = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  hero: 36,
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
