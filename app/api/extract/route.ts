import { NextRequest, NextResponse } from "next/server";
import { extractTextProfessional } from "@/lib/nvidia";

export const maxDuration = 60;

function log(stage: string, msg: string, extra?: Record<string, unknown>) {
  console.log(
    `[${new Date().toISOString()}] [VedaAI][${stage}] ${msg}`,
    extra ? JSON.stringify(extra) : "",
  );
}

export async function POST(req: NextRequest) {
  const reqId = Math.random().toString(36).slice(2, 7);
  log("EXTRACT-API", `→ [${reqId}] Request received`);
  try {
    const body = await req.json();
    const { images, kind } = body as {
      images: string[];
      kind: "question" | "answer";
    };
    log("EXTRACT-API", `[${reqId}] Params`, { kind, pages: images?.length });

    if (!images || !Array.isArray(images) || images.length === 0) {
      log("EXTRACT-API", `[${reqId}] ✗ No images`);
      return NextResponse.json(
        { error: "No images provided" },
        { status: 400 },
      );
    }
    if (kind !== "question" && kind !== "answer") {
      return NextResponse.json(
        { error: "kind must be question|answer" },
        { status: 400 },
      );
    }

    log(
      "EXTRACT-API",
      `[${reqId}] Stage 1: Starting professional OCR extraction`,
      { kind, pages: images.length },
    );
    const start = Date.now();
    const { extractedText, model } = await extractTextProfessional(
      images,
      kind,
    );
    log(
      "EXTRACT-API",
      `[${reqId}] ✓ Extraction done in ${((Date.now() - start) / 1000).toFixed(2)}s`,
      {
        model,
        chars: extractedText.length,
      },
    );

    return NextResponse.json({ extractedText, model, pages: images.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    log("EXTRACT-API", `[${reqId}] ✗ Failed: ${msg}`);
    console.error(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
