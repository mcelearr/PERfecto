import { getAllQuestions } from './data.js';
import { getQuestionRecord } from './state.js';

export function renderHeatmap(container, index, onHome, onQuestion) {
  const exams = index.exams;
  const topics = index.topics;
  const all = getAllQuestions();

  // Build lookup: examId -> questionNumber -> question
  const byExam = {};
  for (const e of exams) byExam[e.id] = {};
  for (const q of all) byExam[q.exam_id][q.number] = q;

  const months = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  function examLabel(e) {
    const [year, month] = e.date.split('-');
    return `${months[parseInt(month)]} ${year.slice(2)}`;
  }

  function cellStatus(q) {
    if (!q) return 'missing';
    const rec = getQuestionRecord(q.id);
    if (!rec) return 'unseen';
    return rec.last_correct ? 'correct' : 'wrong';
  }

  let sectionsHtml = '';
  for (const topic of topics) {
    const nums = [...new Set(all.filter(q => q.topic === topic.slug).map(q => q.number))].sort((a, b) => a - b);

    const rowsHtml = nums.map(n => {
      const cells = exams.map(e => {
        const q = byExam[e.id][n];
        const status = cellStatus(q);
        const label = status === 'unseen' ? 'Sin responder' : status === 'correct' ? 'Correcta' : 'Incorrecta';
        const title = `Q${n} · ${examLabel(e)}: ${label}`;
        const attr = q ? `data-qid="${q.id}"` : '';
        return `<td class="hm-cell hm-${status}" ${attr} title="${title}"></td>`;
      }).join('');
      return `<tr><td class="hm-qnum">${n}</td>${cells}</tr>`;
    }).join('');

    sectionsHtml += `
      <tbody>
        <tr class="hm-topic-row">
          <td class="hm-topic-label" colspan="${exams.length + 1}">${topic.label}</td>
        </tr>
        ${rowsHtml}
      </tbody>
    `;
  }

  container.innerHTML = `
    <div class="heatmap-page">
      <div class="heatmap-nav">
        <button class="btn-back" id="btn-back">← Volver</button>
        <h2>Mapa de progreso</h2>
      </div>
      <div class="hm-legend">
        <span class="hm-legend-item"><span class="hm-cell hm-correct"></span> Correcta</span>
        <span class="hm-legend-item"><span class="hm-cell hm-wrong"></span> Incorrecta</span>
        <span class="hm-legend-item"><span class="hm-cell hm-unseen"></span> Sin responder</span>
      </div>
      <div class="hm-scroll">
        <table class="hm-table">
          <thead>
            <tr>
              <th class="hm-qnum-header">Q</th>
              ${exams.map(e => `<th class="hm-exam-header">${examLabel(e)}</th>`).join('')}
            </tr>
          </thead>
          ${sectionsHtml}
        </table>
      </div>
    </div>
  `;

  container.querySelector('#btn-back').addEventListener('click', onHome);

  container.querySelectorAll('.hm-cell[data-qid]').forEach(cell => {
    cell.addEventListener('click', () => onQuestion(cell.dataset.qid));
  });
}
