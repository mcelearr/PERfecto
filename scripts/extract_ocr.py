"""
Extract PER exam questions + correct answers from PDFs using pdfplumber.

The correct answer is marked by a thin underline rectangle drawn just below
the option text in the PDF. We detect it by matching thin rects (height < 3,
width 30-300, dark fill) against option text positions.

No API calls required.

Run from anywhere:  uv run python scripts/extract_ocr.py
Output goes to:     <repo-root>/data/
"""
import json
import re
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).parent.parent

TOPIC_MAP = [
    (range(1, 5),   "nomenclatura"),
    (range(5, 7),   "amarre"),
    (range(7, 11),  "seguridad"),
    (range(11, 13), "legislacion"),
    (range(13, 18), "balizamiento"),
    (range(18, 28), "ripa"),
    (range(28, 30), "maniobra"),
    (range(30, 33), "emergencias"),
    (range(33, 37), "meteorologia"),
    (range(37, 42), "navegacion"),
    (range(42, 46), "carta"),
]

def get_topic(n):
    for r, t in TOPIC_MAP:
        if n in r:
            return t
    return "unknown"

def is_underline_rect(r):
    """True if this rect looks like an answer underline.

    Answer underlines are:
    - Thin (h < 3) but not hair-thin table lines (h > 0.5)
    - Dark fill
    - Start at the option text indent (x0 > 100), not at the page margin (table grids start at x0 ~79)
    - At least 20px wide
    """
    h = r["height"]
    w = r["width"]
    x0 = r["x0"]
    fill = r["non_stroking_color"]
    dark = fill in [0, 0.0, (0,), (0.0,)] or (
        isinstance(fill, tuple) and len(fill) == 3 and all(c < 0.3 for c in fill)
    )
    return 0.5 < h < 3 and w > 20 and x0 > 100 and dark

def find_underlines(page):
    """Return list of y-positions (top) of underline rects on this page."""
    return [r["top"] for r in page.rects if is_underline_rect(r)]

def extract_page_text(page):
    """Extract text with word positions."""
    return page.extract_words(x_tolerance=3, y_tolerance=3)

def group_words_into_lines(words, y_tolerance=2):
    """Group words into lines by similar y position."""
    lines = {}
    for w in words:
        y = round(w["top"] / y_tolerance) * y_tolerance
        lines.setdefault(y, []).append(w)
    return {y: sorted(ws, key=lambda x: x["x0"]) for y, ws in sorted(lines.items())}

def parse_page(page, page_num):
    """
    Returns list of question dicts found on this page.
    Each dict: {number, question, options, correct, pdf_page}
    """
    words = extract_page_text(page)
    lines = group_words_into_lines(words)
    underline_ys = find_underlines(page)

    # Reconstruct text per line with y positions
    line_items = []  # list of (y, text, bottom)
    for y, ws in lines.items():
        text = " ".join(w["text"] for w in ws)
        bottom = max(w["bottom"] for w in ws)
        line_items.append((y, text, bottom))

    def find_correct_answer(option_lines):
        """
        Given dict of {letter: (y, text, bottom)}, return the letter
        whose bottom is closest to an underline rect (within 15px).
        """
        best_letter = None
        best_dist = 15  # max gap between text bottom and underline top
        for letter, (y, text, bottom) in option_lines.items():
            for uy in underline_ys:
                dist = uy - bottom
                if -2 <= dist <= best_dist:
                    best_dist = dist
                    best_letter = letter
        return best_letter

    # Parse questions: scan lines for "N.-" pattern
    questions = []
    i = 0
    while i < len(line_items):
        y, text, bottom = line_items[i]
        m = re.match(r'^(\d{1,2})\s*[.\-]+\s*(.*)', text)
        if not m:
            i += 1
            continue

        q_num = int(m.group(1))
        if not (1 <= q_num <= 45):
            i += 1
            continue

        # Collect question text (may span multiple lines before first option)
        q_lines = [m.group(2).strip()] if m.group(2).strip() else []
        i += 1
        while i < len(line_items):
            ny, ntext, nbottom = line_items[i]
            if re.match(r'^[a-d]\)', ntext, re.IGNORECASE):
                break
            if re.match(r'^\d{1,2}\s*[.\-]+', ntext):
                break
            # Skip page headers/footers
            if re.match(r'^\d+/\d+', ntext) or 'P.E.R.' in ntext:
                i += 1
                continue
            q_lines.append(ntext)
            i += 1

        question_text = " ".join(q_lines).strip()

        # Collect options a) b) c) d)
        option_lines = {}  # letter -> (y, text, bottom)
        while i < len(line_items):
            ny, ntext, nbottom = line_items[i]
            om = re.match(r'^([a-d])\)\s*(.*)', ntext, re.IGNORECASE)
            if om:
                letter = om.group(1).lower()
                opt_text = om.group(2).strip()
                i += 1
                # Continuation lines for this option
                while i < len(line_items):
                    cy, ctext, cbottom = line_items[i]
                    if re.match(r'^[a-d]\)', ctext, re.IGNORECASE):
                        break
                    if re.match(r'^\d{1,2}\s*[.\-]+', ctext):
                        break
                    if re.match(r'^\d+/\d+', ctext) or 'P.E.R.' in ctext:
                        i += 1
                        continue
                    opt_text += " " + ctext
                    nbottom = cbottom
                    i += 1
                option_lines[letter] = (ny, opt_text.strip(), nbottom)
            else:
                break

        if len(option_lines) < 4:
            # Incomplete question (e.g. split across pages) — skip
            continue

        correct = find_correct_answer(option_lines)
        if correct is None:
            print(f"    Q{q_num}: *** NO UNDERLINE FOUND ***")
        else:
            print(f"    Q{q_num}: correct={correct} | {question_text[:55]}")

        questions.append({
            "number": q_num,
            "topic": get_topic(q_num),
            "pdf_page": page_num,
            "question": question_text,
            "options": {k: v[1] for k, v in option_lines.items()},
            "correct": correct,
            "ripa_rule": None,
            "requires_chart": q_num >= 42,
        })

    return questions

EXAMS = [
    ("murcia-2025-03-tipo1", "Murcia", "2025-03", 1),
    ("murcia-2024-11-tipo1", "Murcia", "2024-11", 1),
    ("murcia-2025-11-tipo1", "Murcia", "2025-11", 1),
    ("murcia-2024-06-tipo1", "Murcia", "2024-06", 1),
]

data_dir = ROOT / "data"
data_dir.mkdir(exist_ok=True)
pdfs_dir = ROOT / "pdfs"

for exam_id, center, date, tipo in EXAMS:
    print(f"\n=== {exam_id} ===")
    pdf_path = pdfs_dir / f"{exam_id}.pdf"
    all_questions = {}

    with pdfplumber.open(pdf_path) as pdf:
        for page_num_0, page in enumerate(pdf.pages):
            page_num = page_num_0 + 1
            qs = parse_page(page, page_num)
            for q in qs:
                all_questions[q["number"]] = q

    questions = [all_questions[n] for n in range(1, 46) if n in all_questions]
    missing = [n for n in range(1, 46) if n not in all_questions]
    no_answer = [q["number"] for q in questions if q["correct"] is None]

    print(f"\n  Total: {len(questions)}/45 | missing={missing} | no_answer={no_answer}")

    out = {"exam_id": exam_id, "center": center, "date": date, "tipo": tipo, "questions": questions}
    out_path = data_dir / f"{exam_id}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"  Saved {out_path.relative_to(ROOT)}")

print("\nDone.")
