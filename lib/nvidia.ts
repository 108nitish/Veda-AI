const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

// Best FREE vision models verified with NVIDIA_API_KEY — user requested set + tested 2026
export const VISION_MODELS = [
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", // omni-modal reasoning, images+text, 8M context, user requested
  "nvidia/nemotron-nano-12b-v2-vl", // multi-image + video understanding, 5M, user requested
  "meta/llama-3.2-11b-vision-instruct", // cutting-edge vision-language, user requested, fastest primary
  "meta/llama-3.2-90b-vision-instruct", // higher quality fallback, user requested
  "nvidia/llama-3.1-nemotron-nano-vl-8b-v1", // efficient fallback
  // google/paligemma not available via chat/completions (404) — kept as reference only
] as const;

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

export async function callVisionWithFallback(
  images: string[],
  systemPrompt: string,
  userPrompt: string,
) {
  // Chunking for many pages: NVIDIA context can handle ~8 images per call, chunk if more
  if (images.length > 8) {
    log("VISION", `Chunking ${images.length} pages into batches of 8`);
    const chunks: string[][] = [];
    for (let i = 0; i < images.length; i += 8)
      chunks.push(images.slice(i, i + 8));
    const results: string[] = [];
    let usedModel = VISION_MODELS[0];
    for (let idx = 0; idx < chunks.length; idx++) {
      log(
        "VISION",
        `Processing batch ${idx + 1}/${chunks.length} (${chunks[idx].length} images)`,
      );
      const { text, model } = await callVisionSingleBatch(
        chunks[idx],
        systemPrompt,
        `${userPrompt}\n[Batch ${idx + 1}/${chunks.length}]`,
      );
      usedModel = model;
      results.push(`[Batch ${idx + 1}]\n${text}`);
    }
    return { text: results.join("\n\n---\n\n"), model: usedModel };
  }
  return callVisionSingleBatch(images, systemPrompt, userPrompt);
}

async function callVisionSingleBatch(
  images: string[],
  systemPrompt: string,
  userPrompt: string,
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
        max_tokens: 8192,
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

// Professional OCR extraction - handles multi-page professionally
export async function extractTextProfessional(
  images: string[],
  kind: "question" | "answer",
) {
  log("EXTRACT", `Starting ${kind} extraction`, { pages: images.length });
  const system =
    "You are a professional document OCR engine. Extract ALL text, formulas, diagrams labels, and structure verbatim. Preserve question numbers, marks, and layout. Output clean markdown.";
  const user =
    kind === "question"
      ? `Extract the complete Question Paper text in a professional way.
- Keep question numbers (Q1, Q2...), marks, instructions.
- Preserve formulas, chemical equations, diagram labels.
- If handwriting/diagram, transcribe labels.
- For multi-page, concatenate in order and mark [Page N] where page breaks.
- Return ONLY the extracted text, no commentary.
- Use numbered list for questions.`
      : `Extract the complete Answer Sheet text in a professional way.
- Keep Q numbers, student answers, diagrams text, formulas.
- Preserve handwriting transcription as accurately as possible.
- For multi-page, concatenate in order and mark [Page N] at each page break.
- Return ONLY the extracted text, no commentary.`;

  const start = Date.now();
  const { text, model } = await callVisionWithFallback(images, system, user);
  log(
    "EXTRACT",
    `✓ ${kind} done in ${((Date.now() - start) / 1000).toFixed(2)}s`,
    {
      model,
      chars: text.length,
      pages: images.length,
    },
  );
  return { extractedText: text, model };
}

export type GradedQuestion = {
  id: number;
  question: string;
  maxMarks: number;
  awarded: number;
  tone: "good" | "warn" | "bad";
  feedback: string;
  answerExcerpt: string;
  confidence: number;
};

export async function gradeWithLLM(
  questionPaperText: string,
  answerSheetText: string,
) {
  log("GRADE", "Starting grading", {
    qChars: questionPaperText.length,
    aChars: answerSheetText.length,
  });
  const system = `You are VedaAI, a professional exam evaluator. Compare question paper vs answer sheet and give marks strictly.
Return ONLY valid JSON, no markdown fences.`;

  const user = `QUESTION PAPER (extracted):
"""
${questionPaperText.slice(0, 15000)}
"""

ANSWER SHEET (extracted):
"""
${answerSheetText.slice(0, 15000)}
"""

Task: Map each question to the student's answer, then grade.

Rules:
- Infer max marks per question: if paper says 2/2 or 5 marks etc, use that; else default 2 for MCQ/short, 5 for long/diagram.
- Award marks 0..max, be strict but fair. Diagrams: check labels.
- Tone: good if >=80% marks, warn if 40-79%, bad if <40%.
- Feedback: 1-2 sentences professional, specific, encouraging + correction if needed.
- answerExcerpt: short quote from answer sheet proving the mapping (<=30 words).

Return JSON:
{
  "questions": [
    {
      "id": 1,
      "question": "full question text",
      "maxMarks": 2,
      "awarded": 2,
      "tone": "good",
      "feedback": "...",
      "answerExcerpt": "...",
      "confidence": 0.95
    }
  ],
  "totalAwarded": 12,
  "totalMax": 20,
  "overallFeedback": "2-3 sentence summary"
}

Ensure questions array covers ALL questions from paper in order.`;

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const start = Date.now();
  const { text, model } = await callTextWithFallback(messages, 8192);
  log(
    "GRADE",
    `Raw LLM response ${text.length} chars in ${((Date.now() - start) / 1000).toFixed(2)}s`,
    {
      model,
      preview: text.slice(0, 200).replace(/\n/g, " "),
    },
  );

  // robust JSON parse (strip fences)
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  if (s !== -1 && e !== -1) cleaned = cleaned.slice(s, e + 1);

  let parsed: {
    questions: GradedQuestion[];
    totalAwarded: number;
    totalMax: number;
    overallFeedback: string;
  };
  try {
    parsed = JSON.parse(cleaned);
    log("GRADE", `✓ Parsed ${parsed.questions.length} questions`, {
      total: `${parsed.totalAwarded}/${parsed.totalMax}`,
    });
  } catch (err) {
    log("GRADE", "✗ JSON parse failed, trying repair", {
      error:
        err instanceof Error
          ? err.message.slice(0, 300)
          : String(err).slice(0, 300),
    });
    const repaired = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
    parsed = JSON.parse(repaired);
    log("GRADE", `✓ Repaired JSON parsed ${parsed.questions.length} questions`);
  }

  parsed.questions = parsed.questions.map((q, idx) => ({
    ...q,
    id: q.id ?? idx + 1,
    tone: (q.tone === "good" || q.tone === "warn" || q.tone === "bad"
      ? q.tone
      : q.awarded / q.maxMarks >= 0.8
        ? "good"
        : q.awarded / q.maxMarks >= 0.4
          ? "warn"
          : "bad") as GradedQuestion["tone"],
    confidence: q.confidence ?? 0.9,
  }));

  log("GRADE", `✓ Grading complete`, {
    total: `${parsed.totalAwarded}/${parsed.totalMax}`,
    questions: parsed.questions.length,
  });
  return { ...parsed, model, raw: text };
}
