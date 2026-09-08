const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../dist');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);

test('HTML referencia arquivos locais existentes, sem caminhos do computador', () => {
  for (const [, value] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^https:\/\//.test(value)) continue;
    assert.ok(!/^(?:[a-z]:|file:|\/)/i.test(value), value);
    assert.ok(fs.statSync(path.join(root, value)).isFile(), value);
  }
  assert.match(html, /<meta charset="UTF-8"/);
  assert.match(html, /<html lang="pt-BR"/);
  assert.ok(html.indexOf('src="rodizio.js"') < html.indexOf('src="app.js"'));
});

test('IDs, controles e referências acessíveis apontam para elementos existentes', () => {
  assert.equal(new Set(ids).size, ids.length);
  for (const [, value] of html.matchAll(/(?:aria-controls|aria-labelledby|aria-describedby)="([^"]+)"/g)) {
    for (const id of value.split(' ')) assert.ok(ids.includes(id), id);
  }
  for (const [, id] of app.matchAll(/\$\("#([\w-]+)"\)/g)) assert.ok(ids.includes(id), id);
});

test('estrutura HTML fecha todas as seções e controles corretamente', () => {
  const stack = [];
  const voidTags = new Set(['meta', 'link', 'img', 'input', 'br', 'hr']);
  for (const [tag, closing, name] of html.matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi)) {
    if (closing) assert.equal(stack.pop(), name, tag);
    else if (!voidTags.has(name)) stack.push(name);
  }
  assert.deepEqual(stack, []);
});

test('distribuição contém somente os seis arquivos necessários', () => {
  assert.deepEqual(fs.readdirSync(root).sort(), ['app.js', 'assets', 'index.html', 'rodizio.js', 'styles.css']);
  for (const name of ['sal71-logo-white.png', 'sal71-watermark.png']) {
    const data = fs.readFileSync(path.join(root, 'assets', name));
    assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  }
  assert.deepEqual(fs.readdirSync(path.join(root, 'assets')).sort(), ['sal71-logo-white.png', 'sal71-watermark.png']);
});
