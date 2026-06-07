const STORAGE_KEY = 'per-progress';
const SCHEMA_VERSION = 1;

function defaultState() {
  return { version: SCHEMA_VERSION, questions: {} };
}

let _state = null;

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.version === SCHEMA_VERSION) {
        _state = parsed;
        return;
      }
    }
  } catch (_) {}
  _state = defaultState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
}

export function getQuestionRecord(qid) {
  return _state.questions[qid] || null;
}

export function recordAnswer(qid, chosen, correct) {
  const prev = _state.questions[qid] || { attempts: 0, correct_attempts: 0 };
  _state.questions[qid] = {
    attempts: prev.attempts + 1,
    correct_attempts: prev.correct_attempts + (chosen === correct ? 1 : 0),
    last_answer: chosen,
    last_correct: chosen === correct,
    last_seen: new Date().toISOString(),
  };
  saveState();
}

export function getStats(allQuestions) {
  const total = allQuestions.length;
  let answered = 0, firstCorrect = 0, reviewPool = 0;
  for (const q of allQuestions) {
    const rec = _state.questions[q.id];
    if (rec) {
      answered++;
      if (rec.correct_attempts >= 1) firstCorrect++;
      if (!rec.last_correct) reviewPool++;
    }
  }
  return { total, answered, firstCorrect, reviewPool };
}

export function getReviewPool(allQuestions) {
  return allQuestions.filter(q => {
    const rec = _state.questions[q.id];
    return rec && !rec.last_correct;
  });
}

export function exportProgress() {
  return JSON.stringify(_state, null, 2);
}

export function importProgress(json) {
  const parsed = JSON.parse(json);
  if (parsed.version !== SCHEMA_VERSION) throw new Error('Incompatible version');
  _state = parsed;
  saveState();
}

export function resetProgress() {
  _state = defaultState();
  saveState();
}
