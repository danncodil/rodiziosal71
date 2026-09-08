const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
require('../dist/rodizio.js');
const { createDay, normalizeState, registerCut, skipTurn, personAt, dateKey, validDate, cutCount, updateTeam } = globalThis.RodizioModel;
const now = new Date('2026-09-08T18:00:00Z');
const date = dateKey(now);

test('ordem fixa completa dois ciclos sem pular nem repetir posições', () => {
  const day = createDay(date, ['Viviane', 'Daniel', 'Ana', 'Raíssa']);
  const served = Array.from({ length: 8 }, () => registerCut(day, now));
  assert.deepEqual(served, ['Viviane', 'Daniel', 'Ana', 'Raíssa', 'Viviane', 'Daniel', 'Ana', 'Raíssa']);
  assert.deepEqual(Object.values(day.counts), [2, 2, 2, 2]);
  assert.equal(day.currentIndex, 0);
  assert.equal(day.cuts.length, 8);
});
test('migração ignora sorteio antigo e mantém contagens, horários e posição', () => {
  const saved = { professionals: ['A', 'B', 'C'], days: { [date]: { currentIndex: 1, nextIndex: 0, counts: { A: 3, B: 2 }, cuts: [{ name: 'A', at: now.toISOString() }] } } };
  const day = normalizeState(saved).days[date];
  assert.equal(personAt(day), 'B');
  assert.equal(personAt(day, 1), 'C');
  assert.equal(day.counts.A, 3);
  assert.equal(day.cuts.length, 1);
  assert.equal('nextIndex' in day, false);
});
test('equipe com uma pessoa mantém a vez e registra cada corte', () => {
  const day = createDay(date, ['Daniel']);
  registerCut(day, now); registerCut(day, now);
  assert.equal(personAt(day, 1), 'Daniel');
  assert.equal(day.counts.Daniel, 2);
});
test('não permite registrar um corte em uma data histórica', () => {
  const day = createDay('2026-09-07', ['A']);
  assert.throws(() => registerCut(day, now));
  assert.equal(day.cuts.length, 0);
});
test('dia novo começa no primeiro nome sem alterar o dia anterior', () => {
  const previous = createDay('2026-09-07', ['A', 'B']);
  registerCut(previous, new Date('2026-09-07T18:00:00Z'));
  const day = createDay(date, previous.team);
  assert.equal(personAt(day), 'A');
  assert.equal(day.counts.A, 0);
  assert.equal(previous.counts.A, 1);
  assert.equal(dateKey(new Date('2026-09-09T02:59:00Z')), '2026-09-08');
  assert.equal(dateKey(new Date('2026-09-09T03:00:00Z')), '2026-09-09');
});
test('reordenar e renomear preserva o profissional atual e os cortes; histórico permanece intacto', () => {
  const state = normalizeState({ professionals: ['A', 'B', 'C'] });
  const day = state.days[date] = createDay(date, state.professionals);
  registerCut(day, now); registerCut(day, now);
  state.days['2026-09-07'] = structuredClone(day);
  const previous = JSON.stringify(state.days['2026-09-07']);
  updateTeam(state, date, [{ original: 'C', name: 'Cris' }, { original: 'B', name: 'B' }]);
  assert.equal(personAt(day), 'Cris');
  assert.equal(personAt(day, 1), 'B');
  assert.equal(day.counts.A, 1);
  assert.equal(day.counts.B, 1);
  assert.equal(day.cuts.length, 2);
  assert.equal(JSON.stringify(state.days['2026-09-07']), previous);
  assert.throws(() => updateTeam(state, date, [{ name: 'Ana' }, { name: 'ana' }]));
});

test('pular segue a ordem e volta ao primeiro sem alterar contagens ou histórico', () => {
  const day = createDay(date, ['A', 'B', 'C']);
  registerCut(day, now);
  const counts = structuredClone(day.counts);
  const cuts = structuredClone(day.cuts);
  assert.equal(skipTurn(day, now), 'B');
  assert.equal(personAt(day), 'C');
  assert.equal(skipTurn(day, now), 'C');
  assert.equal(personAt(day), 'A');
  assert.deepEqual(day.counts, counts);
  assert.deepEqual(day.cuts, cuts);
  const historical = createDay('2026-09-07', ['A', 'B']);
  assert.throws(() => skipTurn(historical, now));
  assert.equal(historical.currentIndex, 0);
});

function appHarness({ failWrite = false, saved, reducedMotion = false, animationFailure = false, clock } = {}) {
  const elements = new Map();
  const pending = [];
  const storage = new Map();
  const windowEvents = {};
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [clock || Date.now()])); }
  }
  if (saved) storage.set('sal71-rodizio-v2', JSON.stringify(saved));
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      textContent: '', innerHTML: '', style: {}, disabled: false, hidden: false, open: false,
      classList: { add() {}, remove() {}, toggle() {} }, handlers: {}, attributes: {},
      addEventListener(type, handler) { this.handlers[type] = handler; },
      setAttribute(name, value) { this.attributes[name] = value; },
      focus() { this.focused = true; },
      animate() { if (animationFailure) throw Error('animation unavailable'); let resolve; const finished = new Promise(r => resolve = r); pending.push(resolve); return { finished, cancel() {} }; }
    });
    return elements.get(selector);
  };
  const context = vm.createContext({
    console, Date: Clock, Intl, structuredClone,
    document: { querySelector: element, addEventListener() {} },
    window: { matchMedia: () => ({ matches: reducedMotion }), addEventListener(name, handler) { windowEvents[name] = handler; } },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => { if (failWrite) throw Error('quota'); storage.set(key, value); } },
    setTimeout() {}, clearTimeout() {}, setInterval() {}, confirm: () => true
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/rodizio.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/app.js'), 'utf8'), context);
  return { element, pending, storage, windowEvents, setClock(value) { clock = value; } };
}
test('corte e avanço são salvos antes da animação; duplo clique registra uma única vez', async () => {
  const app = appHarness();
  const click = app.element('#attendButton').handlers.click;
  const running = click();
  await click();
  const saved = JSON.parse(app.storage.get('sal71-rodizio-v2'));
  const day = saved.days[dateKey()];
  assert.equal(day.cuts.length, 1);
  assert.equal(day.currentIndex, 1);
  assert.equal(app.element('#recordDate').disabled, true);
  assert.equal(app.element('#settingsButton').disabled, true);
  assert.equal(app.element('#resetButton').disabled, true);
  assert.equal(app.element('#skipButton').disabled, true);
  app.pending.shift()();
  await running;
  assert.equal(app.element('#currentName').textContent, 'Daniel');
  assert.equal(app.element('#nextName').textContent, 'Ana');
  assert.equal(app.element('#attendButton').disabled, false);
  const reload = appHarness({ saved });
  assert.equal(reload.element('#currentName').textContent, 'Daniel');
});
test('falha no armazenamento não contabiliza corte nem passa a vez', async () => {
  const app = appHarness({ failWrite: true });
  await app.element('#attendButton').handlers.click();
  assert.equal(app.storage.size, 0);
  assert.equal(app.pending.length, 0);
  assert.equal(app.element('#currentName').textContent, 'Viviane');
  assert.equal(app.element('#totalCuts').textContent, 0);
});

test('botão pular salva apenas a posição e bloqueia cliques em ambos os botões durante a animação', async () => {
  const day = createDay(dateKey(), ['A', 'B', 'C']);
  registerCut(day);
  const cuts = structuredClone(day.cuts);
  const counts = structuredClone(day.counts);
  const app = appHarness({ saved: { professionals: day.team, days: { [day.date]: day } } });
  const skip = app.element('#skipButton').handlers.click;
  const running = skip();
  assert.equal(app.element('#skipButton').disabled, true);
  assert.equal(app.element('#attendButton').disabled, true);
  await skip();
  await app.element('#attendButton').handlers.click();
  const saved = JSON.parse(app.storage.get('sal71-rodizio-v2'));
  assert.equal(saved.days[day.date].currentIndex, 2);
  assert.deepEqual(saved.days[day.date].counts, counts);
  assert.deepEqual(saved.days[day.date].cuts, cuts);
  app.pending.shift()();
  await running;
  assert.equal(app.element('#currentName').textContent, 'C');
  assert.equal(app.element('#nextName').textContent, 'A');
  assert.equal(app.element('#totalCuts').textContent, 1);
  assert.equal(app.element('#skipButton').disabled, false);
  assert.equal(appHarness({ saved }).element('#currentName').textContent, 'C');
});

test('pular não avança quando falha o salvamento ou há apenas um profissional', async () => {
  const app = appHarness({ failWrite: true });
  await app.element('#skipButton').handlers.click();
  assert.equal(app.pending.length, 0);
  assert.equal(app.element('#currentName').textContent, 'Viviane');
  assert.equal(app.storage.size, 0);
  const solo = appHarness({ saved: { professionals: ['A'], days: {} } });
  const before = solo.storage.get('sal71-rodizio-v2');
  assert.equal(solo.element('#skipButton').disabled, true);
  await solo.element('#skipButton').handlers.click();
  assert.equal(solo.storage.get('sal71-rodizio-v2'), before);
  assert.equal(solo.pending.length, 0);
});

test('abas exibem somente o painel escolhido e permitem navegação por teclado', () => {
  const app = appHarness();
  assert.equal(app.element('#panel-attendance').hidden, false);
  assert.equal(app.element('#panel-summary').hidden, true);
  assert.equal(app.element('#panel-history').hidden, true);
  app.element('#tab-summary').handlers.click();
  assert.equal(app.element('#panel-attendance').hidden, true);
  assert.equal(app.element('#panel-summary').hidden, false);
  assert.equal(app.element('#tab-summary').attributes['aria-selected'], 'true');
  assert.equal(app.element('#tab-attendance').tabIndex, -1);
  let prevented = false;
  app.element('#tab-summary').handlers.keydown({ key: 'ArrowRight', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(app.element('#panel-history').hidden, false);
  assert.equal(app.element('#panel-summary').hidden, true);
  assert.equal(app.element('#tab-history').focused, true);
  app.element('#tab-history').handlers.keydown({ key: 'Home', preventDefault() {} });
  assert.equal(app.element('#panel-attendance').hidden, false);
});

test('histórico consulta dias separados sem alterar a fila nem criar registros ao navegar', async () => {
  const previousDate = '2025-01-02';
  const previous = createDay(previousDate, ['Barbeiro antigo']);
  registerCut(previous, new Date('2025-01-02T18:00:00Z'));
  registerCut(previous, new Date('2025-01-02T19:00:00Z'));
  const today = createDay(dateKey(), ['A', 'B']);
  registerCut(today);
  const saved = { professionals: today.team, days: { [previousDate]: previous, [today.date]: today } };
  const app = appHarness({ saved });
  const originalStorage = app.storage.get('sal71-rodizio-v2');
  app.element('#tab-history').handlers.click();
  app.element('#recordDate').handlers.change({ target: { value: previousDate } });
  assert.equal(app.element('#historyTotal').textContent, 2);
  assert.match(app.element('#historySummary').innerHTML, /Barbeiro antigo/);
  assert.match(app.element('#historyList').innerHTML, /2025-01-02T18:00:00.000Z/);
  assert.match(app.element('#historyDateTitle').textContent, /2025/);
  assert.equal(app.element('#currentName').textContent, 'B');
  assert.equal(app.element('#totalCuts').textContent, 1);
  const dates = app.element('#savedDaysList').innerHTML;
  assert.ok(dates.indexOf(today.date) < dates.indexOf(previousDate));
  app.element('#recordDate').handlers.change({ target: { value: '2025-01-01' } });
  assert.equal(app.element('#historyTotal').textContent, 0);
  assert.match(app.element('#historySummary').innerHTML, /Nenhum registro/);
  assert.equal(app.storage.get('sal71-rodizio-v2'), originalStorage);
  app.element('#tab-attendance').handlers.click();
  const recording = app.element('#attendButton').handlers.click();
  // Navigation stays locked until the current transition completes.
  app.element('#tab-history').handlers.click();
  assert.equal(app.element('#panel-attendance').hidden, false);
  app.pending.shift()();
  await recording;
  const result = JSON.parse(app.storage.get('sal71-rodizio-v2'));
  assert.deepEqual(result.days[previousDate], previous);
  assert.equal(result.days[today.date].cuts.length, 2);
  assert.equal(result.days['2025-01-01'], undefined);
  const reload = appHarness({ saved: result });
  reload.element('#tab-history').handlers.click();
  reload.element('#recordDate').handlers.change({ target: { value: previousDate } });
  assert.equal(reload.element('#historyTotal').textContent, 2);
});

test('atalho abre o histórico de hoje e zerar hoje mantém os dias anteriores', () => {
  const previous = createDay('2025-01-02', ['A']);
  registerCut(previous, new Date('2025-01-02T18:00:00Z'));
  const today = createDay(dateKey(), ['A']);
  registerCut(today);
  const app = appHarness({ saved: { professionals: ['A'], days: { [previous.date]: previous, [today.date]: today } } });
  app.element('#tab-history').handlers.click();
  app.element('#savedDaysList').handlers.click({ target: { closest() { return { dataset: { date: previous.date } }; } } });
  assert.equal(app.element('#recordDate').value, previous.date);
  app.element('#tab-summary').handlers.click();
  app.element('#resetButton').handlers.click();
  const result = JSON.parse(app.storage.get('sal71-rodizio-v2'));
  assert.deepEqual(result.days[previous.date], previous);
  assert.equal(result.days[today.date].cuts.length, 0);
  app.element('#viewTodayHistory').handlers.click();
  assert.equal(app.element('#panel-history').hidden, false);
  assert.equal(app.element('#recordDate').value, today.date);
  assert.equal(app.element('#historyTotal').textContent, 0);
});

test('datas impossíveis não entram no histórico; ano bissexto é aceito', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2024-02-29'), true);
  const app = appHarness();
  const previous = app.element('#recordDate').value;
  const target = { value: '2026-02-30' };
  app.element('#recordDate').handlers.change({ target });
  assert.equal(target.value, previous);
});

test('adicionar nomes iguais a propriedades JavaScript não corrompe as contagens', () => {
  const state = normalizeState({ professionals: ['A'], days: {} });
  updateTeam(state, date, [{ original: 'A', name: 'A' }, { original: null, name: '__proto__' }, { original: null, name: 'constructor' }]);
  const day = state.days[date];
  registerCut(day, now);
  registerCut(day, now);
  registerCut(day, now);
  assert.equal(cutCount(day, '__proto__'), 1);
  assert.equal(cutCount(day, 'constructor'), 1);
  const reloaded = normalizeState(JSON.parse(JSON.stringify(state))).days[date];
  assert.equal(reloaded.counts.__proto__, 1);
  assert.equal(reloaded.counts.constructor, 1);
});

test('uma aba desatualizada recarrega os dados antes de permitir nova alteração', async () => {
  const app = appHarness();
  const remoteDay = createDay(dateKey(), ['Viviane', 'Daniel', 'Ana']);
  registerCut(remoteDay);
  const remote = JSON.stringify({ professionals: remoteDay.team, days: { [remoteDay.date]: remoteDay } });
  app.storage.set('sal71-rodizio-v2', remote);
  await app.element('#attendButton').handlers.click();
  assert.equal(app.storage.get('sal71-rodizio-v2'), remote);
  assert.equal(app.element('#currentName').textContent, 'Daniel');
  assert.equal(app.pending.length, 0);
  assert.match(app.element('#toast').textContent, /outra aba/);
});

test('dados inválidos bloqueiam gravação e uma atualização válida recupera a leitura', async () => {
  const app = appHarness({ saved: {} });
  assert.equal(app.element('#attendButton').disabled, true);
  await app.element('#skipButton').handlers.click();
  assert.equal(app.storage.get('sal71-rodizio-v2'), '{}');
  app.storage.set('sal71-rodizio-v2', JSON.stringify({ professionals: ['A'], days: {} }));
  app.windowEvents.storage({ key: 'sal71-rodizio-v2' });
  assert.equal(app.element('#attendButton').disabled, false);
  assert.equal(app.element('#storageNotice').hidden, true);
});

test('movimento reduzido salva imediatamente sem animar', async () => {
  const app = appHarness({ reducedMotion: true });
  await app.element('#attendButton').handlers.click();
  assert.equal(app.pending.length, 0);
  assert.equal(app.element('#currentName').textContent, 'Daniel');
  assert.equal(app.element('#attendButton').disabled, false);
});

test('falha da animação mantém o corte salvo, libera os botões e exibe confirmação', async () => {
  const app = appHarness({ animationFailure: true });
  await app.element('#attendButton').handlers.click();
  assert.equal(app.element('#currentName').textContent, 'Daniel');
  assert.equal(app.element('#attendButton').disabled, false);
  assert.match(app.element('#toast').textContent, /Corte de Viviane registrado/);
  assert.equal(JSON.parse(app.storage.get('sal71-rodizio-v2')).days[dateKey()].cuts.length, 1);
});

test('virada do dia preserva o histórico e pede conferir a nova fila antes de registrar', async () => {
  const firstDay = createDay('2026-09-08', ['A', 'B']);
  registerCut(firstDay, new Date('2026-09-09T02:58:00Z'));
  const saved = { professionals: firstDay.team, days: { [firstDay.date]: firstDay } };
  const app = appHarness({ saved, clock: '2026-09-09T02:59:00Z', reducedMotion: true });
  assert.equal(app.element('#currentName').textContent, 'B');
  app.setClock('2026-09-09T03:01:00Z');
  await app.element('#attendButton').handlers.click();
  assert.equal(app.element('#currentName').textContent, 'A');
  assert.equal(app.element('#totalCuts').textContent, 0);
  assert.deepEqual(JSON.parse(app.storage.get('sal71-rodizio-v2')), saved);
  await app.element('#attendButton').handlers.click();
  const result = JSON.parse(app.storage.get('sal71-rodizio-v2'));
  assert.deepEqual(result.days['2026-09-08'], firstDay);
  assert.equal(result.days['2026-09-09'].counts.A, 1);
});

test('nomes com marcação são exibidos como texto nos painéis e no histórico', () => {
  const name = '<img src=x onerror=alert(1)>';
  const day = createDay(dateKey(), [name]);
  registerCut(day);
  const app = appHarness({ saved: { professionals: [name], days: { [day.date]: day } } });
  for (const id of ['#reelRotor', '#summaryList', '#historySummary', '#historyList']) {
    assert.equal(app.element(id).innerHTML.includes(name), false);
    assert.match(app.element(id).innerHTML, /&lt;img/);
  }
});
