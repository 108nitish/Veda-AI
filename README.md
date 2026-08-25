# VedaAI — AI Assessment Extraction & Answer Mapping

A teacher uploads a **question paper** and a student's **handwritten answer sheet**
(PDF or images). VedaAI extracts every question in printed order, reads the
student's handwritten answers, maps each answer back to its question, highlights
the **exact region** of the answer on the sheet, and grades it with AI feedback.

## Live demo

- Live URL: _add your deployed URL here after deploying (see below)_
- GitHub: _add your repo URL here_

## How it works (pipeline)

`Question Extraction → Answer Extraction → Answer Mapping → Grading/Feedback`

The app never sends both documents in one giant prompt — it runs three
independent, progress-tracked steps so partial failures are isolated and the
UI can show real progress:

1. **`POST /api/extract-questions`** — sends all question-paper pages to a
   vision model in one call and asks for strict JSON:
   `{ questions: [{ label, text, marks, page }] }`.
   Labelled sub-parts (`11(a)`, `11(b)`, …) are extracted as **separate**
   entries, in the order printed, with the original numbering preserved.

2. **`POST /api/extract-answers`** — sends the answer-sheet **one page at a
   time** to a vision model and asks it to return every distinct handwritten
   answer block on that page as JSON, including:
   - `label` — the question number the student wrote (or `null` if none is
     visible),
   - `text` — best-effort handwriting transcription,
   - `bbox` — a bounding box **as a percentage of the page image**
     (`x, y, w, h`, top-left origin).

   Per-page calls make the bounding boxes far more reliable than asking a
   model to reason about coordinates across many pages at once.

3. **`POST /api/map-grade`** — a text LLM receives the structured question
   list and answer-block list (referenced by stable numeric ids) and decides,
   per question: which block(s) answer it (a question can map to **more than
   one block**, which is how answers spanning multiple pages are
   represented), whether it was left **unanswered**, grades it, and returns
   any leftover blocks that don't match a question as **unmatched**.

The frontend then renders the answer sheet pages as images and draws the
`bbox` percentages as absolutely-positioned overlay boxes on top — clicking a
question scrolls to and highlights the matching region(s) in green; unmatched
handwriting is listed separately and can also be selected to jump to it.

## Edge cases handled

- Sub-parts (`Q11(a)`, `Q11(b)`) are separate entries with original numbering.
- Answers written out of order are still matched correctly (matching is by
  label + content, not physical position).
- Unanswered questions are shown with a "Not answered" tag and no highlight.
- Handwritten blocks that don't match any question are shown in a dedicated
  "Answers not matched to any question" list instead of being silently
  dropped or force-matched.
- Answers spanning multiple pages map to multiple blocks/pages at once.
- Both PDFs and images are accepted for either upload; PDFs are rendered to
  images client-side (via `pdfjs-dist`) at high resolution before upload so
  the vision model sees the same thing a human would.

## AI model / API used

All calls go through **NVIDIA's free NIM endpoint**
(`https://integrate.api.nvidia.com/v1/chat/completions`, OpenAI-compatible),
using a fallback chain so a single overloaded/unavailable model doesn't fail
the whole run:

- Vision (question/answer extraction): `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`
  → `nvidia/nemotron-nano-12b-v2-vl` → `meta/llama-3.2-11b-vision-instruct`
  → `meta/llama-3.2-90b-vision-instruct` → `nvidia/llama-3.1-nemotron-nano-vl-8b-v1`
- Mapping/grading (text-only): `meta/llama-3.3-70b-instruct` →
  `meta/llama-3.1-70b-instruct` → `nvidia/llama-3.3-nemotron-super-49b-v1`

Get a free key at **https://build.nvidia.com**.

## Assumptions & limitations

- Bounding boxes are produced by prompting a vision-language model, not a
  dedicated grounding/detection model — NVIDIA's free tier has no such model
  available, so boxes are the model's best estimate and may be
  approximate/imperfect on very dense or messy handwriting. This is a
  reasonable trade-off for a free-tier, no-GPU-hosting constraint.
- Up to 12 pages per document are processed (`fileToDataUrls(file, 12)`) to
  keep runs fast and within free-tier rate limits; this is easy to raise.
- No database/auth — everything is in-memory for the duration of a single
  upload → grade cycle, per the assignment's scope.
- Marks default to 5 (long/diagram) or 2 (short) when the paper doesn't state
  them explicitly; the model uses judgement from the question text.
- Grading is AI-generated and meant as a strong first pass / teacher aid, not
  a final authoritative score.

## Local setup

```bash
npm install
cp .env.example .env  # then paste your NVIDIA_API_KEY
npm run dev
```

Open http://localhost:3000.

## Deployment (Vercel recommended)

1. Push this repo to GitHub.
2. Import it on https://vercel.com/new.
3. Add an environment variable `NVIDIA_API_KEY` with your free NVIDIA key.
4. Deploy. No database or extra services are required.

Vision extraction calls (especially per-page answer-sheet OCR) can take a
while for multi-page uploads — the app shows a 4-step progress indicator
(`reading files → questions → answers → mapping/grading`) the whole time.
