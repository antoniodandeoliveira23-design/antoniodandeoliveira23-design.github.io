/**
 * app.config.js — Configuração dinâmica do Expo
 *
 * Lê app.json como base e injeta variáveis de ambiente em tempo de build.
 * Necessário porque app.json é estático e não suporta process.env diretamente.
 *
 * Para Google Maps Android funcionar, configure no Vercel / .env local:
 *   EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...
 * E habilite no Google Cloud Console:
 *   - Maps SDK for Android
 *   - Restrição por SHA-1 do certificado do app
 */

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      googleMaps: {
        // Chave criada em: Google Cloud Console → APIs & Services → Credentials
        // Habilitar: Maps SDK for Android
        // Restringir por: SHA-1 do bundle com.agora.app
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '',
      },
    },
  },
});
