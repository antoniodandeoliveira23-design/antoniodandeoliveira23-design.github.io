import { CORES } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Mapeamento de cores light/dark para compatibilidade com componentes Expo padrão
const Colors = {
  light: {
    text: CORES.preto,
    background: '#fff',
    tint: CORES.roxo,
    icon: CORES.cinza,
    tabIconDefault: CORES.cinza,
    tabIconSelected: CORES.roxo,
  },
  dark: {
    text: CORES.branco,
    background: CORES.background,
    tint: CORES.roxoClaro,
    icon: CORES.cinzaClaro,
    tabIconDefault: CORES.cinzaClaro,
    tabIconSelected: CORES.roxoClaro,
  },
} as const;

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark,
) {
  const theme = useColorScheme() ?? 'light';
  const colorFromProps = props[theme];
  if (colorFromProps) return colorFromProps;
  return Colors[theme][colorName];
}
