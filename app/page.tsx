'use client'

import { useState } from 'react'

type FileKind = 'question' | 'answer'

const navItems = ['Home', 'My Classroom', 'Assignments', 'Exams', 'My Library']
const questions = [
  ['Which blood vessel carries blood away from the heart?', '2/2', 'good'],
  ['Which of the following organelles is primarily involved in photosynthesis?', '2/2', 'good'],
  ['Explain the role of chloroplasts in photosynthesis, naming the main pigments involved and briefly outlining the two major stages of the process.', '2/2', 'good'],
  ['Describe the flow of blood through the human heart starting from the right atrium and ending at the aorta; include the names of valves crossed.', '0/2', 'bad'],
  ['Draw a labelled diagram of an alveolus showing capillaries and air space (label alveolar sac, capillary, and direction of gas exchange).', '2/2', 'good'],
  ['Draw a neat labelled diagram of the human digestive system (stomach, small intestine, large intestine, liver, pancreas) and label the site where most absorption occurs.', '4/5', 'good'],
  ["Draw and label a nephron (Bowman's capsule, glomerulus, proximal tubule, loop of Henle, distal tubule, collecting duct).", '5/5', 'good'],
  ['Explain the structural differences between palisade mesophyll and spongy mesophyll and state how each structure aids its function in the leaf.', '3/5', 'warn'],
  ['Describe the process of transpiration in plants in two to three sentences and name two environmental factors that increase its rate.', '5/5', 'good'],
  ['Explain how the structure of xylem vessels facilitates water transport in plants (mention one structural feature and its role).', '4/5', 'good'],
]

function Icon({ children }: { children: React.ReactNode }) { return <span className="icon" aria-hidden="true">{children}</span> }

function Sidebar({ compact, onToggle }: { compact: boolean; onToggle: () => void }) {
  return <aside className={`sidebar ${compact ? 'compact' : ''}`}>
    <div className="brand"><span className="brand-mark">V</span>{!compact && <strong>VedaAI</strong>}<button className="collapse" onClick={onToggle} aria-label="Toggle navigation">{compact ? '»' : '◧'}</button></div>
    <button className="toolkit"><Icon>✦</Icon>{!compact && 'AI Teacher’s Toolkit'}</button>
    <nav aria-label="Primary navigation">{navItems.map((item) => <button className={item === 'Exams' ? 'active' : ''} key={item}><Icon>{item === 'Home' ? '▦' : item === 'My Classroom' ? '◩' : item === 'Assignments' ? '▤' : item === 'Exams' ? '▢' : '◔'}</Icon>{!compact && item}</button>)}</nav>
    {!compact && <div className="school"><div className="school-seal">✥</div><div><strong>Delhi Public School</strong><span>Bokaro Steel City</span></div></div>}
  </aside>
}

function Header() { return <header className="topbar"><button className="back" aria-label="Go back">←</button><div className="crumb"><Icon>▢</Icon><span>Exams</span></div><div className="top-actions"><button aria-label="Help">?</button><button className="notify" aria-label="Notifications">♧</button><button aria-label="AI assistant">✦</button><div className="avatar">◕</div><strong className="user-name">Madhur Rastogi</strong><span>⌄</span></div></header> }

function FileCard({ kind, file, onFile }: { kind: FileKind; file: File | null; onFile: (file: File) => void }) {
  const inputId = `${kind}-upload`
  return <label className="upload-card" htmlFor={inputId}>
    <input id={inputId} type="file" accept="application/pdf,.pdf" onChange={(e) => { const selected = e.target.files?.[0]; if (selected) onFile(selected) }} />
    {file ? <div className="file-pill"><div className="pdf">PDF</div><div><strong>{file.name}</strong><span>{Math.max(1, Math.round(file.size / 1024 / 1024))}MB <i>•</i> PDF</span></div><button type="button" aria-label={`Remove ${file.name}`} onClick={(e) => { e.preventDefault(); onFile(null as unknown as File) }}>×</button></div> : <><div className="upload-icon">↥</div><div className="upload-title">Upload <em>{kind === 'question' ? 'Question Paper' : 'Answer Sheet'}</em></div><span className="limit">Max 10MB</span></>}
  </label>
}

function UploadView({ onMapping }: { onMapping: () => void }) {
  const [questionFile, setQuestionFile] = useState<File | null>(null)
  const [answerFile, setAnswerFile] = useState<File | null>(null)
  const ready = questionFile && answerFile
  return <section className="upload-view"><div className="hero"><h1>Upload <span>Question Paper &amp; Answer Sheets</span></h1><p>Upload both files to get started</p><div className="teacher-art"><div>✦</div><span>♢</span><b>◉</b></div></div><div className="uploads"><FileCard kind="question" file={questionFile} onFile={setQuestionFile} /><FileCard kind="answer" file={answerFile} onFile={setAnswerFile} /></div><button className={`mapping-button ${ready ? 'ready' : ''}`} disabled={!ready} onClick={onMapping}>Start Mapping <span>→</span></button><p className="hint">Once both files are uploaded, you’ll able to map answers with questions</p></section>
}

function MappingView() {
 const [expanded, setExpanded] = useState(1)
 return <section className="mapping-view"><div className="questions-panel"><div className="panel-heading"><h2>Extracted Questions <small>(from question paper)</small></h2><button>Expand All</button></div><div className="question-list">{questions.map(([text, score, tone], i) => <article className={`question ${expanded === i ? 'open' : ''}`} key={text}><button className="question-row" onClick={() => setExpanded(expanded === i ? -1 : i)}><b className="number">{i + 1}</b><span className="question-text">{text}</span><strong className={`score ${tone}`}>{score}</strong><span className="chevron">{expanded === i ? '⌃' : '⌄'}</span></button>{expanded === i && <div className="feedback"><h3>AI Feedback</h3><p>Excellent work! You correctly identified the chloroplast as the organelle responsible for photosynthesis. Keep it up!</p></div>}</article>)}</div></div><div className="answer-panel"><div className="answer-toolbar"><h2>Answer Sheet</h2><div><button>−</button><span>100%</span><button>＋</button></div><div><button>‹</button><span>Page 1 of 4</span><button>›</button></div></div><div className="paper"><div className="paper-content"><span>Q1.</span><p>Photosynthesis is the process used by<br/>green plants and some other organisms<br/>to convert light energy into chemical<br/>energy.</p><div className="formula">6CO₂ + 6H₂O　— Light →　C₆H₁₂O₆ + 6O₂</div><div className="diagram">☼<br/><span>Sunlight</span><br/>↕<br/>🌿</div><div className="highlight"><b>Q2</b>The process mainly occurs in the chloroplast of the plant cell.</div></div></div></div></section>
}

export default function Page() {
 const [compact, setCompact] = useState(false)
 const [view, setView] = useState<'upload' | 'mapping'>('upload')
 return <main className="app-shell"><Sidebar compact={compact} onToggle={() => setCompact(!compact)} /><div className="content"><Header />{view === 'upload' ? <UploadView onMapping={() => setView('mapping')} /> : <MappingView />}</div></main>
}
          
