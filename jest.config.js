/**
 * jest.config.js
 *
 * Configuração Jest para o projeto AGORA.
 * Preset: jest-expo (gerencia Babel/TS para Expo SDK 54).
 * Environment: jsdom (necessário para window, sessionStorage, addEventListener).
 *
 * Alias @/ → raiz do projeto (espelha tsconfig.json paths).
 */

module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'jsdom',

  // Resolve o alias @/ → ./ (igual ao tsconfig.json)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },

  // Arquivos de teste reconhecidos
  testMatch: [
    '**/__tests__/**/*.test.{ts,tsx}',
    '**/*.test.{ts,tsx}',
  ],

  // Exclui Edge Functions Deno (incompatíveis com Jest — têm seu próprio runner: deno test)
  testPathIgnorePatterns: [
    '/node_modules/',
    '/supabase/functions/',
  ],

  // Exclui node_modules (exceto módulos que precisam ser transformados)
  transformIgnorePatterns: [
    'node_modules/(?!(' +
      '(jest-)?react-native' +
      '|@react-native(-community)?' +
      '|expo(nent)?' +
      '|@expo(nent)?/(?!hooks)' +
      '|@expo-google-fonts' +
      '|react-navigation' +
      '|@react-navigation/.*' +
      '|@unimodules/.*' +
      '|unimodules' +
      '|sentry-expo' +
      '|native-base' +
      '|react-native-svg' +
      '|react-native-maps' +
      '|@supabase' +
    '))',
  ],

  // Cobertura: apenas código-fonte de services e utils
  collectCoverageFrom: [
    'services/**/*.ts',
    'contexts/**/*.tsx',
    '!**/__tests__/**',
    '!**/node_modules/**',
  ],

  // Thresholds mínimos de cobertura (aumentar progressivamente)
  coverageThreshold: {
    global: {
      branches:   75,
      functions:  85,
      lines:      85,
      statements: 85,
    },
  },

  coverageReporters: ['text', 'lcov', 'html'],
};
