import { NextRequest, NextResponse } from "next/server";
import { extractTextProfessional, gradeWithLLM } from "@/lib/nvidia";

export const maxDuration = 120;

function log(stage: string, msg: string, extra?: unknown) {
  const extraStr =
    extra !== undefined
      ? typeof extra === "string"
        ? extra
        : JSON.stringify(extra).slice(0, 4000)
      : "";
  console.log(
    `[${new Date().toISOString()}] [VedaAI][${stage}] ${msg}${extraStr ? " " + extraStr : ""}`,
  );
}

export async function POST(req: NextRequest) {
  const reqId = Math.random().toString(36).slice(2, 7);
  const t0 = Date.now();
  log("EVALUATE", `→ [${reqId}] Request received`);
  try {
    const body = await req.json();
    const { questionImages, answerImages } = body as {
      questionImages: string[];
      answerImages: string[];
    };

    log("EVALUATE", `[${reqId}] Params`, {
      questionPages: questionImages?.length,
      answerPages: answerImages?.length,
    });

    if (!questionImages?.length || !answerImages?.length) {
      log("EVALUATE", `[${reqId}] ✗ Missing images`);
      return NextResponse.json(
        { error: "Both questionImages and answerImages required" },
        { status: 400 },
      );
    }

    // === STEP 1: Parse Question Paper ===
    log(
      "EVALUATE",
      `[${reqId}] ━━━ STEP 1/3: Parse Question Paper (vision) — may take a while...`,
      {
        pages: questionImages.length,
        models: "nemotron-3-nano-omni → nemotron-nano-12b → llama-3.2-11b/90b",
      },
    );
    const tQ = Date.now();
    const qRes = await extractTextProfessional(questionImages, "question");
    log(
      "EVALUATE",
      `[${reqId}] ✓ Question Paper parsed in ${((Date.now() - tQ) / 1000).toFixed(2)}s`,
      {
        model: qRes.model,
        chars: qRes.extractedText.length,
      },
    );
    console.log(
      `\n[${new Date().toISOString()}] [VedaAI][QUESTION-PAPER][${reqId}] ── Extracted Text ──`,
    );
    console.log(qRes.extractedText.slice(0, 8000));
    console.log(
      `[VedaAI][QUESTION-PAPER][${reqId}] ── End (${qRes.extractedText.length} chars, ${qRes.model}) ──\n`,
    );

    // === STEP 2: Parse Answer Sheet ===
    log(
      "EVALUATE",
      `[${reqId}] ━━━ STEP 2/3: Parse Answer Sheet (vision) — may take a while...`,
      {
        pages: answerImages.length,
      },
    );
    const tA = Date.now();
    const aRes = await extractTextProfessional(answerImages, "answer");
    log(
      "EVALUATE",
      `[${reqId}] ✓ Answer Sheet parsed in ${((Date.now() - tA) / 1000).toFixed(2)}s`,
      {
        model: aRes.model,
        chars: aRes.extractedText.length,
      },
    );
    console.log(
      `\n[${new Date().toISOString()}] [VedaAI][ANSWER-SHEET][${reqId}] ── Extracted Text ──`,
    );
    console.log(aRes.extractedText.slice(0, 8000));
    console.log(
      `[VedaAI][ANSWER-SHEET][${reqId}] ── End (${aRes.extractedText.length} chars, ${aRes.model}) ──\n`,
    );

    // === STEP 3: Send both to Evaluator ===
    log(
      "EVALUATE",
      `[${reqId}] ━━━ STEP 3/3: Sending both to Evaluator (meta/llama-3.3-70b-instruct)...`,
      {
        qChars: qRes.extractedText.length,
        aChars: aRes.extractedText.length,
      },
    );
    const tGrade = Date.now();
    const graded = await gradeWithLLM(qRes.extractedText, aRes.extractedText);
    log(
      "EVALUATE",
      `[${reqId}] ✓ Evaluator done in ${((Date.now() - tGrade) / 1000).toFixed(2)}s`,
      {
        model: graded.model,
        total: `${graded.totalAwarded}/${graded.totalMax}`,
        questions: graded.questions.length,
      },
    );
    console.log(
      `\n[${new Date().toISOString()}] [VedaAI][EVALUATOR][${reqId}] ── Grading Result ──`,
    );
    console.log(
      JSON.stringify(
        {
          total: `${graded.totalAwarded}/${graded.totalMax}`,
          overallFeedback: graded.overallFeedback,
          questions: graded.questions,
        },
        null,
        2,
      ).slice(0, 8000),
    );
    console.log(`[VedaAI][EVALUATOR][${reqId}] ── End ──\n`);

    log(
      "EVALUATE",
      `[${reqId}] ✔ All done in ${((Date.now() - t0) / 1000).toFixed(2)}s — sending to website`,
    );

    return NextResponse.json({
      questionPaperText: qRes.extractedText,
      answerSheetText: aRes.extractedText,
      visionModels: { question: qRes.model, answer: aRes.model },
      ...graded,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    log(
      "EVALUATE",
      `[${reqId}] ✗ Failed after ${((Date.now() - t0) / 1000).toFixed(2)}s: ${msg}`,
    );
    console.error(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
