(() => {
const DEFAULT_TEAM = ["Viviane", "Daniel", "Ana", "Raíssa"];
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
});

function dateKey(now = new Date()) {
  const parts = dayFormatter.formatToParts(now);
  return ["year", "month", "day"].map(type => parts.find(p => p.type === type).value).join("-");
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T12:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function cutCount(day, name) {
  return Object.hasOwn(day.counts, name) ? day.counts[name] : 0;
}

function totalCuts(day) {
  return Object.values(day?.counts || {}).reduce((sum, count) => sum + count, 0);
}

function recordedNames(day) {
  return day ? [...day.team, ...Object.keys(day.counts).filter(name => !day.team.includes(name) && cutCount(day, name) > 0)] : [];
}

function createDay(date, team) {
  return { date, team: [...team], currentIndex: 0, counts: Object.fromEntries(team.map(name => [name, 0])), cuts: [] };
}

function normalizeState(saved) {
  if (saved !== null && saved !== undefined && (typeof saved !== "object" || Array.isArray(saved) || !Array.isArray(saved.professionals) || !saved.professionals.length)) {
    throw new Error("Formato dos registros inválido.");
  }
  const professionals = Array.isArray(saved?.professionals) ? [...new Set(saved.professionals.filter(name => typeof name === "string" && name.trim()))] : [];
  const state = { professionals: professionals.length ? professionals : [...DEFAULT_TEAM], days: {} };
  for (const [date, value] of Object.entries(saved?.days || {})) {
    if (!validDate(date) || !value || typeof value !== "object") continue;
    const team = Array.isArray(value.team) && value.team.length ? value.team.filter(name => typeof name === "string" && name.trim()) : [...state.professionals];
    const day = createDay(date, team.length ? team : state.professionals);
    day.currentIndex = Number.isInteger(value.currentIndex) && value.currentIndex >= 0 ? value.currentIndex % day.team.length : 0;
    day.counts = Object.fromEntries([...day.team.map(name => [name, 0]), ...Object.entries(value.counts || {}).filter(([name, count]) => name && Number.isSafeInteger(count) && count >= 0)]);
    day.cuts = Array.isArray(value.cuts) ? value.cuts.filter(cut => typeof cut?.name === "string" && Number.isFinite(Date.parse(cut.at))) : [];
    state.days[date] = day;
  }
  return state;
}

function personAt(day, offset = 0) {
  return day.team[((day.currentIndex + offset) % day.team.length + day.team.length) % day.team.length];
}

function registerCut(day, now = new Date()) {
  if (day.date !== dateKey(now)) throw new Error("Só é possível registrar cortes no dia de hoje.");
  const name = personAt(day);
  Object.defineProperty(day.counts, name, { value: cutCount(day, name) + 1, enumerable: true, configurable: true, writable: true });
  day.cuts.push({ name, at: now.toISOString() });
  day.currentIndex = (day.currentIndex + 1) % day.team.length;
  delete day.nextIndex;
  return name;
}

function skipTurn(day, now = new Date()) {
  if (day.date !== dateKey(now)) throw new Error("Só é possível pular a vez no dia de hoje.");
  const name = personAt(day);
  day.currentIndex = (day.currentIndex + 1) % day.team.length;
  return name;
}

function updateTeam(state, date, rows) {
  const names = rows.map(row => row.name.trim());
  if (!names.length || names.some(name => !name)) throw new Error("Preencha os nomes e mantenha pelo menos um profissional.");
  if (names.some(name => name.length > 40)) throw new Error("Use até 40 caracteres por nome.");
  if (new Set(names.map(name => name.toLocaleLowerCase("pt-BR"))).size !== names.length) throw new Error("Use um nome diferente para cada profissional.");
  const day = state.days[date] ||= createDay(date, state.professionals);
  const current = personAt(day);
  const renamed = new Map(rows.filter(row => row.original).map(row => [row.original, row.name.trim()]));
  const counts = new Map();
  for (const [name, count] of Object.entries(day.counts)) {
    const target = renamed.get(name) || name;
    counts.set(target, (counts.get(target) || 0) + count);
  }
  day.counts = Object.fromEntries(counts);
  day.cuts = day.cuts.map(cut => ({ ...cut, name: renamed.get(cut.name) || cut.name }));
  day.team = [...names];
  day.currentIndex = Math.max(0, names.indexOf(renamed.get(current) || current));
  state.professionals = [...names];
}

  globalThis.RodizioModel = Object.freeze({ dateKey, validDate, cutCount, totalCuts, recordedNames, createDay, normalizeState, personAt, registerCut, skipTurn, updateTeam });
})();
