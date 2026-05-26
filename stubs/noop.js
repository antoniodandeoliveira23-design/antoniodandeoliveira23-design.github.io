/**
 * stubs/noop.js
 *
 * Módulo vazio usado pelo metro.config.js para substituir bibliotecas
 * nativas que não têm função alguma no browser (plataforma web).
 *
 * Exporta um objeto vazio e um Proxy que absorve qualquer acesso de propriedade
 * sem lançar erros, evitando crashes caso o código leia algo do módulo.
 */

const noop = () => {};
const noopAsync = () => Promise.resolve();

const stub = new Proxy(
  {},
  {
    get: (_target, prop) => {
      // Permite desestruturação: const { X } = require('modulo-nativo')
      if (prop === '__esModule') return true;
      if (prop === 'default') return stub;
      // Funções comuns retornam noop
      if (typeof prop === 'string' && (
        prop.startsWith('set') ||
        prop.startsWith('get') ||
        prop.startsWith('register') ||
        prop.startsWith('remove') ||
        prop.startsWith('add') ||
        prop.startsWith('cancel')
      )) return noop;
      return stub;
    },
    apply: () => noopAsync(),
  }
);

module.exports = stub;
module.exports.default = stub;
