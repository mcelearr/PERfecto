import { loadIndex, loadAllExams, getAllQuestions, getQuestionsByTopic, shuffle, formatExamLabel } from './data.js';
import { loadState, getStats, getReviewPool, exportProgress, importProgress, resetProgress } from './state.js';
import { startQuiz } from './quiz.js';

const root = document.getElementById('app');

async function init() {
  root.innerHTML = '<div class="loading">Cargando…</div>';
  const index = await loadIndex();
  await loadAllExams();
  loadState();
  showHome(index);
}

function showHome(index) {
  const all = getAllQuestions();
  const stats = getStats(all);
  const pct = stats.answered ? Math.round(stats.firstCorrect / stats.answered * 100) : 0;

  root.innerHTML = `
    <div class="home">
      <header class="home-header">
        <h1>PER Console</h1>
        <p class="home-subtitle">Patrón de Embarcaciones de Recreo · Práctica de examen</p>
      </header>

      <div class="stats-strip">
        <span>${stats.answered} / ${stats.total} preguntas respondidas</span>
        <span>${pct}% correctas al primer intento</span>
        <span>${stats.reviewPool} en repaso</span>
      </div>

      <div class="mode-cards">
        <div class="mode-card" id="card-topic">
          <div class="mode-icon">📚</div>
          <h2>Práctica por tema</h2>
          <p>Elige un tema y practica preguntas de todos los exámenes</p>
        </div>
        <div class="mode-card" id="card-exam">
          <div class="mode-icon">📝</div>
          <h2>Examen completo</h2>
          <p>Realiza un examen en orden, con los criterios de aprobado oficiales</p>
        </div>
        <div class="mode-card ${stats.reviewPool === 0 ? 'mode-card--disabled' : ''}" id="card-review">
          <div class="mode-icon">🔁</div>
          <h2>Repasar fallos</h2>
          <p>${stats.reviewPool === 0 ? 'No tienes preguntas pendientes' : `${stats.reviewPool} preguntas con últimas respuestas incorrectas`}</p>
        </div>
      </div>

      <footer class="home-footer">
        <button class="btn-link" id="btn-export">Exportar progreso</button>
        <button class="btn-link" id="btn-import">Importar progreso</button>
        <button class="btn-link btn-danger" id="btn-reset">Resetear progreso</button>
        <input type="file" id="import-file" accept=".json" hidden>
      </footer>
    </div>
  `;

  document.getElementById('card-topic').addEventListener('click', () => showTopicPicker(index));
  document.getElementById('card-exam').addEventListener('click', () => showExamPicker(index));
  document.getElementById('card-review').addEventListener('click', () => {
    if (stats.reviewPool === 0) return;
    startReview(index);
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    const blob = new Blob([exportProgress()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `per-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });

  const importFile = document.getElementById('import-file');
  document.getElementById('btn-import').addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      importProgress(await file.text());
      showHome(index);
    } catch (err) {
      alert('Error al importar: ' + err.message);
    }
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm('¿Resetear todo el progreso? Esta acción no se puede deshacer.')) {
      resetProgress();
      showHome(index);
    }
  });
}

function showTopicPicker(index) {
  root.innerHTML = `
    <div class="picker">
      <button class="btn-back" id="btn-back">← Volver</button>
      <h2>Práctica por tema</h2>
      <div class="topic-list">
        ${index.topics.map(t => `
          <button class="topic-btn" data-slug="${t.slug}">
            <span class="topic-label">${t.label}</span>
            <span class="topic-count">${t.slug === 'carta' ? '16 preguntas (carta)' : getQuestionsByTopic(t.slug).length + ' preguntas'}</span>
          </button>
        `).join('')}
      </div>
      <div class="count-picker" id="count-picker" hidden>
        <h3>Número de preguntas</h3>
        <div class="count-options">
          <button class="count-btn" data-n="10">10</button>
          <button class="count-btn" data-n="25">25</button>
          <button class="count-btn" data-n="all">Todas</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => showHome(index));

  let selectedSlug = null;
  document.querySelectorAll('.topic-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.topic-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedSlug = btn.dataset.slug;
      document.getElementById('count-picker').hidden = false;
    });
  });

  document.querySelectorAll('.count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const allQs = shuffle(getQuestionsByTopic(selectedSlug, selectedSlug === 'carta'));
      const n = btn.dataset.n === 'all' ? allQs.length : Math.min(parseInt(btn.dataset.n), allQs.length);
      const qs = allQs.slice(0, n);
      startQuiz(root, qs, 'topic', index.topics, () => showHome(index));
    });
  });
}

function showExamPicker(index) {
  root.innerHTML = `
    <div class="picker">
      <button class="btn-back" id="btn-back">← Volver</button>
      <h2>Examen completo</h2>
      <div class="exam-list">
        ${index.exams.map(e => `
          <button class="exam-btn" data-id="${e.id}">
            ${formatExamLabel(e)}
            <span class="exam-tipo">Tipo ${e.tipo}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => showHome(index));
  document.querySelectorAll('.exam-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const allQs = getAllQuestions().filter(q => q.exam_id === btn.dataset.id);
      const sorted = allQs.sort((a, b) => a.number - b.number);
      startQuiz(root, sorted, 'exam', index.topics, () => showHome(index));
    });
  });
}

function startReview(index) {
  const all = getAllQuestions();
  const pool = getReviewPool(all);
  if (pool.length === 0) { showHome(index); return; }
  startQuiz(root, shuffle(pool), 'review', index.topics, () => showHome(index));
}

init().catch(err => {
  root.innerHTML = `<div class="error">Error al cargar: ${err.message}</div>`;
});
