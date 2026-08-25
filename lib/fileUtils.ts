"use client";

function tsLog(stage: string, msg: string, extra?: Record<string, unknown>) {
  console.log(
    `[${new Date().toISOString()}] [VedaAI][${stage}] ${msg}`,
    extra ?? "",
  );
}

// Convert File (image/pdf) -> base64 data URLs for vision model
// Handles: image (single), PDF with extractable text, PDF of images, multi-page
export async function fileToDataUrls(
  file: File,
  maxPages = 12,
): Promise<string[]> {
  tsLog("FILE", `Processing ${file.name}`, {
    type: file.type,
    sizeKB: Math.round(file.size / 1024),
    maxPages,
  });

  if (file.type.startsWith("image/")) {
    tsLog("FILE", `→ Image detected, converting to dataURL`);
    const url = await readAsDataUrl(file);
    tsLog("FILE", `✓ Image ready`, { chars: url.length });
    return [url];
  }

  if (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  ) {
    tsLog("FILE", `→ PDF detected, analyzing pages`);
    return await pdfToDataUrls(file, maxPages);
  }

  tsLog("FILE", `→ Unknown type, treating as image`);
  return [await readAsDataUrl(file)];
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Hybrid: try text extraction first to detect text-PDF vs image-PDF, but always render images for vision
async function pdfToDataUrls(file: File, maxPages: number): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjs = await import("pdfjs-dist");

  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  }

  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  tsLog("PDF", `PDF loaded`, {
    totalPages: pdf.numPages,
    willProcess: Math.min(pdf.numPages, maxPages),
  });

  // Detect extractable text vs scanned image PDF
  let totalTextChars = 0;
  const pageTextSamples: string[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
    try {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((it) => ("str" in it ? (it as { str: string }).str : ""))
        .join(" ");
      totalTextChars += text.length;
      if (text.length > 50) pageTextSamples.push(`P${i}: ${text.slice(0, 80)}`);
    } catch {
      // ignore
    }
  }
  const isTextPdf = totalTextChars > 200;
  tsLog(
    "PDF",
    isTextPdf
      ? "→ Text-PDF detected (extractable text found)"
      : "→ Image-PDF detected (scanned/handwritten)",
    {
      totalTextChars,
      avgPerPage: Math.round(totalTextChars / Math.min(pdf.numPages, maxPages)),
      samples: pageTextSamples.slice(0, 2),
    },
  );

  // Always render to images for vision model — works for both types professionally
  // For text-PDFs, vision still excels and preserves layout/diagrams
  const urls: string[] = [];
  const pages = Math.min(pdf.numPages, maxPages);
  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.8 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    tsLog("PDF", `Rendering page ${i}/${pages}`, {
      width: canvas.width,
      height: canvas.height,
    });
    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      canvas,
    } as unknown as Parameters<typeof page.render>[0]).promise;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    urls.push(dataUrl);
    tsLog("PDF", `✓ Page ${i} rendered`, { dataUrlChars: dataUrl.length });
  }

  tsLog("PDF", `✓ PDF converted to ${urls.length} image(s) for vision model`);

  if (!urls.length) {
    tsLog("PDF", "⚠ No images rendered, falling back to dataURL");
    return [await readAsDataUrl(file)];
  }
  return urls;
}

// Optional helper to also get raw extractable text for debugging/logging
export async function extractPdfText(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfjs = await import("pdfjs-dist");
    if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
    }
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let full = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      const pageText = tc.items
        .map((it) => ("str" in it ? (it as { str: string }).str : ""))
        .join(" ");
      full += `\n[Page ${i}]\n${pageText}`;
    }
    return full;
  } catch (e) {
    console.warn("extractPdfText failed", e);
    return "";
  }
}
