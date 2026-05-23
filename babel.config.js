/**
 * babel.config.js
 *
 * Configuração Babel para o projeto AGORA.
 * Preset base: babel-preset-expo (cuida de TS, JSX, React Native e Expo SDK).
 *
 * Em ambiente de teste (envName = 'test'), adiciona
 * @babel/plugin-transform-modules-commonjs para garantir que dynamic import()
 * seja convertido para require(), permitindo que jest.mock() intercepte
 * chamadas como `await import('expo-notifications')` em services/*.ts.
 */

module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],

    env: {
      test: {
        plugins: [
          // Converte import() dinâmico para require() no ambiente Jest/Node.js,
          // possibilitando mock via jest.mock() / jest.doMock().
          ['@babel/plugin-transform-modules-commonjs', { allowTopLevelThis: true }],
        ],
      },
    },
  };
};
