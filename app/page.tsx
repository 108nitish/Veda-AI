"use client";

import { useState } from "react";
import Image from "next/image";
import { fileToDataUrls } from "@/lib/fileUtils";

type FileKind = "question" | "answer";

const navItems = ["Home", "My Classroom", "Assignments", "Exams", "My Library"];

type GradedQuestion = {
  id: number;
  question: string;
  maxMarks: number;
  awarded: number;
  tone: "good" | "warn" | "bad";
  feedback: string;
  answerExcerpt: string;
  confidence: number;
};

type Evaluation = {
  questions: GradedQuestion[];
  questionPaperText: string;
  answerSheetText: string;
  totalAwarded: number;
  totalMax: number;
  overallFeedback: string;
  visionModels: { question: string; answer: string };
  model: string;
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

function UploadView({
  questionFile,
  answerFile,
  onQuestionFile,
  onAnswerFile,
  onStart,
  loading,
}: {
  questionFile: File | null;
  answerFile: File | null;
  onQuestionFile: (f: File | null) => void;
  onAnswerFile: (f: File | null) => void;
  onStart: () => void;
  loading: boolean;
}) {
  const ready = !!questionFile && !!answerFile;
  return (
    <section className="upload-view">
      <div className="hero">
        <h1>
          Upload <span>Question Paper &amp; Answer Sheets</span>
        </h1>
        <p className="hero-subtitle">
          <span className="hero-subtitle-grey">Upload</span>{" "}
          <span className="hero-subtitle-orange">
            Question Paper &amp; Answer Sheet
          </span>
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
          <div>
            <strong>Extracting text with NVIDIA vision…</strong>
            <p>
              This may take a while — we’re using free high-quality models to
              read your papers professionally.
            </p>
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

function MappingView({
  data,
  answerImages,
  onBack,
}: {
  data: Evaluation;
  answerImages: string[];
  onBack: () => void;
}) {
  const [expanded, setExpanded] = useState<number>(0);
  const percent = data.totalMax
    ? Math.round((data.totalAwarded / data.totalMax) * 100)
    : 0;

  return (
    <section className="mapping-view">
      <div className="questions-panel">
        {/* SIMPLE SCORE + AI THOUGHT — first iteration as requested */}
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
          {data.questions.map((q) => (
            <article
              className={`question ${expanded === q.id - 1 ? "open" : ""}`}
              key={q.id}
            >
              <button
                className="question-row"
                onClick={() =>
                  setExpanded(expanded === q.id - 1 ? -1 : q.id - 1)
                }
              >
                <b className="number">{q.id}</b>
                <span className="question-text">{q.question}</span>
                <strong className={`score ${q.tone}`}>
                  {q.awarded}/{q.maxMarks}
                </strong>
                <span className="chevron">
                  {expanded === q.id - 1 ? "⌃" : "⌄"}
                </span>
              </button>
              {expanded === q.id - 1 && (
                <div className="feedback">
                  <h3>AI Thought for Q{q.id}</h3>
                  <p>{q.feedback}</p>
                  {q.answerExcerpt && (
                    <p
                      style={{
                        marginTop: 8,
                        fontStyle: "italic",
                        color: "#6b6b6f",
                      }}
                    >
                      Your answer: “{q.answerExcerpt}”
                    </p>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>

        <button
          onClick={onBack}
          style={{
            marginTop: 14,
            padding: "10px 16px",
            borderRadius: 12,
            background: "#fff",
            fontSize: 14,
          }}
        >
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
          {answerImages.length ? (
            <div style={{ padding: 12, display: "grid", gap: 12 }}>
              {answerImages.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt={`Answer page ${i + 1}`}
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    background: "#fff",
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="paper-content">
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                  fontSize: 15,
                  lineHeight: 1.6,
                }}
              >
                {data.answerSheetText}
              </pre>
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
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [answerPreviews, setAnswerPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    if (!questionFile || !answerFile) return;
    setLoading(true);
    setError(null);
    try {
      console.log(
        `[VedaAI][CLIENT] Starting conversion: Q=${questionFile.name} (${Math.round(questionFile.size / 1024)}KB), A=${answerFile.name} (${Math.round(answerFile.size / 1024)}KB)`,
      );
      const [qImgs, aImgs] = await Promise.all([
        fileToDataUrls(questionFile, 12),
        fileToDataUrls(answerFile, 12),
      ]);
      console.log(
        `[VedaAI][CLIENT] Converted → Q:${qImgs.length} pages, A:${aImgs.length} pages, calling /api/evaluate...`,
      );
      setAnswerPreviews(aImgs);

      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionImages: qImgs, answerImages: aImgs }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Evaluation failed");
      setEvaluation(json as Evaluation);
      setView("mapping");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
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
