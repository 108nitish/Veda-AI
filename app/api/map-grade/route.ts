import { NextRequest, NextResponse } from "next/server";
import { mapAndGrade } from "@/lib/nvidia";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const reqId = Math.random().toString(36).slice(2, 7);
  const t0 = Date.now();
  console.log(`[VedaAI][MAP-GRADE][${reqId}] → request received`);
  try {
    const { questions, blocks } = (await req.json()) as {
      questions: Array<{
        id: number;
        label: string;
        text: string;
        marks: number | null;
      }>;
      blocks: Array<{
        id: number;
        page: number;
        label: string | null;
        text: string;
      }>;
    };

    if (!questions?.length) {
      return NextResponse.json(
        { error: "questions required" },
        { status: 400 },
      );
    }

    const result = await mapAndGrade(questions, blocks || []);

    console.log(
      `[VedaAI][MAP-GRADE][${reqId}] ✓ done in ${((Date.now() - t0) / 1000).toFixed(2)}s — ${result.totalAwarded}/${result.totalMax} (${result.model})`,
    );
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(`[VedaAI][MAP-GRADE][${reqId}] ✗ ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
