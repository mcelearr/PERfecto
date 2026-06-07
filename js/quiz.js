import { renderQuestion, renderSummary } from './ui.js';
import { recordAnswer } from './state.js';

export function startQuiz(container, questions, mode, topicData, onHome) {
  let index = 0;
  const results = [];
  let controller = null;

  function attachTopicLabel(q) {
    const t = topicData.find(t => t.slug === q.topic);
    return { ...q, topic_label: t ? t.label : q.topic };
  }

  function showQuestion() {
    if (index >= questions.length) {
      showSummary();
      return;
    }
    if (controller) controller.abort();
    controller = new AbortController();
    const { signal } = controller;

    const q = attachTopicLabel(questions[index]);
    renderQuestion(container, q, index, questions.length, (chosen, isCorrect) => {
      recordAnswer(q.id, chosen, q.correct);
      results.push({ topic: q.topic, topic_label: q.topic_label, isCorrect });
    }, signal);

    container.addEventListener('next', () => { index++; showQuestion(); }, { once: true, signal });
    container.addEventListener('keydown', e => {
      if (e.key === 'Escape') { controller.abort(); onHome(); }
    }, { signal });
  }

  function showSummary() {
    if (controller) { controller.abort(); controller = null; }
    renderSummary(
      container, results, mode, topicData,
      () => {
        const wrongIds = new Set(
          results.flatMap((r, i) => r.isCorrect ? [] : [questions[i].id])
        );
        const reviewQs = questions.filter(q => wrongIds.has(q.id));
        if (reviewQs.length === 0) { onHome(); return; }
        startQuiz(container, reviewQs, 'review', topicData, onHome);
      },
      onHome
    );
  }

  showQuestion();
}
