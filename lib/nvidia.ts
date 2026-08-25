const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

// Best FREE vision models verified with NVIDIA_API_KEY — user requested set + tested 2026
export const VISION_MODELS = [
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", // omni-modal reasoning, images+text, 8M context, user requested
  "nvidia/nemotron-nano-12b-v2-vl", // multi-image + video understanding, 5M, user requested
  "meta/llama-3.2-11b-vision-instruct", // cutting-edge vision-language, user requested, fastest primary
  "meta/llama-3.2-90b-vision-instruct", // higher quality fallback, user requested
  "nvidia/llama-3.1-nemotron-nano-vl-8b-v1", // efficient fallback
] as const;

export async function extractTextProfessional(
  images: string[],
  kind: "question" | "answer",
) {
  if (kind === "question") {
    const { questions, model } = await extractQuestionsStructured(images);
    const extractedText = questions
      .map((q) => `${q.label}. ${q.text} ${q.marks ? `(${q.marks} marks)` : ""}`)
      .join("\n\n");
    return { extractedText, model };
  } else {
    const { blocks, model } = await extractAnswerBlocksStructured(images);
    const extractedText = blocks
      .map((b) => (b.label ? `Q${b.label}: ${b.text}` : b.text))
      .join("\n\n");
    return { extractedText, model };
  }
}

export async function gradeWithLLM(
  questionText: string,
  answerText: string,
) {
  const questions = questionText
    .split("\n\n")
    .filter((q) => q.trim())
    .map((q, i) => ({
      id: i + 1,
      label: String(i + 1),
      text: q.trim(),
      marks: null,
    }));

  const blocks = answerText
    .split("\n\n")
    .filter((a) => a.trim())
    .map((a, i) => ({
      id: i + 1,
      page: 1,
      label: String(i + 1),
      text: a.trim(),
    }));

  return mapAndGrade(questions, blocks);
}

// Best FREE text models verified
export const TEXT_MODELS = [
  "meta/llama-3.3-70b-instruct", // best grading reasoning, free
  "meta/llama-3.1-70b-instruct",
  "nvidia/llama-3.3-nemotron-super-49b-v1",
] as const;

function getApiKey() {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY missing in environment");
  return key;
}

function log(stage: string, msg: string, extra?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const extraStr = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[${ts}] [VedaAI][${stage}] ${msg}${extraStr}`);
}

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<{ type: string; text?: string; image_url?: { url: string } }>;
};

async function callNvidia(
  model: string,
  messages: ChatMessage[],
  opts: { max_tokens?: number; temperature?: number } = {},
) {
  const start = Date.now();
  log("NVIDIA", `→ Calling ${model}`, {
    max_tokens: opts.max_tokens,
    temp: opts.temperature,
    msgCount: messages.length,
  });
  const res = await fetch(NVIDIA_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts.max_tokens ?? 4096,
      temperature: opts.temperature ?? 0.1,
      stream: false,
    }),
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  if (!res.ok) {
    const txt = await res.text();
    log("NVIDIA", `✗ ${model} failed ${res.status} in ${elapsed}s`, {
      detail: txt.slice(0, 500),
    });
    throw new Error(
      `NVIDIA ${model} failed ${res.status}: ${txt.slice(0, 2000)}`,
    );
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Empty response from ${model}`);
  const usage = json.usage;
  log("NVIDIA", `✓ ${model} success in ${elapsed}s`, {
    completion_tokens: usage?.completion_tokens,
    total_tokens: usage?.total_tokens,
    chars: (content as string).length,
  });
  return content as string;
}

async function callVisionSingleBatch(
  images: string[],
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 4096,
) {
  const imageContents = images.map((b64) => ({
    type: "image_url" as const,
    image_url: {
      url: b64.startsWith("data:") ? b64 : `data:image/jpeg;base64,${b64}`,
    },
  }));

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [{ type: "text", text: userPrompt }, ...imageContents],
    },
  ];

  let lastErr: unknown;
  for (const model of VISION_MODELS) {
    try {
      log("VISION", `Trying ${model} with ${images.length} image(s)`);
      const text = await callNvidia(model, messages, {
        max_tokens: maxTokens,
        temperature: 0,
      });
      log("VISION", `✔ ${model} extracted ${text.length} chars`);
      return { text, model };
    } catch (e) {
      lastErr = e;
      log("VISION", `✗ ${model} failed, trying next fallback`, {
        error:
          e instanceof Error
            ? e.message.slice(0, 300)
            : String(e).slice(0, 300),
      });
    }
  }
  throw lastErr;
}

export async function callTextWithFallback(
  messages: ChatMessage[],
  maxTokens = 8192,
) {
  let lastErr: unknown;
  for (const model of TEXT_MODELS) {
    try {
      log("TEXT", `Trying ${model}`);
      const text = await callNvidia(model, messages, {
        max_tokens: maxTokens,
        temperature: 0.2,
      });
      log("TEXT", `✔ ${model} generated ${text.length} chars`);
      return { text, model };
    } catch (e) {
      lastErr = e;
      log("TEXT", `✗ ${model} failed`, {
        error:
          e instanceof Error
            ? e.message.slice(0, 300)
            : String(e).slice(0, 300),
      });
    }
  }
  throw lastErr;
}

// ---------- Robust JSON parsing helper ----------
export function parseJsonLoose<T = unknown>(raw: string): T {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  // Grab the outermost JSON object/array
  const firstObj = cleaned.indexOf("{");
  const firstArr = cleaned.indexOf("[");
  let start = -1;
  let endChar = "}";
  if (firstObj !== -1 && (firstArr === -1 || firstObj < firstArr)) {
    start = firstObj;
    endChar = "}";
  } else if (firstArr !== -1) {
    start = firstArr;
    endChar = "]";
  }
  if (start !== -1) {
    const end = cleaned.lastIndexOf(endChar);
    if (end !== -1) cleaned = cleaned.slice(start, end + 1);
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const repaired = cleaned
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .replace(/[\u0000-\u001f]+/g, (m) => (m === "\n" ? "\\n" : ""));
    return JSON.parse(repaired) as T;
  }
}

// ---------- STEP 1: Question extraction (structured, ordered) ----------
export type ExtractedQuestion = {
  label: string; // printed numbering, e.g. "1", "11(a)", "Q3.ii"
  text: string;
  marks: number | null;
  page: number; // 1-based page index within the question paper images provided
};

export async function extractQuestionsStructured(images: string[]) {
  log("Q-EXTRACT", "Starting structured question extraction", {
    pages: images.length,
  });
  const system =
    "You are a precise exam question-paper parser. You output ONLY strict, valid JSON — no markdown fences, no commentary, no trailing commas.";
  const user = `You are given ${images.length} image(s), each one page of a question paper, IN PAGE ORDER (page 1 first).

Extract EVERY question in the exact order they are printed.
Rules:
- Preserve the original printed numbering EXACTLY as written (e.g. "1", "2", "11", "Q3").
- If a question has labelled sub-parts (e.g. "(a)", "(b)", "i", "ii"), treat EACH sub-part as its OWN separate entry, with label combining parent + sub-part (e.g. "11(a)", "11(b)").
- Do not merge sub-parts together, and do not skip any question or sub-part.
- "marks" is the number of marks/points printed for that question if stated (a number), otherwise null.
- "page" is the 1-based index of the image (among the ${images.length} provided) the question appears on. If a question starts on one page, use the page it starts on.
- "text" is the full question text (include any short instructions specific to that question), transcribed accurately, excluding marks annotation.

Return ONLY this JSON shape, nothing else:
{"questions":[{"label":"1","text":"...","marks":2,"page":1}, {"label":"11(a)","text":"...","marks":5,"page":3}]}`;

  const { text, model } = await callVisionSingleBatch(
    images,
    system,
    user,
    8192,
  );
  const parsed = parseJsonLoose<{ questions: ExtractedQuestion[] }>(text);
  const questions = (parsed.questions || []).map((q) => ({
    label: String(q.label ?? "").trim() || "?",
    text: String(q.text ?? "").trim(),
    marks:
      typeof q.marks === "number" && !Number.isNaN(q.marks) ? q.marks : null,
    page:
      typeof q.page === "number" && q.page >= 1
        ? Math.min(q.page, images.length)
        : 1,
  }));
  log("Q-EXTRACT", `✓ Parsed ${questions.length} questions`, { model });
  return { questions, model };
}

// ---------- STEP 2: Answer block extraction (per page, with bounding boxes) ----------
export type AnswerBlock = {
  page: number; // 1-based
  label: string | null; // question label student wrote, if visible
  text: string;
  bbox: { x: number; y: number; w: number; h: number }; // percentages 0-100 of the page image
};

function clampPct(v: unknown, max = 100): number {
  const n = typeof v === "number" && !Number.isNaN(v) ? v : 0;
  return Math.max(0, Math.min(max, n));
}

export async function extractAnswerBlocksStructured(images: string[]) {
  log("A-EXTRACT", "Starting structured answer-block extraction", {
    pages: images.length,
  });
  const system =
    "You are a precise handwriting-analysis engine for exam answer sheets. You output ONLY strict, valid JSON — no markdown fences, no commentary, no trailing commas.";

  const results: { pageBlocks: AnswerBlock[]; model: string }[] = [];
  for (let i = 0; i < images.length; i++) {
    const pageNum = i + 1;
    const user = `This image is ONE page (page ${pageNum} of ${images.length}) of a student's handwritten exam answer sheet.

Identify every distinct ANSWER BLOCK the student wrote on this page (usually one block per question attempted; start a new block whenever the student begins answering a different question, even mid-page).

For each block return:
- "label": the question number/label the student wrote next to or above the answer, EXACTLY as written (e.g. "1", "11(a)", "Q3"). If no label/number is visibly written for that block, use null — do NOT guess.
- "text": transcribe the handwritten content as accurately as possible (best-effort OCR of handwriting).
- "bbox": the bounding box of ONLY that block's handwritten content on the page, as PERCENTAGES of the full image width/height (0-100), where x,y is the top-left corner, w is width, h is height. Be as tight and accurate as possible around the actual ink.

Order blocks top-to-bottom as they appear on the page. If the page is blank or has no answers, return an empty array.

Return ONLY this JSON shape, nothing else:
{"blocks":[{"label":"1","text":"...","bbox":{"x":10.5,"y":15.2,"w":80,"h":18}}]}`;

    const { text, model } = await callVisionSingleBatch(
      [images[i]],
      system,
      user,
      4096,
    );
    try {
      const parsed = parseJsonLoose<{
        blocks: Array<{
          label: string | null;
          text: string;
          bbox: { x: number; y: number; w: number; h: number };
        }>;
      }>(text);
      const pageBlocks: AnswerBlock[] = (parsed.blocks || [])
        .filter((b) => b && b.bbox)
        .map((b) => ({
          page: pageNum,
          label: b.label ? String(b.label).trim() : null,
          text: String(b.text ?? "").trim(),
          bbox: {
            x: clampPct(b.bbox.x),
            y: clampPct(b.bbox.y),
            w: clampPct(b.bbox.w, 100 - clampPct(b.bbox.x)),
            h: clampPct(b.bbox.h, 100 - clampPct(b.bbox.y)),
          },
        }));
      results.push({ pageBlocks, model });
      log("A-EXTRACT", `✓ Page ${pageNum}: ${pageBlocks.length} block(s)`, {
        model,
      });
    } catch (err) {
      log("A-EXTRACT", `✗ Page ${pageNum} parse failed, skipping page`, {
        error: err instanceof Error ? err.message.slice(0, 300) : String(err),
      });
      results.push({ pageBlocks: [], model });
    }
  }

  const blocks = results.flatMap((r) => r.pageBlocks);
  const model = results.find((r) => r.model)?.model ?? VISION_MODELS[0];
  log("A-EXTRACT", `✓ Total ${blocks.length} answer block(s) extracted`);
  return { blocks, model };
}

// ---------- STEP 3: Mapping + grading (id-based) ----------
export type MappingResult = {
  questionId: number;
  blockIds: number[]; // 0 or more blocks answering this question (multiple = spans pages)
  awarded: number;
  maxMarks: number;
  tone: "good" | "warn" | "bad";
  feedback: string;
  confidence: number;
};

export async function mapAndGrade(
  questions: Array<{
    id: number;
    label: string;
    text: string;
    marks: number | null;
  }>,
  blocks: Array<{ id: number; page: number; label: string | null; text: string }>,
) {
  log("MAP-GRADE", "Starting mapping + grading", {
    questions: questions.length,
    blocks: blocks.length,
  });
  const system = `You are VedaAI, a professional exam evaluator. You map a student's answer blocks to the correct questions and grade them strictly but fairly.
You output ONLY strict, valid JSON — no markdown fences, no commentary, no trailing commas.`;

  const user = `QUESTIONS (JSON array, "id" is a stable numeric id you must reference back):
${JSON.stringify(questions)}

ANSWER BLOCKS (JSON array, extracted from the student's answer sheet; "id" is a stable numeric id, "label" is what the student wrote next to that block if any, may be null):
${JSON.stringify(blocks)}

Task:
1. For every question, find the answer block(s) that answer it. Usually one block per question, but if the student's answer clearly continues onto another page (e.g. same "label", or the text is a direct continuation), include ALL of those block ids for that question ("blockIds" can have more than one entry — this is how multi-page answers are represented). Match primarily by the block's "label" against the question's "label" (they may be written out of order, or with slightly different formatting — e.g. "11 a" matches "11(a)"). If no label match, use content similarity between the block's text and the question's text. Each block may only be assigned to ONE question.
2. If a question has no matching block, set "blockIds": [], "awarded": 0, and feedback should say the question was not answered.
3. Any block not assigned to any question should be listed in "unmatchedBlockIds" (e.g. rough work, or an answer that doesn't correspond to any printed question).
4. "maxMarks": use the question's "marks" field if it's a number; otherwise default to 5 for long/diagram answers or 2 for short answers (use your judgement from the question text).
5. "awarded": integer/half-integer 0..maxMarks, strict but fair grading based on correctness and completeness of the matched block(s)' combined text.
6. "tone": "good" if awarded/maxMarks >= 0.8, "warn" if 0.4-0.79, "bad" if < 0.4 (bad also when unanswered).
7. "feedback": 1-2 professional sentences, specific to that answer, encouraging + correction if needed.
8. "confidence": 0..1, your confidence in the question<->block mapping (independent of grading).

Return ONLY this JSON shape, with exactly one entry in "results" per question, in the same order as the QUESTIONS array:
{
  "results": [
    {"questionId": 1, "blockIds": [4], "awarded": 2, "maxMarks": 2, "tone": "good", "feedback": "...", "confidence": 0.92}
  ],
  "unmatchedBlockIds": [9],
  "totalAwarded": 12,
  "totalMax": 20,
  "overallFeedback": "2-3 sentence summary of overall performance."
}`;

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const { text, model } = await callTextWithFallback(messages, 8192);
  const parsed = parseJsonLoose<{
    results: MappingResult[];
    unmatchedBlockIds: number[];
    totalAwarded: number;
    totalMax: number;
    overallFeedback: string;
  }>(text);

  const byId = new Map(questions.map((q) => [q.id, q]));
  const results: MappingResult[] = (parsed.results || []).map((r) => {
    const q = byId.get(r.questionId);
    const maxMarks =
      typeof r.maxMarks === "number" && r.maxMarks > 0
        ? r.maxMarks
        : q?.marks ?? 5;
    const awarded =
      typeof r.awarded === "number"
        ? Math.max(0, Math.min(maxMarks, r.awarded))
        : 0;
    const ratio = maxMarks > 0 ? awarded / maxMarks : 0;
    return {
      questionId: r.questionId,
      blockIds: Array.isArray(r.blockIds)
        ? r.blockIds.filter((b): b is number => typeof b === "number")
        : [],
      awarded,
      maxMarks,
      tone: (r.tone === "good" || r.tone === "warn" || r.tone === "bad"
        ? r.tone
        : ratio >= 0.8
          ? "good"
          : ratio >= 0.4
            ? "warn"
            : "bad") as MappingResult["tone"],
      feedback: r.feedback || "No feedback available.",
      confidence:
        typeof r.confidence === "number"
          ? Math.max(0, Math.min(1, r.confidence))
          : 0.7,
    };
  });

  const totalAwarded =
    typeof parsed.totalAwarded === "number"
      ? parsed.totalAwarded
      : results.reduce((s, r) => s + r.awarded, 0);
  const totalMax =
    typeof parsed.totalMax === "number"
      ? parsed.totalMax
      : results.reduce((s, r) => s + r.maxMarks, 0);

  log("MAP-GRADE", "✓ Mapping + grading complete", {
    model,
    total: `${totalAwarded}/${totalMax}`,
    matched: results.filter((r) => r.blockIds.length > 0).length,
    unanswered: results.filter((r) => r.blockIds.length === 0).length,
    unmatched: (parsed.unmatchedBlockIds || []).length,
  });

  return {
    results,
    unmatchedBlockIds: Array.isArray(parsed.unmatchedBlockIds)
      ? parsed.unmatchedBlockIds
      : [],
    totalAwarded,
    totalMax,
    overallFeedback: parsed.overallFeedback || "",
    model,
  };
}
