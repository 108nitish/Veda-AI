"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { fileToDataUrls } from "@/lib/fileUtils";

type FileKind = "question" | "answer";

const navItems = ["Home", "My Classroom", "Assignments", "Exams", "My Library"];

type Question = {
  id: number;
  label: string;
  text: string;
  marks: number | null;
  page: number;
};

type AnswerBlock = {
  id: number;
  page: number;
  label: string | null;
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
};

type MappingResult = {
  questionId: number;
  blockIds: number[];
  awarded: number;
  maxMarks: number;
  tone: "good" | "warn" | "bad";
  feedback: string;
  confidence: number;
};

type GradedQuestion = Question & MappingResult;

type EvaluationResult = {
  questions: GradedQuestion[];
  blocks: AnswerBlock[];
  unmatchedBlockIds: number[];
  totalAwarded: number;
  totalMax: number;
  overallFeedback: string;
};

type Step =
  | "idle"
  | "reading-files"
  | "reading-questions"
  | "reading-answers"
  | "mapping"
  | "done";

const STEP_ORDER: Step[] = [
  "reading-files",
  "reading-questions",
  "reading-answers",
  "mapping",
  "done",
];

const STEP_LABELS: Record<Step, string> = {
  idle: "Idle",
  "reading-files": "Reading uploaded files",
  "reading-questions": "Extracting questions from paper",
  "reading-answers": "Reading handwritten answers",
  mapping: "Mapping answers to questions & grading",
  done: "Done",
};

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <span className="icon" aria-hidden="true">
      {children}
    </span>
  );
}

function Sidebar({
  compact,
  onToggle,
  mobileOpen,
  onClose,
}: {
  compact: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={onClose}
        />
      )}
      <aside
        className={`sidebar ${compact ? "compact" : ""} ${mobileOpen ? "mobile-open" : ""}`}
      >
        <div className="brand">
          <span className="brand-mark">V</span>
          {!compact && <strong>VedaAI</strong>}
          <button
            className="collapse"
            onClick={onToggle}
            aria-label="Toggle navigation"
          >
            {compact ? "»" : "◧"}
          </button>
          <button
            className="mobile-close"
            onClick={onClose}
            aria-label="Close navigation"
          >
            ×
          </button>
        </div>
        <button className="toolkit">
          <Icon>✦</Icon>
          {!compact && "AI Teacher’s Toolkit"}
        </button>
        <nav aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              className={item === "Exams" ? "active" : ""}
              key={item}
              onClick={onClose}
            >
              <Icon>
                {item === "Home"
                  ? "▦"
                  : item === "My Classroom"
                    ? "◩"
                    : item === "Assignments"
                      ? "▤"
                      : item === "Exams"
                        ? "▢"
                        : "◔"}
              </Icon>
              {!compact && item}
            </button>
          ))}
        </nav>
        {!compact && (
          <div className="school">
            <div className="school-seal">✥</div>
            <div>
              <strong>YMCA University</strong>
              <span>Faridabad</span>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function Header({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="topbar">
      <button
        className="hamburger"
        onClick={onMenu}
        aria-label="Open navigation"
      >
        ☰
      </button>
      <button className="back" aria-label="Go back">
        ←
      </button>
      <div className="crumb">
        <span>Exams</span>
      </div>
      <div className="top-actions">
        <button aria-label="Help">?</button>
        <button className="notify" aria-label="Notifications">
          ♧
        </button>
        <button aria-label="AI assistant">✦</button>
        <div className="avatar">◕</div>
        <strong className="user-name">Nitish Jangra</strong>
      </div>
    </header>
  );
}

function FileCard({
  kind,
  file,
  onFile,
}: {
  kind: FileKind;
  file: File | null;
  onFile: (file: File | null) => void;
}) {
  const inputId = `${kind}-upload`;
  return (
    <label className="upload-card" htmlFor={inputId}>
      <input
        id={inputId}
        type="file"
        accept="application/pdf,.pdf,image/*"
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (selected) onFile(selected);
        }}
      />
      {file ? (
        <div className="file-pill">
          <div className="pdf">{file.type.includes("pdf") ? "PDF" : "IMG"}</div>
          <div>
            <strong>{file.name}</strong>
            <span>
              {Math.max(1, Math.round(file.size / 1024 / 1024))}MB <i>•</i>{" "}
              {file.type.includes("pdf") ? "PDF" : "Image"}
            </span>
          </div>
          <button
            type="button"
            aria-label={`Remove ${file.name}`}
            onClick={(e) => {
              e.preventDefault();
              onFile(null);
            }}
          >
            ×
          </button>
        </div>
      ) : (
        <>
          <div className="upload-icon">↥</div>
          <div className="upload-title">
            Upload{" "}
            <em>{kind === "question" ? "Question Paper" : "Answer Sheet"}</em>
          </div>
          <span className="limit">PDF or Image • Max 10MB</span>
        </>
      )}
    </label>
  );
}

function ProgressSteps({ step }: { step: Step }) {
  const activeIdx = STEP_ORDER.indexOf(step);
  return (
    <div className="progress-steps" role="status" aria-live="polite">
      {STEP_ORDER.slice(0, 4).map((s, i) => {
        const state =
          i < activeIdx ? "done" : i === activeIdx ? "active" : "pending";
        return (
          <div key={s} className={`progress-step ${state}`}>
            <span className="progress-dot">
              {state === "done" ? "✓" : i + 1}
            </span>
            <span className="progress-label">{STEP_LABELS[s]}</span>
          </div>
        );
      })}
    </div>
  );
}

function UploadView({
  questionFile,
  answerFile,
  onQuestionFile,
  onAnswerFile,
  onStart,
  loading,
  step,
}: {
  questionFile: File | null;
  answerFile: File | null;
  onQuestionFile: (f: File | null) => void;
  onAnswerFile: (f: File | null) => void;
  onStart: () => void;
  loading: boolean;
  step: Step;
}) {
  const ready = !!questionFile && !!answerFile;
  return (
    <section className="upload-view">
      <div className="hero">
        <h1>
          Upload <span>Question Paper &amp; Answer Sheets</span>
        </h1>
        <p className="hero-subtitle"> Upload both files to get started
        </p>
        <div className="teacher-art">
          <Image
            src="/teacher_image.png"
            alt="Teacher illustration"
            width={700}
            height={700}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
            priority
          />
        </div>
      </div>
      <div className="uploads">
        <FileCard kind="question" file={questionFile} onFile={onQuestionFile} />
        <FileCard kind="answer" file={answerFile} onFile={onAnswerFile} />
      </div>
      <button
        className={`mapping-button ${ready ? "ready" : ""}`}
        disabled={!ready || loading}
        onClick={onStart}
      >
        {loading ? (
          <>
            <span className="btn-spinner" aria-hidden />
            Extracting… this may take a while
          </>
        ) : (
          <>
            Start Mapping <span>→</span>
          </>
        )}
      </button>
      <p className="hint">
        Once both files are uploaded, you’ll able to map answers with questions
      </p>
      {loading && (
        <div className="extracting-card" role="status" aria-live="polite">
          <div className="extracting-spinner" />
          <div style={{ width: "100%" }}>
            <strong>Extracting with NVIDIA vision models…</strong>
            <p>
              This may take a while — we’re using free high-quality models to
              read your papers professionally.
            </p>
            <ProgressSteps step={step} />
            <div className="extracting-steps">
              <span>
                • Vision: nvidia/nemotron-3-nano-omni → nemotron-nano-12b-v2-vl
                → llama-3.2-11b/90b (fallback chain)
              </span>
              <span>
                • Grading: meta/llama-3.3-70b-instruct (free) — all pages
                handled
              </span>
              <span>• Supports: image, text-PDF, scanned-PDF — multi-page</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

type Selection = { type: "question" | "block"; id: number } | null;

function MappingView({
  data,
  answerImages,
  onBack,
}: {
  data: EvaluationResult;
  answerImages: string[];
  onBack: () => void;
}) {
  const [selection, setSelection] = useState<Selection>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const percent = data.totalMax
    ? Math.round((data.totalAwarded / data.totalMax) * 100)
    : 0;

  const blocksById = useMemo(
    () => new Map(data.blocks.map((b) => [b.id, b])),
    [data.blocks],
  );

  const unmatchedBlocks = useMemo(
    () => data.blocks.filter((b) => data.unmatchedBlockIds.includes(b.id)),
    [data.blocks, data.unmatchedBlockIds],
  );

  const highlightedBlockIds = useMemo(() => {
    if (!selection) return new Set<number>();
    if (selection.type === "block") return new Set([selection.id]);
    const q = data.questions.find((q) => q.id === selection.id);
    return new Set(q?.blockIds ?? []);
  }, [selection, data.questions]);

  function selectQuestion(q: GradedQuestion) {
    setExpanded((prev) => (prev === q.id ? null : q.id));
    if (q.blockIds.length === 0) {
      setSelection({ type: "question", id: q.id });
      return;
    }
    setSelection({ type: "question", id: q.id });
    const firstBlock = blocksById.get(q.blockIds[0]);
    if (firstBlock) {
      const el = pageRefs.current[firstBlock.page];
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function selectBlock(block: AnswerBlock) {
    setSelection({ type: "block", id: block.id });
    const el = pageRefs.current[block.page];
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const pageCount = answerImages.length;

  return (
    <section className="mapping-view">
      <div className="questions-panel">
        <div className="simple-result">
          <div className="simple-score-card">
            <p className="simple-label">This is your Score</p>
            <div className="simple-score">
              <b>{data.totalAwarded}</b>
              <span> / {data.totalMax}</span>
            </div>
            <div className="simple-percent">{percent}%</div>
            <p className="simple-caption">Marks awarded by AI</p>
          </div>
          <div className="ai-thought-card">
            <h3>What AI Thought</h3>
            <p>{data.overallFeedback}</p>
          </div>
        </div>

        <div className="question-list" style={{ marginTop: 16 }}>
          {data.questions.map((q) => {
            const answered = q.blockIds.length > 0;
            const isSelected =
              selection?.type === "question" && selection.id === q.id;
            return (
              <article
                className={`question ${expanded === q.id ? "open" : ""} ${isSelected ? "selected" : ""}`}
                key={q.id}
              >
                <button className="question-row" onClick={() => selectQuestion(q)}>
                  <b className="number">{q.label}</b>
                  <span className="question-text">{q.text}</span>
                  {answered ? (
                    <strong className={`score ${q.tone}`}>
                      {q.awarded}/{q.maxMarks}
                    </strong>
                  ) : (
                    <strong className="score unanswered">Not answered</strong>
                  )}
                  <span className="chevron">
                    {expanded === q.id ? "⌃" : "⌄"}
                  </span>
                </button>
                {expanded === q.id && (
                  <div className="feedback">
                    <h3>AI Thought for {q.label}</h3>
                    <p>{q.feedback}</p>
                    {answered ? (
                      <p
                        style={{
                          marginTop: 8,
                          fontStyle: "italic",
                          color: "#6b6b6f",
                        }}
                      >
                        Your answer: “
                        {q.blockIds
                          .map((id) => blocksById.get(id)?.text ?? "")
                          .filter(Boolean)
                          .join(" … ")
                          .slice(0, 220)}
                        ”
                        {q.blockIds.length > 1 && (
                          <span> (spans {q.blockIds.length} pages)</span>
                        )}
                      </p>
                    ) : (
                      <p
                        style={{
                          marginTop: 8,
                          color: "#b3391f",
                          fontWeight: 600,
                        }}
                      >
                        No matching answer was found on the answer sheet.
                      </p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {unmatchedBlocks.length > 0 && (
          <div className="unmatched-panel">
            <h3>Answers not matched to any question</h3>
            <p className="unmatched-hint">
              These handwritten blocks were found on the answer sheet but
              didn’t correspond to any printed question.
            </p>
            <div className="unmatched-list">
              {unmatchedBlocks.map((b) => (
                <button
                  key={b.id}
                  className={`unmatched-item ${selection?.type === "block" && selection.id === b.id ? "selected" : ""}`}
                  onClick={() => selectBlock(b)}
                >
                  <span className="unmatched-page">Page {b.page}</span>
                  {b.label && <span className="unmatched-label">“{b.label}”</span>}
                  <span className="unmatched-text">
                    {b.text.slice(0, 90) || "(no legible text)"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button className="upload-again" onClick={onBack}>
          ← Upload again
        </button>
      </div>

      <div className="answer-panel">
        <div className="answer-toolbar">
          <h2>Answer Sheet</h2>
          <div>
            <span style={{ fontSize: 13, opacity: 0.8 }}>
              {data.totalAwarded}/{data.totalMax}
            </span>
          </div>
        </div>
        <div className="paper">
          {pageCount ? (
            <div style={{ padding: 12, display: "grid", gap: 16 }}>
              {answerImages.map((src, i) => {
                const pageNum = i + 1;
                const pageBlocks = data.blocks.filter(
                  (b) => b.page === pageNum,
                );
                return (
                  <div
                    key={i}
                    ref={(el) => {
                      pageRefs.current[pageNum] = el;
                    }}
                    className="answer-page"
                  >
                    <span className="answer-page-label">Page {pageNum}</span>
                    <div className="answer-page-frame">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`Answer page ${pageNum}`} />
                      {pageBlocks.map((b) => {
                        const isActive = highlightedBlockIds.has(b.id);
                        const isUnmatched = data.unmatchedBlockIds.includes(
                          b.id,
                        );
                        return (
                          <div
                            key={b.id}
                            className={`bbox-marker ${isActive ? "active" : ""} ${isUnmatched ? "unmatched" : ""}`}
                            style={{
                              left: `${b.bbox.x}%`,
                              top: `${b.bbox.y}%`,
                              width: `${b.bbox.w}%`,
                              height: `${b.bbox.h}%`,
                            }}
                          >
                            {b.label && (
                              <span className="bbox-tag">{b.label}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="paper-content">
              <p>No answer sheet pages to display.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Page() {
  const [compact, setCompact] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [view, setView] = useState<"upload" | "mapping">("upload");
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [answerPreviews, setAnswerPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    if (!questionFile || !answerFile) return;
    setLoading(true);
    setError(null);
    try {
      setStep("reading-files");
      const [qImgs, aImgs] = await Promise.all([
        fileToDataUrls(questionFile, 12),
        fileToDataUrls(answerFile, 12),
      ]);
      setAnswerPreviews(aImgs);

      setStep("reading-questions");
      const qRes = await fetch("/api/extract-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: qImgs }),
      });
      const qJson = await qRes.json();
      if (!qRes.ok) throw new Error(qJson.error || "Question extraction failed");
      const questions: Question[] = qJson.questions;
      if (!questions.length) {
        throw new Error(
          "No questions could be detected in the question paper. Try a clearer scan.",
        );
      }

      setStep("reading-answers");
      const aRes = await fetch("/api/extract-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: aImgs }),
      });
      const aJson = await aRes.json();
      if (!aRes.ok) throw new Error(aJson.error || "Answer extraction failed");
      const blocks: AnswerBlock[] = aJson.blocks;

      setStep("mapping");
      const mRes = await fetch("/api/map-grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions: questions.map((q) => ({
            id: q.id,
            label: q.label,
            text: q.text,
            marks: q.marks,
          })),
          blocks: blocks.map((b) => ({
            id: b.id,
            page: b.page,
            label: b.label,
            text: b.text,
          })),
        }),
      });
      const mJson = await mRes.json();
      if (!mRes.ok) throw new Error(mJson.error || "Mapping/grading failed");
      const results: MappingResult[] = mJson.results;

      const resultByQ = new Map(results.map((r) => [r.questionId, r]));
      const gradedQuestions: GradedQuestion[] = questions.map((q) => {
        const r = resultByQ.get(q.id);
        return {
          ...q,
          questionId: q.id,
          blockIds: r?.blockIds ?? [],
          awarded: r?.awarded ?? 0,
          maxMarks: r?.maxMarks ?? q.marks ?? 5,
          tone: r?.tone ?? "bad",
          feedback: r?.feedback ?? "No feedback available.",
          confidence: r?.confidence ?? 0,
        };
      });

      setStep("done");
      setEvaluation({
        questions: gradedQuestions,
        blocks,
        unmatchedBlockIds: mJson.unmatchedBlockIds ?? [],
        totalAwarded: mJson.totalAwarded ?? 0,
        totalMax: mJson.totalMax ?? 0,
        overallFeedback: mJson.overallFeedback ?? "",
      });
      setView("mapping");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
      setStep("idle");
    }
  }

  return (
    <main className="app-shell">
      <Sidebar
        compact={compact}
        onToggle={() => setCompact(!compact)}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <div className="content">
        <Header onMenu={() => setMobileOpen(true)} />
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}{" "}
            <button
              onClick={() => setError(null)}
              style={{ marginLeft: 8, textDecoration: "underline" }}
            >
              dismiss
            </button>
          </div>
        )}
        {view === "upload" ? (
          <UploadView
            questionFile={questionFile}
            answerFile={answerFile}
            onQuestionFile={setQuestionFile}
            onAnswerFile={setAnswerFile}
            onStart={handleStart}
            loading={loading}
            step={step}
          />
        ) : evaluation ? (
          <MappingView
            data={evaluation}
            answerImages={answerPreviews}
            onBack={() => setView("upload")}
          />
        ) : null}
      </div>
    </main>
  );
}
