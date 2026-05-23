/**
 * app.config.js — Configuração dinâmica do Expo
 *
 * Lê app.json como base e injeta variáveis de ambiente em tempo de build.
 * Necessário porque app.json é estático e não suporta process.env diretamente.
 *
 * Variáveis necessárias no .env (ou nos segredos do EAS):
 *   EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...   → Maps SDK for Android
 *
 * Passos no Google Cloud Console:
 *   1. console.cloud.google.com → selecione/crie o projeto AGORA
 *   2. APIs & Services → Library → habilite "Maps SDK for Android"
 *   3. APIs & Services → Credentials → "+ Create Credentials" → API Key
 *   4. Restrinja por App Android: SHA-1 + package com.agora.app
 *   5. Cole a chave em EXPO_PUBLIC_GOOGLE_MAPS_API_KEY no .env
 */

const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

module.exports = ({ config }) => ({
  ...config,

  // ── Android: injeta a API key do Google Maps ──────────────────────
  android: {
    ...config.android,
    config: {
      ...(config.android?.config ?? {}),
      googleMaps: {
        // Chave criada em: Google Cloud Console → APIs & Services → Credentials
        // APIs necessárias: Maps SDK for Android
        // Restrição recomendada: SHA-1 do certificado de produção EAS
        apiKey: GOOGLE_MAPS_KEY,
      },
    },
  },

  // ── Extra: expõe ao app via Constants.expoConfig.extra ────────────
  extra: {
    ...(config.extra ?? {}),
    googleMapsApiKey: GOOGLE_MAPS_KEY,
  },
});
