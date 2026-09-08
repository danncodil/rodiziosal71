const STORAGE_KEY = "sal71-rodizio-v2";
const defaultProfessionals = ["Viviane", "Daniel", "Ana", "Raíssa"];
const $ = (selector) => document.querySelector(selector);
const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
let state = loadState();
let toastTimer;

function createDay(date, professionals = state?.professionals || defaultProfessionals) {
  return { date, currentIndex: 0, counts: Object.fromEntries(professionals.map(name => [name, 0])), cuts: [] };
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.professionals?.length) return { professionals: saved.professionals, selectedDate: saved.selectedDate || todayKey(), days: saved.days || {} };
  } catch { /* novo registro */ }
  return { professionals: defaultProfessionals, selectedDate: todayKey(), days: {} };
}
function activeDay() { const key = state.selectedDate; return state.days[key] ||= createDay(key); }
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function personAt(offset) { const day = activeDay(); return state.professionals[(day.currentIndex + offset) % state.professionals.length]; }
function formatDate(date) { return new Intl.DateTimeFormat("pt-BR", { weekday:"long", day:"2-digit", month:"long" }).format(new Date(`${date}T12:00:00`)); }
function formatTime(iso) { return new Intl.DateTimeFormat("pt-BR", { hour:"2-digit", minute:"2-digit", timeZone:"America/Sao_Paulo" }).format(new Date(iso)); }
function escapeHtml(value) { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }
function showToast(message) { clearTimeout(toastTimer); $("#toast").textContent = message; $("#toast").classList.add("show"); toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 2600); }

function render() {
  const day = activeDay(), current = personAt(0), total = Object.values(day.counts).reduce((sum, count) => sum + count, 0);
  $("#recordDate").value = state.selectedDate;
  $("#dayLabel").textContent = state.selectedDate === todayKey() ? "Registro de hoje" : `Registro de ${formatDate(state.selectedDate)}`;
  $("#currentName").textContent = current;
  $("#currentCount").textContent = day.counts[current] || 0;
  $("#nextName").textContent = state.professionals.length > 1 ? personAt(1) : "—";
  $("#wheelName").textContent = current;
  $("#turnNumber").textContent = String(day.currentIndex + 1).padStart(2, "0");
  $("#teamSize").textContent = state.professionals.length;
  $("#totalCuts").textContent = total;
  $("#lastCut").textContent = day.cuts.length ? formatTime(day.cuts.at(-1).at) : "—";
  const sliceAngle = 360 / state.professionals.length;
  $("#wheel").style.background = `repeating-conic-gradient(from -${sliceAngle / 2}deg, #242017 0deg ${sliceAngle - 3}deg, #100f0c ${sliceAngle - 3}deg ${sliceAngle}deg)`;
  $("#wheelNames").innerHTML = state.professionals.map((name, index) => { const angle = index * sliceAngle - 90, radius = 37, x = 50 + Math.cos(angle * Math.PI / 180) * radius, y = 50 + Math.sin(angle * Math.PI / 180) * radius; return `<span class="wheel-name ${index === day.currentIndex ? "active" : ""}" style="left:${x}%;top:${y}%">${escapeHtml(name)}</span>`; }).join("");
  $("#summaryList").innerHTML = state.professionals.map((name, index) => `<div class="summary-item ${index === day.currentIndex ? "current" : ""}"><span class="rank">${String(index + 1).padStart(2,"0")}</span><span class="person-name">${escapeHtml(name)}</span><strong class="cut-pill">${day.counts[name] || 0} corte${(day.counts[name] || 0) === 1 ? "" : "s"}</strong></div>`).join("");
  $("#historyCount").textContent = `${day.cuts.length} registro${day.cuts.length === 1 ? "" : "s"}`;
  $("#historyList").innerHTML = day.cuts.length ? [...day.cuts].reverse().map(cut => `<div class="history-item"><time class="history-time">${formatTime(cut.at)}</time><span class="history-icon">✦</span><strong>${escapeHtml(cut.name)}</strong><span>corte registrado</span></div>`).join("") : `<p class="empty-state">Nenhum corte registrado nesta data.</p>`;
  saveState();
}
$("#attendButton").addEventListener("click", () => {
  const day = activeDay(), name = personAt(0), wheel = $("#wheel");
  day.counts[name] = (day.counts[name] || 0) + 1; day.cuts.push({ name, at: new Date().toISOString() });
  wheel.style.transform = `rotate(${-360 / state.professionals.length}deg)`;
  setTimeout(() => { day.currentIndex = (day.currentIndex + 1) % state.professionals.length; wheel.style.transition = "none"; wheel.style.transform = "rotate(0deg)"; render(); requestAnimationFrame(() => wheel.style.transition = ""); showToast(`Corte de ${name} registrado.`); }, 520);
});
$("#recordDate").addEventListener("change", event => { state.selectedDate = event.target.value || todayKey(); render(); });
$("#settingsButton").addEventListener("click", () => { renderNameFields(); $("#settingsDialog").showModal(); });
$("#cancelButton").addEventListener("click", () => $("#settingsDialog").close());
$("#addNameButton").addEventListener("click", () => addNameField(""));
function addNameField(name) { const row = document.createElement("div"); row.className = "name-row"; row.innerHTML = `<input aria-label="Nome do profissional" value="${escapeHtml(name)}" placeholder="Nome do profissional"><button type="button" class="remove-name" aria-label="Remover profissional">×</button>`; row.querySelector(".remove-name").addEventListener("click", () => row.remove()); $("#nameFields").append(row); }
function renderNameFields() { $("#nameFields").innerHTML = ""; state.professionals.forEach(addNameField); }
$("#teamForm").addEventListener("submit", event => { event.preventDefault(); const names = [...document.querySelectorAll("#nameFields input")].map(input => input.value.trim()).filter(Boolean); if (!names.length) return alert("Adicione pelo menos um profissional."); state.professionals = [...new Set(names)]; Object.values(state.days).forEach(record => { const oldCounts = record.counts || {}; record.counts = Object.fromEntries(state.professionals.map(name => [name, oldCounts[name] || 0])); record.currentIndex = Math.min(record.currentIndex || 0, state.professionals.length - 1); }); $("#settingsDialog").close(); render(); showToast("Equipe atualizada."); });
$("#resetButton").addEventListener("click", () => { if (!confirm(`Zerar os registros de ${formatDate(state.selectedDate)}?`)) return; state.days[state.selectedDate] = createDay(state.selectedDate); render(); showToast("Registro diário zerado."); });
render();
