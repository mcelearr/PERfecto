"""
Extract PER exam questions + correct (underlined) answers from rendered page images.
Uses Mistral Pixtral vision model to OCR each page and identify which option is underlined.

Run from anywhere:  uv run python scripts/extract_ocr.py
Output goes to:     <repo-root>/data/
"""
import base64
import json
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from mistralai.client.sdk import Mistral

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")

client = Mistral(api_key=os.environ["MISTRAL_API_KEY"])

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

def image_to_b64(path):
    with open(path, "rb") as f:
        return base64.standard_b64encode(f.read()).decode()

EXTRACT_PROMPT = """This is a page from a Spanish PER (Patrón de Embarcaciones de Recreo) nautical exam.

Extract every numbered question visible on this page. For each question identify:
- The question number and full question text
- All four options a), b), c), d) with their complete text
- The correct answer — it is marked with an UNDERLINE beneath the option text

Return a JSON array. Use this exact schema:
[
  {
    "number": 5,
    "question": "full question text here",
    "options": {"a": "text of option a", "b": "text of option b", "c": "text of option c", "d": "text of option d"},
    "correct": "b"
  }
]

Rules:
- Look carefully for underlines — a horizontal line drawn under one of the a/b/c/d option texts marks the correct answer
- Include the complete text of each option
- If a question spans multiple lines, join them into one string
- Skip header/footer content (page numbers, exam title, topic headings)
- Return ONLY valid JSON, no markdown fences or extra text"""

def extract_page(image_path):
    b64 = image_to_b64(image_path)
    print(f"    -> Sending to Mistral ({Path(image_path).stat().st_size // 1024}KB)...", end=" ", flush=True)
    resp = client.chat.complete(
        model="pixtral-large-2411",
        messages=[{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                {"type": "text", "text": EXTRACT_PROMPT},
            ]
        }],
        max_tokens=4096,
    )
    raw = resp.choices[0].message.content.strip()
    print(f"got {len(raw)} chars")
    print(f"    -> Raw response preview: {raw[:200]}")
    text = re.sub(r'^```(?:json)?\s*', '', raw)
    text = re.sub(r'\s*```$', '', text)
    parsed = json.loads(text)
    for q in parsed:
        print(f"    -> Q{q['number']}: correct={q.get('correct','?')} | {q['question'][:60]}")
    return parsed

EXAMS = [
    ("murcia-2025-03", "murcia-2025-03-tipo1", "Murcia", "2025-03", 1),
    ("murcia-2024-11", "murcia-2024-11-tipo1", "Murcia", "2024-11", 1),
    ("murcia-2025-11", "murcia-2025-11-tipo1", "Murcia", "2025-11", 1),
    ("murcia-2024-06", "murcia-2024-06-tipo1", "Murcia", "2024-06", 1),
]

page_dir = Path("/tmp/per_pages")
data_dir = ROOT / "data"
data_dir.mkdir(exist_ok=True)

for slug, exam_id, center, date, tipo in EXAMS:
    print(f"\n=== {exam_id} ===")
    pages = sorted(page_dir.glob(f"{slug}_p*.png"))
    all_questions = {}

    for page_path in pages:
        page_num = int(re.search(r'_p(\d+)', page_path.name).group(1))
        print(f"  Page {page_num}...", end=" ", flush=True)
        try:
            qs = extract_page(str(page_path))
            for q in qs:
                n = q["number"]
                q["pdf_page"] = page_num
                q["topic"] = get_topic(n)
                q["ripa_rule"] = None
                q["requires_chart"] = n >= 42
                all_questions[n] = q
            print(f"{len(qs)} questions")
        except Exception as e:
            print(f"ERROR: {e}")

    questions = [all_questions[n] for n in sorted(all_questions)]
    print(f"  Total: {len(questions)} questions")

    out = {
        "exam_id": exam_id,
        "center": center,
        "date": date,
        "tipo": tipo,
        "questions": questions,
    }
    out_path = data_dir / f"{exam_id}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"  Saved {out_path.relative_to(ROOT)}")

print("\nDone.")
