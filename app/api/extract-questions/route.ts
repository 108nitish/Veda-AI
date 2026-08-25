import { NextRequest, NextResponse } from "next/server";
import { extractQuestionsStructured } from "@/lib/nvidia";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const reqId = Math.random().toString(36).slice(2, 7);
  const t0 = Date.now();
  console.log(`[VedaAI][EXTRACT-QUESTIONS][${reqId}] → request received`);
  try {
    const { images } = (await req.json()) as { images: string[] };
    if (!images?.length) {
      return NextResponse.json(
        { error: "images (question paper pages) required" },
        { status: 400 },
      );
    }

    const { questions, model } = await extractQuestionsStructured(images);
    const withIds = questions.map((q, idx) => ({ id: idx + 1, ...q }));

    console.log(
      `[VedaAI][EXTRACT-QUESTIONS][${reqId}] ✓ ${withIds.length} question(s) in ${((Date.now() - t0) / 1000).toFixed(2)}s (${model})`,
    );
    return NextResponse.json({ questions: withIds, model });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(`[VedaAI][EXTRACT-QUESTIONS][${reqId}] ✗ ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
