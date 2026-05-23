#!/usr/bin/env node
/**
 * scripts/update-domain.js
 *
 * Atualiza o domínio em todos os arquivos do projeto após compra.
 *
 * Uso:
 *   node scripts/update-domain.js seudominio.com.br
 *
 * Exemplo:
 *   node scripts/update-domain.js agorapp.com.br
 *
 * O script substitui a URL atual do Vercel pela nova URL com domínio
 * nos seguintes arquivos:
 *   - public/robots.txt
 *   - public/sitemap.xml
 *   - .env (APP_URL e EXPO_PUBLIC_APP_URL)
 *   - .env.example (se existir)
 */

const fs   = require('fs');
const path = require('path');

const DOMINIO_ATUAL = 'antoniodandeoliveira23-designgithub-q4yxy93ji.vercel.app';
const URL_ATUAL     = `https://${DOMINIO_ATUAL}`;

const novoDominio = process.argv[2];

if (!novoDominio) {
  console.error('❌  Uso: node scripts/update-domain.js <novo-dominio>');
  console.error('   Exemplo: node scripts/update-domain.js agorapp.com.br');
  process.exit(1);
}

const novaUrl = `https://${novoDominio}`;

const ARQUIVOS = [
  'public/robots.txt',
  'public/sitemap.xml',
  '.env',
  '.env.example',
];

let atualizados = 0;

for (const arquivo of ARQUIVOS) {
  const caminho = path.join(__dirname, '..', arquivo);

  if (!fs.existsSync(caminho)) {
    console.log(`⏭  ${arquivo} — não encontrado, pulando`);
    continue;
  }

  const conteudo    = fs.readFileSync(caminho, 'utf8');
  const atualizado  = conteudo
    .replaceAll(URL_ATUAL,     novaUrl)
    .replaceAll(DOMINIO_ATUAL, novoDominio);

  if (conteudo === atualizado) {
    console.log(`✅  ${arquivo} — sem alterações necessárias`);
    continue;
  }

  fs.writeFileSync(caminho, atualizado, 'utf8');
  console.log(`✏️   ${arquivo} — atualizado`);
  atualizados++;
}

console.log('');
console.log(`✅  ${atualizados} arquivo(s) atualizado(s) com o domínio: ${novoDominio}`);
console.log('');
console.log('⚠️  Próximos passos:');
console.log('   1. Verifique os arquivos alterados');
console.log('   2. Atualize as variáveis de ambiente no Vercel e Supabase');
console.log('   3. Faça commit e push: git add -A && git commit -m "chore: update domain to ' + novoDominio + '"');
console.log('   4. Submeta o sitemap no Google Search Console: https://search.google.com/search-console');
