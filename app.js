const { dateKey, validDate, cutCount, totalCuts, recordedNames, createDay, normalizeState, personAt, registerCut, skipTurn, updateTeam } = globalThis.RodizioModel;

const STORAGE_KEY = "sal71-rodizio-v2";
const elements = new Map();
const $ = selector => {
  if (!elements.has(selector)) elements.set(selector, document.querySelector(selector));
  return elements.get(selector);
};
let storageError = "";
let savedSnapshot = null;
let state = loadState();
let selectedDate = dateKey();
let activeTab = "attendance";
const tabNames = ["attendance", "summary", "history"];
let observedToday = selectedDate;
let isSpinning = false;
let toastTimer;
let draftRows = [];
const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
const timeFormatter = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", timeZone: "UTC" });
const formatTime = value => timeFormatter.format(new Date(value));
const formatDate = value => dateFormatter.format(new Date(value + "T12:00:00Z"));

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const loaded = normalizeState(raw ? JSON.parse(raw) : null);
    savedSnapshot = raw;
    storageError = "";
    return loaded;
  } catch {
    storageError = "Não foi possível ler os registros. Reabra a página com o armazenamento do navegador disponível.";
    return normalizeState(null);
  }
}
function activeDay() { const today = dateKey(); return state.days[today] || createDay(today, state.professionals); }
function commit(nextState) {
  if (storageError) return false;
  try {
    if (localStorage.getItem(STORAGE_KEY) !== savedSnapshot) {
      state = loadState();
      if ($("#settingsDialog").open) $("#settingsDialog").close();
      render();
      showToast("Os dados mudaram em outra aba. Confira a vez atual e tente novamente.");
      return false;
    }
    const serialized = JSON.stringify(nextState);
    localStorage.setItem(STORAGE_KEY, serialized);
    savedSnapshot = serialized;
    state = nextState;
    return true;
  } catch {
    showToast("Não foi possível salvar. Nenhuma alteração foi aplicada. Verifique o espaço e o armazenamento do navegador.");
    $("#saveStatus").textContent = "Falha ao salvar";
    return false;
  }
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
function showToast(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 4200);
}
function renderReel(day) {
  const rotor = $("#reelRotor");
  rotor.style.transition = "none";
  rotor.style.transform = "translateZ(-152px) rotateX(0deg)";
  rotor.innerHTML = Array.from({ length: 10 }, (_, index) => {
    const offset = index - 4;
    const position = (day.currentIndex + offset + day.team.length * 10) % day.team.length;
    return '<div class="reel-face" style="--face-angle:' + (-offset * 36) + 'deg"><span class="face-number">' + String(position + 1).padStart(2, "0") + '</span><strong>' + escapeHtml(personAt(day, offset)) + '</strong><span class="face-detail">' + (offset === 0 ? "NA VEZ" : offset === 1 ? "A SEGUIR" : "SAL 71") + '</span></div>';
  }).join("");
}
function syncControls() {
  const blocked = isSpinning || Boolean(storageError);
  const solo = activeDay().team.length < 2;
  for (const id of ["#attendButton", "#settingsButton", "#resetButton"]) $(id).disabled = blocked;
  $("#skipButton").disabled = blocked || solo;
  $("#skipHint").textContent = solo ? "Adicione outro profissional para poder pular a vez." : "Indisponível agora? Pule a vez sem registrar um corte.";
  $("#recordDate").disabled = isSpinning;
  for (const name of tabNames) $("#tab-" + name).disabled = isSpinning;
  $("#attendLabel").textContent = isSpinning ? "Passando a vez…" : "Registrar corte";
  $("#attendHint").textContent = "Concluir e passar a vez";
  $("#reelShell").classList.toggle("is-spinning", isSpinning);
  $("#reelShell").setAttribute("aria-busy", String(isSpinning));
}
function render() {
  const day = activeDay();
  const current = personAt(day), next = personAt(day, 1);
  $("#dayLabel").textContent = "Hoje";
  $("#dayDetail").textContent = formatDate(day.date);
  $("#storageNotice").hidden = !storageError;
  $("#storageNotice").textContent = storageError;
  $("#currentName").textContent = current;
  $("#currentCount").textContent = cutCount(day, current);
  $("#currentStatus").textContent = "Na vez";
  $("#reelLabel").textContent = "PROFISSIONAL DA VEZ";
  $("#nextName").textContent = next;
  $("#nextHint").textContent = day.team.length === 1 ? "Único profissional da equipe" : "Na sequência do atendimento";
  $("#nextPosition").textContent = String((day.currentIndex + 1) % day.team.length + 1).padStart(2, "0");
  $("#turnNumber").textContent = String(day.currentIndex + 1).padStart(2, "0") + " / " + String(day.team.length).padStart(2, "0");
  $("#totalCuts").textContent = totalCuts(day);
  $("#teamSize").textContent = day.team.length;
  $("#lastCut").textContent = day.cuts.length ? formatTime(day.cuts.at(-1).at) : "—";
  renderReel(day);
  const names = recordedNames(day);
  $("#summaryList").innerHTML = names.map((name, index) => {
    const currentRow = index === day.currentIndex, nextRow = index === (day.currentIndex + 1) % day.team.length;
    const label = currentRow ? "Na vez" : nextRow ? "Próximo" : index >= day.team.length ? "Fora da equipe" : "";
    return '<div class="summary-item' + (currentRow ? ' current' : '') + '"><span class="rank">' + (index < day.team.length ? String(index + 1).padStart(2, "0") : "—") + '</span><div class="person-info"><strong>' + escapeHtml(name) + '</strong>' + (label ? '<span>' + label + '</span>' : '') + '</div><strong class="cut-count">' + cutCount(day, name) + '</strong></div>';
  }).join("");
  renderHistory();
  $("#saveStatus").textContent = storageError ? "Armazenamento indisponível" : "Salvo neste navegador";
  syncControls();
}
function renderHistory() {
  const day = state.days[selectedDate];
  const cuts = day?.cuts || [];
  const total = totalCuts(day);
  const dates = Object.keys(state.days).sort().reverse();
  $("#recordDate").value = selectedDate;
  $("#recordDate").max = dateKey();
  $("#historyDateTitle").textContent = formatDate(selectedDate) + " de " + selectedDate.slice(0, 4);
  $("#historyTotal").textContent = total;
  $("#historyCount").textContent = cuts.length + (cuts.length === 1 ? " atendimento" : " atendimentos");
  $("#savedDaysCount").textContent = dates.length;
  $("#savedDaysList").innerHTML = dates.length ? dates.map(date => {
    const count = totalCuts(state.days[date]);
    return '<button type="button" class="saved-day" data-date="' + date + '" aria-pressed="' + (date === selectedDate) + '"><span><strong>' + (date === dateKey() ? "Hoje" : formatDate(date)) + '</strong><small>' + date.split("-").reverse().join("/") + '</small></span><span class="saved-day-count">' + count + (count === 1 ? " corte" : " cortes") + '</span></button>';
  }).join("") : '<p class="archive-empty">Seus dias aparecerão aqui conforme você usar o rodízio.</p>';
  const names = recordedNames(day);
  $("#historySummary").innerHTML = names.length ? names.map(name => '<div class="archive-person"><strong>' + escapeHtml(name) + '</strong><span class="cut-count">' + cutCount(day, name) + '</span></div>').join("") : '<p class="archive-empty">Nenhum registro salvo para esta data.</p>';
  $("#historyList").innerHTML = cuts.length ? [...cuts].reverse().map(cut => '<div class="history-item"><span class="history-check" aria-hidden="true">✓</span><div><strong>' + escapeHtml(cut.name) + '</strong><span>Corte concluído</span></div><time datetime="' + escapeHtml(cut.at) + '">' + formatTime(cut.at) + '</time></div>').join("") : '<div class="empty-state"><span aria-hidden="true">—</span><strong>Nenhum corte nesta data.</strong><p>Selecione outro dia ou registre um atendimento na aba Atendimento.</p></div>';
}
function selectTab(name, focus = false) {
  if (isSpinning || !tabNames.includes(name)) return;
  activeTab = name;
  for (const tabName of tabNames) {
    const active = tabName === name;
    $("#tab-" + tabName).setAttribute("aria-selected", String(active));
    $("#tab-" + tabName).tabIndex = active ? 0 : -1;
    $("#panel-" + tabName).hidden = !active;
  }
  checkNewDay();
  if (name === "history") renderHistory();
  if (focus) $("#tab-" + name).focus();
}
for (const [index, name] of tabNames.entries()) {
  $("#tab-" + name).addEventListener("click", () => selectTab(name));
  $("#tab-" + name).addEventListener("keydown", event => {
    const target = { ArrowRight: (index + 1) % tabNames.length, ArrowLeft: (index + tabNames.length - 1) % tabNames.length, Home: 0, End: tabNames.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    selectTab(tabNames[target], true);
  });
}
function checkNewDay() {
  const today = dateKey();
  if (today === observedToday) return false;
  if (selectedDate === observedToday) selectedDate = today;
  observedToday = today;
  if (!isSpinning) render();
  return true;
}
async function advanceReel() {
  if (motion.matches) return;
  const rotor = $("#reelRotor");
  // The center moves upward by exactly one face, bringing the next person forward.
  const animation = rotor.animate([
    { transform: "translateZ(-152px) rotateX(0deg)" },
    { transform: "translateZ(-152px) rotateX(36deg)" }
  ], { duration: 1100, easing: "cubic-bezier(.22,.72,.16,1)", fill: "forwards" });
  try { await animation.finished; } finally { animation.cancel(); }
}
async function advanceTurn(skip = false) {
  if (isSpinning || storageError) return;
  if (checkNewDay()) { showToast("Um novo dia começou. Confira a equipe e tente novamente."); return; }
  if (activeTab !== "attendance") return;
  if (skip && activeDay().team.length < 2) return;
  const nextState = structuredClone(state);
  const now = new Date();
  const today = dateKey(now);
  const day = nextState.days[today] ||= createDay(today, nextState.professionals);
  const name = skip ? skipTurn(day, now) : registerCut(day, now);
  if (!commit(nextState)) return;
  isSpinning = true;
  syncControls();
  try { await advanceReel(); } catch { /* The saved turn remains valid if animation is unavailable. */ }
  finally {
    isSpinning = false;
    render();
    try {
      if (!motion.matches && $("#nextCard").animate) $("#nextCard").animate([{ opacity: .55, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 350, easing: "ease-out" });
    } catch { /* Visual effects must not interrupt a saved action. */ }
    showToast((skip ? "Vez de " + name + " pulada, sem registrar corte." : "Corte de " + name + " registrado.") + " Agora é a vez de " + personAt(activeDay()) + ".");
  }
}
$("#attendButton").addEventListener("click", () => advanceTurn());
$("#skipButton").addEventListener("click", () => advanceTurn(true));
$("#recordDate").addEventListener("change", event => {
  if (isSpinning) return;
  const date = event.target.value;
  if (!validDate(date) || date > dateKey()) { event.target.value = selectedDate; return; }
  selectedDate = date;
  renderHistory();
});
$("#todayButton").addEventListener("click", () => { if (isSpinning) return; selectedDate = dateKey(); renderHistory(); });
$("#viewTodayHistory").addEventListener("click", () => { if (isSpinning) return; selectedDate = dateKey(); selectTab("history", true); });
$("#savedDaysList").addEventListener("click", event => {
  if (isSpinning) return;
  const button = event.target.closest("button[data-date]");
  if (!button || !state.days[button.dataset.date]) return;
  selectedDate = button.dataset.date;
  renderHistory();
  $("#recordDate").focus();
});
function renderNameFields(focusIndex = -1) {
  $("#nameFields").replaceChildren();
  draftRows.forEach((person, index) => {
    const row = document.createElement("div");
    row.className = "name-row";
    const position = document.createElement("span");
    position.className = "field-position";
    position.textContent = String(index + 1).padStart(2, "0");
    const input = document.createElement("input");
    input.value = person.name;
    input.maxLength = 40;
    input.required = true;
    input.placeholder = "Nome do profissional";
    input.setAttribute("aria-label", "Profissional " + (index + 1));
    input.addEventListener("input", () => { person.name = input.value; });
    row.append(position, input);
    for (const [label, symbol, delta] of [["Mover para cima", "↑", -1], ["Mover para baixo", "↓", 1], ["Remover profissional", "×", 0]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "row-action";
      button.textContent = symbol;
      button.setAttribute("aria-label", label + " " + (person.name || index + 1));
      button.disabled = delta === -1 ? index === 0 : delta === 1 ? index === draftRows.length - 1 : draftRows.length === 1;
      button.addEventListener("click", () => {
        if (delta) [draftRows[index], draftRows[index + delta]] = [draftRows[index + delta], draftRows[index]];
        else draftRows.splice(index, 1);
        renderNameFields(Math.max(0, Math.min(draftRows.length - 1, index + delta)));
      });
      row.append(button);
    }
    $("#nameFields").append(row);
    if (focusIndex === index) input.focus();
  });
}
$("#settingsButton").addEventListener("click", () => {
  if (isSpinning) return;
  draftRows = state.professionals.map(name => ({ original: name, name }));
  $("#teamError").textContent = "";
  renderNameFields();
  $("#settingsDialog").showModal();
});
for (const id of ["#closeSettings", "#cancelButton"]) $(id).addEventListener("click", () => $("#settingsDialog").close());
$("#addNameButton").addEventListener("click", () => { draftRows.push({ original: null, name: "" }); renderNameFields(draftRows.length - 1); });
$("#teamForm").addEventListener("submit", event => {
  event.preventDefault();
  if (isSpinning) return;
  if (checkNewDay()) { $("#settingsDialog").close(); showToast("Um novo dia começou. Abra a edição da equipe novamente."); return; }
  try {
    const nextState = structuredClone(state);
    updateTeam(nextState, dateKey(), draftRows);
    if (!commit(nextState)) return;
    $("#settingsDialog").close();
    render();
    showToast("Equipe salva. O rodízio segue a ordem da lista.");
  } catch (error) { $("#teamError").textContent = error.message; }
});
$("#resetButton").addEventListener("click", () => {
  if (isSpinning || activeTab !== "summary") return;
  if (!confirm("Apagar os cortes de hoje e voltar ao primeiro profissional? Os dias anteriores serão mantidos.")) return;
  if (checkNewDay()) { showToast("Um novo dia começou. Confira o resumo antes de zerar."); return; }
  const nextState = structuredClone(state);
  nextState.days[dateKey()] = createDay(dateKey(), nextState.professionals);
  if (!commit(nextState)) return;
  render();
  showToast("Registro de hoje zerado.");
});
window.addEventListener("focus", checkNewDay);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkNewDay(); });
setInterval(checkNewDay, 30000);
window.addEventListener("storage", event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  state = loadState();
  if ($("#settingsDialog").open) { $("#settingsDialog").close(); showToast("Equipe atualizada em outra aba. Abra a edição novamente."); }
  if (!isSpinning) render();
});
selectTab("attendance");
render();
