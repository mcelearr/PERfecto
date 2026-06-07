let _index = null;
const _exams = {};

export async function loadIndex() {
  const res = await fetch('data/index.json');
  _index = await res.json();
  return _index;
}

export function getIndex() { return _index; }

export async function loadExam(examId) {
  if (_exams[examId]) return _exams[examId];
  const exam = _index.exams.find(e => e.id === examId);
  if (!exam) throw new Error(`Unknown exam: ${examId}`);
  const res = await fetch(`data/${exam.questions_file}`);
  const data = await res.json();
  _exams[examId] = data;
  return data;
}

export async function loadAllExams() {
  await Promise.all(_index.exams.map(e => loadExam(e.id)));
  return _exams;
}

export function getAllQuestions() {
  if (Object.keys(_exams).length === 0) console.warn('getAllQuestions called before loadAllExams');
  return Object.values(_exams).flatMap(exam =>
    exam.questions.map(q => ({
      ...q,
      id: `${exam.exam_id}:Q${q.number}`,
      exam_id: exam.exam_id,
      center: exam.center,
      date: exam.date,
    }))
  );
}

export function getQuestionsByTopic(topicSlug, includeChart = false) {
  return getAllQuestions().filter(q =>
    q.topic === topicSlug && (includeChart || !q.requires_chart)
  );
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function formatExamLabel(exam) {
  const [year, month] = exam.date.split('-');
  const months = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return `${exam.center} · ${months[parseInt(month)]} ${year}`;
}

export function formatQuestionHeader(q) {
  const [year, month] = q.date.split('-');
  const months = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${q.center} · ${months[parseInt(month)]} ${year} · Q${q.number}`;
}
