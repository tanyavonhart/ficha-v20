// Confere se a versão aparece igual em todos os lugares.
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

const app = read('v20-automacoes.js').match(/const APP_VERSION = '([^']+)'/)?.[1];
const cache = read('service-worker.js').match(/const CACHE_VERSION = 'ficha-v20-([^']+)'/)?.[1];
const pkg = JSON.parse(read('package.json')).version;
const html = [...read('index.html').matchAll(/data-app-version[^>]*>v([\d.]+)</g)].map(m => m[1]);

const problemas = [];
if (!app) problemas.push('APP_VERSION não encontrado em v20-automacoes.js');
if (cache !== app) problemas.push(`CACHE_VERSION (${cache}) diferente de APP_VERSION (${app})`);
if (!pkg.startsWith(app)) problemas.push(`package.json (${pkg}) não combina com a versão ${app}`);
html.forEach((v, i) => { if (v !== app) problemas.push(`index.html, ocorrência ${i + 1}: v${v} em vez de v${app}`); });
if (!html.length) problemas.push('index.html não mostra a versão');

if (problemas.length) {
  console.error('Versões fora de sincronia:\n- ' + problemas.join('\n- '));
  process.exit(1);
}
console.log(`Versão ${app} consistente em todos os arquivos.`);
