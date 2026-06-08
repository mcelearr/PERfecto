export function renderQuestion(container, q, qIndex, total, onAnswer, signal) {
  const header = `${q.center} · ${fmtDate(q.date)} · Q${q.number}`;
  const pdfUrl = `pdfs/${q.exam_id}.pdf#page=${q.pdf_page}`;

  container.innerHTML = `
    <div class="q-header">
      <button class="btn-back q-back" id="btn-q-back">← Volver</button>
      <span class="q-meta">${header}</span>
      <a class="q-pdf-link" href="${pdfUrl}" target="_blank" rel="noopener">Ver PDF →</a>
    </div>
    <div class="q-topic-chip">${q.topic_label || q.topic}</div>
    <div class="q-progress">Pregunta ${qIndex + 1} de ${total}</div>
    <div class="q-text">${q.question}</div>
    <div class="q-options" role="list">
      ${['a','b','c','d'].map(k => `
        <button class="option-btn" data-key="${k}" role="listitem">
          <span class="option-letter">${k}</span>
          <span class="option-text">${q.options[k]}</span>
        </button>
      `).join('')}
    </div>
    <div class="q-feedback" hidden></div>
    <button class="btn-next" hidden>Siguiente →</button>
  `;

  const optBtns = container.querySelectorAll('.option-btn');
  const feedback = container.querySelector('.q-feedback');
  const nextBtn = container.querySelector('.btn-next');
  let answered = false;

  function answer(key) {
    if (answered) return;
    answered = true;
    const correct = q.correct;
    optBtns.forEach(btn => {
      btn.disabled = true;
      const k = btn.dataset.key;
      if (k === correct) btn.classList.add('correct');
      if (k === key && key !== correct) btn.classList.add('wrong');
    });
    const isCorrect = key === correct;
    feedback.hidden = false;
    feedback.className = 'q-feedback ' + (isCorrect ? 'feedback-correct' : 'feedback-wrong');
    feedback.textContent = isCorrect ? '✓ Correcto' : `✗ Incorrecto — la respuesta es (${correct})`;
    if (q.ripa_rule) {
      feedback.textContent += ` (RIPA Regla ${q.ripa_rule})`;
    }
    nextBtn.hidden = false;
    nextBtn.focus();
    onAnswer(key, isCorrect);
  }

  container.querySelector('#btn-q-back').addEventListener('click', () => {
    container.dispatchEvent(new CustomEvent('quit'));
  }, { signal });

  optBtns.forEach(btn => btn.addEventListener('click', () => answer(btn.dataset.key)));

  nextBtn.addEventListener('click', () => container.dispatchEvent(new CustomEvent('next')));

  container.addEventListener('keydown', e => {
    if (answered) {
      if (e.key === 'Enter') container.dispatchEvent(new CustomEvent('next'));
      return;
    }
    const map = { '1': 'a', '2': 'b', '3': 'c', '4': 'd', 'a': 'a', 'b': 'b', 'c': 'c', 'd': 'd' };
    if (map[e.key.toLowerCase()]) answer(map[e.key.toLowerCase()]);
  }, { signal });
}

export function renderSummary(container, results, mode, topicData, onReview, onHome) {
  const total = results.length;
  const correct = results.filter(r => r.isCorrect).length;

  let passHtml = '';
  if (mode === 'exam') {
    const byTopic = {};
    for (const r of results) {
      if (!byTopic[r.topic]) byTopic[r.topic] = { correct: 0, total: 0 };
      byTopic[r.topic].total++;
      if (r.isCorrect) byTopic[r.topic].correct++;
    }
    const criteria = [
      { label: 'Total', got: correct, need: 32 },
      ...topicData.filter(t => t.min_correct).map(t => ({
        label: t.label,
        got: (byTopic[t.slug] || {}).correct || 0,
        need: t.min_correct,
      }))
    ];
    const passed = criteria.every(c => c.got >= c.need);
    passHtml = `
      <div class="pass-banner ${passed ? 'pass-apto' : 'pass-no-apto'}">
        ${passed ? '✓ APTO' : '✗ NO APTO'}
      </div>
      <div class="pass-criteria">
        ${criteria.map(c => `
          <div class="criterion ${c.got >= c.need ? 'ok' : 'fail'}">
            <span>${c.label}</span>
            <span>${c.got}/${c.need} ${c.got >= c.need ? '✓' : '✗'}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  const byTopicRows = {};
  for (const r of results) {
    if (!byTopicRows[r.topic]) byTopicRows[r.topic] = { label: r.topic_label || r.topic, correct: 0, total: 0 };
    byTopicRows[r.topic].total++;
    if (r.isCorrect) byTopicRows[r.topic].correct++;
  }

  container.innerHTML = `
    <div class="summary">
      <h2>Resultado: ${correct} / ${total}</h2>
      ${passHtml}
      <table class="topic-table">
        <thead><tr><th>Tema</th><th>Correctas</th></tr></thead>
        <tbody>
          ${Object.values(byTopicRows).map(t => `
            <tr>
              <td>${t.label}</td>
              <td>${t.correct}/${t.total}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="summary-actions">
        <button class="btn-primary" id="btn-review">Repasar fallos</button>
        <button class="btn-secondary" id="btn-home">Volver al inicio</button>
      </div>
    </div>
  `;

  container.querySelector('#btn-review').addEventListener('click', onReview);
  container.querySelector('#btn-home').addEventListener('click', onHome);
}

function fmtDate(dateStr) {
  const [year, month] = dateStr.split('-');
  const months = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${months[parseInt(month)]} ${year}`;
}
