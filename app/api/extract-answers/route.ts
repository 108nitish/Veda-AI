import { NextRequest, NextResponse } from "next/server";
import { extractAnswerBlocksStructured } from "@/lib/nvidia";

export const maxDuration = 180;

export async function POST(req: NextRequest) {
  const reqId = Math.random().toString(36).slice(2, 7);
  const t0 = Date.now();
  console.log(`[VedaAI][EXTRACT-ANSWERS][${reqId}] → request received`);
  try {
    const { images } = (await req.json()) as { images: string[] };
    if (!images?.length) {
      return NextResponse.json(
        { error: "images (answer sheet pages) required" },
        { status: 400 },
      );
    }

    const { blocks, model } = await extractAnswerBlocksStructured(images);
    const withIds = blocks.map((b, idx) => ({ id: idx + 1, ...b }));

    console.log(
      `[VedaAI][EXTRACT-ANSWERS][${reqId}] ✓ ${withIds.length} block(s) in ${((Date.now() - t0) / 1000).toFixed(2)}s (${model})`,
    );
    return NextResponse.json({ blocks: withIds, model });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(`[VedaAI][EXTRACT-ANSWERS][${reqId}] ✗ ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
