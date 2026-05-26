/**
 * metro.config.js
 *
 * Configuração do Metro Bundler para o projeto AGORA.
 *
 * Otimizações para web (plataforma browser):
 *  1. Stub de módulos nativos que não têm função no browser —
 *     elimina código morto do bundle de produção.
 *  2. inlineRequires: true — módulos são avaliados somente na primeira vez
 *     que são chamados (lazy evaluation), acelerando o tempo de startup.
 *
 * Referência:
 *   https://docs.expo.dev/guides/customizing-metro/
 *   https://metrobundler.dev/docs/configuration
 */

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ── Stub de módulos nativos no web ─────────────────────────────────────────
//
// Pacotes listados aqui são substituídos por um módulo vazio quando Metro
// está gerando o bundle web. Isso remove código nativo que nunca executa
// no browser, reduzindo o tamanho do bundle.
//
// REGRA: só adicionar aqui pacotes cujas APIs são 100% no-op no browser
// (garantia: o app já guarda todos os usos com `Platform.OS !== 'web'`).

const WEB_STUBS = {
  // Haptics — vibração, silenciado no browser (não é importado explicitamente
  // no código, mas pode aparecer como dependência transitiva de libs de UI)
  'expo-haptics': path.resolve(__dirname, 'stubs/noop.js'),

  // Worklets — runtime de animações nativas (Reanimated/Skia).
  // O react-native-reanimated tem sua própria versão web; o pacote standalone
  // react-native-worklets é um pull-in transitivo nativo desnecessário no web.
  'react-native-worklets': path.resolve(__dirname, 'stubs/noop.js'),
};

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Aplica stubs APENAS no bundle web
  if (platform === 'web' && WEB_STUBS[moduleName]) {
    return {
      type: 'sourceFile',
      filePath: WEB_STUBS[moduleName],
    };
  }
  // Delega para o resolver padrão do Expo
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// ── inlineRequires: lazy evaluation de módulos ─────────────────────────────
//
// Com inlineRequires ativado, require() de módulos não usados na inicialização
// são adiados para o momento do primeiro uso real — reduz o tempo de parse/exec
// do bundle na primeira visita ao app.
//
// O Expo já ativa isso em produção por padrão, mas declarar explicitamente
// garante o comportamento mesmo em builds personalizados.

config.transformer = {
  ...config.transformer,
  inlineRequires: true,
};

module.exports = config;
