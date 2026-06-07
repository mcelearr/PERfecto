# PER Testing Console — Development Plan

## Goal

A local-first browser app for PER exam practice. Pure client-side: static HTML/CSS/JS, JSON data files, and the original PDFs. No backend, no accounts. Opens in any modern browser; deploys to GitHub Pages (or any static host) for classmates with zero config.

## Tech Stack

- Vanilla HTML + CSS + JS (ES modules). No framework, no build step, no npm.
- Reasoning: the app's surface area is small (one screen, one question loop). A framework adds tooling without solving a real problem. Vanilla means "open `index.html` and it works."
- Hand-rolled CSS. A tiny utility layer (CSS variables for colours, a flex/grid layout) is enough.
- Note: ES modules require the page to be served over HTTP, not opened via `file://`. For local dev run `python3 -m http.server` from the project root. The deployed version on GitHub Pages works the same way.

## File Structure

```
per-console/
  index.html
  styles.css
  /js/
    app.js              # entry point, mode routing, home screen
    state.js            # localStorage read/write, progress shape
    quiz.js             # question loop, scoring, end-of-set summary
    data.js             # fetch JSON, build question pools, shuffle
    ui.js               # render question card, options, feedback
  /data/
    index.json                       # list of exams + topic metadata
    murcia-2025-03-tipo1.json
    murcia-2024-11-tipo1.json
    murcia-2025-11-tipo1.json
  /pdfs/
    murcia-2025-03-tipo1.pdf
    murcia-2024-11-tipo1.pdf
    murcia-2025-11-tipo1.pdf
  README.md
```

PDF and JSON file names share the slug `<center>-<YYYY>-<MM>-<type>`. That slug also serves as `exam_id` in the data, so the PDF URL can be derived deterministically from any question's metadata.

Split into multiple JS modules is a soft preference — fine to start in a single `app.js` and split when one of the concerns grows.

## Data Model

### `/data/index.json`

```json
{
  "exams": [
    {
      "id": "murcia-2025-03-tipo1",
      "center": "Murcia",
      "date": "2025-03",
      "tipo": 1,
      "questions_file": "murcia-2025-03-tipo1.json",
      "pdf_file": "murcia-2025-03-tipo1.pdf"
    }
  ],
  "topics": [
    { "slug": "nomenclatura", "label": "Nomenclatura náutica", "questions_per_exam": 4 },
    { "slug": "amarre",       "label": "Elementos de amarre y fondeo", "questions_per_exam": 2 },
    { "slug": "seguridad",    "label": "Seguridad", "questions_per_exam": 4 },
    { "slug": "legislacion",  "label": "Legislación", "questions_per_exam": 2 },
    { "slug": "balizamiento", "label": "Balizamiento", "questions_per_exam": 5, "min_correct": 3 },
    { "slug": "ripa",         "label": "Reglamento (RIPA)", "questions_per_exam": 10, "min_correct": 5 },
    { "slug": "maniobra",     "label": "Maniobra", "questions_per_exam": 2 },
    { "slug": "emergencias",  "label": "Emergencias en el mar", "questions_per_exam": 3 },
    { "slug": "meteorologia", "label": "Meteorología", "questions_per_exam": 4 },
    { "slug": "navegacion",   "label": "Teoría de la navegación", "questions_per_exam": 5 },
    { "slug": "carta",        "label": "Carta de Navegación", "questions_per_exam": 4, "min_correct": 2 }
  ],
  "pass_criteria": { "total_min": 32 }
}
```

### Per-exam JSON

Adds one field to the schema we already agreed on: `pdf_page`, used to deep-link into the original PDF.

```json
{
  "exam_id": "murcia-2025-03-tipo1",
  "center": "Murcia",
  "date": "2025-03",
  "tipo": 1,
  "questions": [
    {
      "number": 13,
      "topic": "balizamiento",
      "pdf_page": 3,
      "question": "Cuando llegamos a puerto desde la mar, las luces que debemos dejar por babor son…",
      "options": {
        "a": "Verdes.",
        "b": "Rojas.",
        "c": "Amarillas.",
        "d": "Azules."
      },
      "correct": "b",
      "ripa_rule": null,
      "requires_chart": false
    }
  ]
}
```

### Question ID (used everywhere for progress + cross-references)

Format: `<exam_id>:Q<number>` — e.g. `murcia-2025-03-tipo1:Q13`. Stable across rebuilds; safe as a localStorage key.

## Modes

### Mode A — Practice by topic (spread across years)

- User picks a topic (e.g. RIPA).
- App pools every question with `topic === selected` from every loaded exam.
- Shuffle. Present one at a time.
- User configures count: 10 / 25 / all.

### Mode B — Full exam

- User picks a specific exam.
- Present questions in original order, Q1 → Q45.
- End-of-set summary shows the official pass criteria check: total ≥ 32, balizamiento ≥ 3, RIPA ≥ 5, carta ≥ 2.

### Mode C — Review (questions you've gotten wrong)

- Pool = every question where the most recent attempt was incorrect.
- Optional toggle: "include questions I've never seen" (defaults off — Mode C is for known weaknesses).
- Same UI as Mode A.
- When the pool is empty, show a "nothing to review" state.

## UI Flow

### Home screen

- Three primary actions: **Practice by topic** / **Full exam** / **Review mistakes**.
- Stats strip: "Answered X of Y unique questions · Z% correct on first try · N questions in review pool."
- Secondary actions in footer: Export progress · Import progress · Reset progress.

### Question screen

- Header line: `Murcia · March 2025 · Q13` with a small "Open original PDF →" link.
- Topic chip below the header (e.g. "Balizamiento").
- Question text rendered as-is, preserving Spanish punctuation and accents.
- Four options as clickable cards labelled a/b/c/d.
- On click:
  - Selected option highlights green (correct) or red (wrong).
  - If wrong, the correct option also highlights green.
  - Small footnote area reveals any `ripa_rule` reference and a one-line "Source" link to the exam PDF, anchored to the right page.
  - "Next" button focuses; pressing Enter advances.
- Progress indicator: `Q12 of 25`.
- Keyboard: keys 1–4 (or A/D) to answer, Enter for next, Esc to go home.

### End-of-set screen

- Score: `34 / 45`.
- For Mode B: pass/fail vs. official criteria, with each minimum threshold shown as ✓ or ✗.
- Topic breakdown table.
- Buttons: "Review the ones I got wrong now" (loads them into Mode A) / "Back to home".

## Progress Storage (localStorage)

Single JSON blob under key `per-progress`:

```json
{
  "version": 1,
  "questions": {
    "murcia-2025-03-tipo1:Q13": {
      "attempts": 3,
      "correct_attempts": 2,
      "last_answer": "b",
      "last_correct": true,
      "last_seen": "2026-06-07T14:23:00Z"
    }
  }
}
```

- One blob keeps the read/write simple at this scale (~135 questions × a handful of exams).
- Load once on app start into in-memory state. Write on every answer.
- The `version` field exists so future schema changes can migrate old saves.

### Export / import

Two buttons in the footer: **Download progress** saves the blob as `per-progress-YYYY-MM-DD.json`. **Upload progress** reads a JSON file back in. Lets the user move between devices, or share progress with classmates, with zero backend.

## PDF Deep-linking

Each question's "Open original PDF" link uses the page-fragment convention supported by all built-in PDF viewers:

```
pdfs/<exam_id>.pdf#page=<pdf_page>
```

Open in a new tab so it doesn't disrupt the quiz state. Works identically locally and on GitHub Pages.

## Build Phases

**Phase 1 — Data**
Extract all 3 PDFs to JSON in the schema above, including `pdf_page` per question. Spot-check a sample (5–10 questions per exam) by hand against the PDF. Build `/data/index.json`.

**Phase 2 — Core UI on Mode B**
Stand up `index.html`, home screen, and the question loop for a single exam in order. Instant feedback on click. No scoring yet, no localStorage yet. Goal: end-to-end clickable flow for one exam.

**Phase 3 — Progress + scoring**
Wire up localStorage. Implement the end-of-set summary with the official pass criteria check for Mode B.

**Phase 4 — Modes A and C**
Topic selector and pool-shuffle logic for Mode A. "Wrong-only" filter for Mode C. Empty-state handling.

**Phase 5 — Polish**
Keyboard shortcuts. Progress export/import. Home-screen stats. Mobile-responsive CSS pass.

**Phase 6 — Deploy**
Push to GitHub. Enable Pages on `main`. Share URL.

## Open Decisions

- **Duplicate questions across exams.** Some questions almost certainly repeat verbatim across years. For v1, treat each `<exam_id>:Q<n>` as independent — simpler, and seeing a repeated question is itself useful reinforcement. If the duplication becomes noisy, add a `canonical_id` field per question and de-dupe in Mode A / Mode C pools.
- **Chart questions (42–45).** They need the physical carta to solve. Options: (a) include them with a "skip — no chart handy" button, (b) filter them out by default in Mode A via the existing `requires_chart` flag. Recommend (b) with a toggle to re-enable.
- **Spaced repetition.** Out of scope for v1. Mode C is the minimum viable version of "show me what I keep getting wrong." Could add weighted random in a later phase based on `attempts` and `correct_attempts`.
- **PDF rendering inline vs. new tab.** New tab is simpler and works everywhere. Inline (via PDF.js or `<iframe>`) is nicer UX but adds dependency or layout complexity. Start with new tab; revisit if classmates ask.
