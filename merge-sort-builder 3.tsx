import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BespokeTaskProps } from "../bespoke-task-runner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, RefreshCw, Send, Trash2 } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════
// Content: 40 fruits, each 10 characters or fewer
// ═══════════════════════════════════════════════════════════════════════════

const FRUITS: string[] = [
  "Apple", "Banana", "Cherry", "Mango", "Grape", "Melon", "Papaya", "Guava",
  "Lychee", "Kiwi", "Peach", "Plum", "Pear", "Lemon", "Lime", "Orange",
  "Apricot", "Fig", "Date", "Coconut", "Avocado", "Cantaloupe", "Tangerine",
  "Mandarin", "Rambutan", "Durian", "Jackfruit", "Starfruit", "Blueberry",
  "Cranberry", "Raspberry", "Persimmon", "Nectarine", "Longan", "Currant",
  "Quince", "Tamarind", "Soursop", "Sapodilla", "Feijoa",
];

const ROUND_COUNT = 5;
const SLOT_W = 68; // px, width of a single word slot

// ═══════════════════════════════════════════════════════════════════════════
// Merge sort tree generation
// ═══════════════════════════════════════════════════════════════════════════

interface BoxData {
  id: string;
  row: number;
  size: number;
  isRoot: boolean; // the single given box at the very top (the unsorted starting array)
  words: string[]; // the correct contents of this box, in order
  parents: string[]; // ids of the box(es) directly above that feed into this box
}

interface RoundData {
  index: number;
  rows: BoxData[][];
  leafRowIdx: number; // row index where every box has size 1 (boundary between splitting and merging)
  totalWordSlots: number;
  totalConnections: number;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mergeWords(a: string[], b: string[]): string[] {
  const res: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] <= b[j]) res.push(a[i++]);
    else res.push(b[j++]);
  }
  while (i < a.length) res.push(a[i++]);
  while (j < b.length) res.push(b[j++]);
  return res;
}

function buildTree(words: string[]): { rows: BoxData[][]; leafRowIdx: number } {
  let idCounter = 0;
  const rows: BoxData[][] = [];

  // ── Root: the whole unsorted starting array, given to the student ──
  const root: BoxData = {
    id: `b${idCounter++}`,
    row: 0,
    size: words.length,
    isRoot: true,
    words: [...words],
    parents: [],
  };
  rows.push([root]);

  // ── Split phase: halve each box (preserving order) down to single elements ──
  let current: BoxData[] = [root];
  let row = 1;
  while (current.some((b) => b.size > 1)) {
    const next: BoxData[] = [];
    current.forEach((b) => {
      if (b.size === 1) {
        // already a single element — carry it straight down so every branch
        // stays aligned on the same row until the whole level is split
        next.push({ id: `b${idCounter++}`, row, size: 1, isRoot: false, words: b.words, parents: [b.id] });
      } else {
        const half = Math.floor(b.size / 2);
        const leftWords = b.words.slice(0, half);
        const rightWords = b.words.slice(half);
        next.push({ id: `b${idCounter++}`, row, size: leftWords.length, isRoot: false, words: leftWords, parents: [b.id] });
        next.push({ id: `b${idCounter++}`, row, size: rightWords.length, isRoot: false, words: rightWords, parents: [b.id] });
      }
    });
    rows.push(next);
    current = next;
    row++;
  }
  const leafRowIdx = row - 1; // every box in `current` now has size 1

  // ── Merge phase: build merge rows, skipping trivial size-1 pass-throughs.
  // A size-1 path needs no new box – the existing leaf/split box is reused as
  // the representative so that higher-level merge boxes can reference it directly.
  // This means some merge rows will have fewer boxes than the corresponding
  // split rows, and connections may span more than one row.
  let mergeRepById = new Map<string, BoxData>(current.map((b) => [b.id, b]));
  for (let splitRowIdx = leafRowIdx - 1; splitRowIdx >= 0; splitRowIdx--) {
    const splitRow = rows[splitRowIdx];
    const splitChildren = rows[splitRowIdx + 1];
    const nextMergeRepById = new Map<string, BoxData>();
    const mergeBoxes: BoxData[] = [];

    splitRow.forEach((splitBox) => {
      const childReps = splitChildren
        .filter((child) => child.parents.includes(splitBox.id))
        .map((child) => mergeRepById.get(child.id))
        .filter((b): b is BoxData => !!b);

      if (childReps.length === 2) {
        // Real merge of two inputs – create a new box.
        const words = mergeWords(childReps[0].words, childReps[1].words);
        const newBox: BoxData = {
          id: `b${idCounter++}`,
          row,
          size: words.length,
          isRoot: false,
          words,
          parents: childReps.map((b) => b.id),
        };
        mergeBoxes.push(newBox);
        nextMergeRepById.set(splitBox.id, newBox);
      } else if (childReps.length === 1) {
        // Trivial size-1 pass-through – reuse the existing representative; no new box.
        nextMergeRepById.set(splitBox.id, childReps[0]);
      }
    });

    if (mergeBoxes.length > 0) {
      rows.push(mergeBoxes);
      row++;
    }
    mergeRepById = nextMergeRepById;
    current = mergeBoxes;
  }

  return { rows, leafRowIdx };
}

function buildRound(index: number): RoundData {
  const n = 7 + Math.floor(Math.random() * 3); // 7, 8, or 9
  const words = shuffle(FRUITS).slice(0, n);
  const { rows, leafRowIdx } = buildTree(words);
  let totalWordSlots = 0;
  let totalConnections = 0;
  rows.slice(1).forEach((r) =>
    r.forEach((b) => {
      totalWordSlots += b.size;
      totalConnections += b.parents.length;
    })
  );
  return { index, rows, leafRowIdx, totalWordSlots, totalConnections };
}

// ═══════════════════════════════════════════════════════════════════════════
// Scoring helpers
// ═══════════════════════════════════════════════════════════════════════════

type Placements = Record<string, (string | null)[]>;
interface Connection {
  id: string;
  from: string;
  to: string;
}

function evaluateWords(round: RoundData, placements: Placements) {
  const status: Record<string, boolean[]> = {};
  round.rows.slice(1).forEach((r) =>
    r.forEach((b) => {
      const placed = placements[b.id] ?? Array(b.size).fill(null);
      status[b.id] = b.words.map((w, i) => placed[i] === w);
    })
  );
  return status;
}

function evaluateConnections(round: RoundData, connections: Connection[]) {
  const validEdges = new Set<string>();
  round.rows.slice(1).forEach((r) =>
    r.forEach((b) => b.parents.forEach((p) => validEdges.add(`${p}->${b.id}`)))
  );
  const status: Record<string, boolean> = {};
  connections.forEach((c) => {
    status[c.id] = validEdges.has(`${c.from}->${c.to}`);
  });
  return status;
}

function computeRoundScore(round: RoundData, placements: Placements, connections: Connection[]) {
  const wordStatus = evaluateWords(round, placements);
  const connStatus = evaluateConnections(round, connections);
  let correctWords = 0;
  Object.values(wordStatus).forEach((arr) => arr.forEach((v) => v && correctWords++));
  const achievedEdges = new Set<string>();
  connections.forEach((c) => {
    if (connStatus[c.id]) achievedEdges.add(`${c.from}->${c.to}`);
  });
  return {
    correctWords,
    totalWords: round.totalWordSlots,
    correctConn: achievedEdges.size,
    totalConn: round.totalConnections,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Small presentational pieces
// ═══════════════════════════════════════════════════════════════════════════

function Slot({
  value,
  status,
  selected,
  onDrop,
  onRemove,
  onClick,
}: {
  value: string | null;
  status?: boolean;
  selected: boolean;
  onDrop: (word: string) => void;
  onRemove: () => void;
  onClick: () => void;
}) {
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const w = e.dataTransfer.getData("application/x-word");
        if (w) onDrop(w);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "relative flex h-9 shrink-0 items-center justify-center rounded-md border text-[11px] sm:text-xs select-none cursor-pointer transition-colors",
        value
          ? "border-border bg-background text-foreground"
          : "border-dashed border-border/70 bg-muted/40 hover:bg-muted/70",
        selected && "ring-2 ring-primary"
      )}
      style={{ width: SLOT_W }}
    >
      {value ? (
        <>
          <span className="truncate px-1">{value}</span>
          {status === true && (
            <CheckCircle2 className="absolute -left-1.5 -top-1.5 h-3.5 w-3.5 rounded-full bg-background text-green-500" />
          )}
          {status === false && (
            <XCircle className="absolute -left-1.5 -top-1.5 h-3.5 w-3.5 rounded-full bg-background text-red-500" />
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label="Remove word"
            className="absolute bottom-0.5 right-0.5 rounded-full bg-background border border-border p-0.5 text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <span className="text-muted-foreground">·</span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main task component
// ═══════════════════════════════════════════════════════════════════════════

export default function MergeSortBuilder({ assignmentId, maxScore, onComplete }: BespokeTaskProps) {
  const [rounds] = useState<RoundData[]>(() =>
    Array.from({ length: ROUND_COUNT }, (_, i) => buildRound(i))
  );
  const [roundIdx, setRoundIdx] = useState(0);
  const round = rounds[roundIdx];

  const [placements, setPlacements] = useState<Placements>({});
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [draggingFrom, setDraggingFrom] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [checkResult, setCheckResult] = useState<{
    wordStatus: Record<string, boolean[]>;
    connStatus: Record<string, boolean>;
  } | null>(null);
  const [cumulative, setCumulative] = useState({
    correctWords: 0,
    totalWords: 0,
    correctConn: 0,
    totalConn: 0,
  });
  const [, forceTick] = useState(0);

  const startTimeRef = useRef<number>(Date.now());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const boxRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const boxIndex = useMemo(() => {
    const m: Record<string, BoxData> = {};
    round.rows.forEach((r) => r.forEach((b) => (m[b.id] = b)));
    return m;
  }, [round]);

  // Reset per-round state when the round changes
  useEffect(() => {
    setPlacements({});
    setConnections([]);
    setSelectedWord(null);
    setSelectedSource(null);
    setCheckResult(null);
  }, [roundIdx]);

  // Force a re-render (and thus a recomputed line layout) on resize
  useEffect(() => {
    const onResize = () => forceTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const clearCheck = () => setCheckResult(null);

  const placeWord = useCallback((boxId: string, slotIndex: number, word: string) => {
    setPlacements((prev) => {
      const box = boxIndex[boxId];
      const arr = prev[boxId] ? [...prev[boxId]] : Array(box.size).fill(null);
      arr[slotIndex] = word;
      return { ...prev, [boxId]: arr };
    });
    clearCheck();
  }, [boxIndex]);

  const removeWord = useCallback((boxId: string, slotIndex: number) => {
    setPlacements((prev) => {
      if (!prev[boxId]) return prev;
      const arr = [...prev[boxId]];
      arr[slotIndex] = null;
      return { ...prev, [boxId]: arr };
    });
    clearCheck();
  }, []);

  const tryConnect = useCallback(
    (fromId: string, toId: string) => {
      const fromBox = boxIndex[fromId];
      const toBox = boxIndex[toId];
      if (!fromBox || !toBox || fromId === toId) return;
      if (!toBox.parents.includes(fromId)) return; // fromId must be a registered parent of toId
      setConnections((prev) => {
        if (prev.some((c) => c.from === fromId && c.to === toId)) return prev;
        return [...prev, { id: `c-${fromId}-${toId}-${prev.length}`, from: fromId, to: toId }];
      });
      clearCheck();
      setSelectedSource(null);
    },
    [boxIndex]
  );

  const removeConnection = useCallback((connId: string) => {
    setConnections((prev) => prev.filter((c) => c.id !== connId));
    clearCheck();
  }, []);

  const handleSourceClick = (boxId: string) => {
    const b = boxIndex[boxId];
    const isLastRow = b.row === round.rows.length - 1;
    if (isLastRow) return;
    setSelectedSource((prev) => (prev === boxId ? null : boxId));
  };

  const handleWordSelect = (word: string) => {
    setSelectedWord((prev) => (prev === word ? null : word));
  };

  const handleBoxClick = (box: BoxData) => {
    if (selectedSource && selectedSource !== box.id) {
      tryConnect(selectedSource, box.id);
    }
  };

  const handleWordClick = (boxId: string, slotIndex: number, word: string | null) => {
    if (word && selectedWord !== word) {
      handleWordSelect(word);
    } else if (word && selectedWord === word) {
      setSelectedWord(null);
    }
  };

  const anchor = (id: string, pos: "top" | "bottom") => {
    const el = boxRefs.current[id];
    const cont = containerRef.current;
    if (!el || !cont) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const cr = cont.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - cr.left,
      y: (pos === "bottom" ? r.bottom : r.top) - cr.top,
    };
  };

  // Live score preview (not yet committed to cumulative totals)
  const live = computeRoundScore(round, placements, connections);
  const cumCorrect = cumulative.correctWords + cumulative.correctConn;
  const cumTotal = cumulative.totalWords + cumulative.totalConn;
  const previewCorrect = cumCorrect + live.correctWords + live.correctConn;
  const previewTotal = cumTotal + live.totalWords + live.totalConn;

  const handleCheck = () => {
    setCheckResult({
      wordStatus: evaluateWords(round, placements),
      connStatus: evaluateConnections(round, connections),
    });
  };

  const handleReset = () => {
    setPlacements({});
    setConnections([]);
    setSelectedWord(null);
    setSelectedSource(null);
    setCheckResult(null);
  };

  const handleAdvance = () => {
    const roundScore = computeRoundScore(round, placements, connections);
    const newCumulative = {
      correctWords: cumulative.correctWords + roundScore.correctWords,
      totalWords: cumulative.totalWords + roundScore.totalWords,
      correctConn: cumulative.correctConn + roundScore.correctConn,
      totalConn: cumulative.totalConn + roundScore.totalConn,
    };
    setCumulative(newCumulative);

    if (roundIdx === rounds.length - 1) {
      const totalCorrect = newCumulative.correctWords + newCumulative.correctConn;
      const totalPossible = newCumulative.totalWords + newCumulative.totalConn;
      const pct = totalPossible > 0 ? (totalCorrect / totalPossible) * 100 : 0;
      const score = Math.round((pct / 100) * maxScore);
      const timeTakenSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
      onComplete({ score: Math.max(0, Math.min(maxScore, score)), timeTakenSeconds });
    } else {
      setRoundIdx((r) => r + 1);
    }
  };

  const lastRowIdx = round.rows.length - 1;
  const isLastRound = roundIdx === rounds.length - 1;

  return (
    <div
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-6 text-foreground"
      data-assignment-id={assignmentId}
    >
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base sm:text-lg font-semibold">Merge Sort Builder</h2>
          <Badge variant="secondary">Round {roundIdx + 1} of {rounds.length}</Badge>
        </div>
        <Progress value={(roundIdx / rounds.length) * 100} className="h-2" />
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          Sort the fruit at the top using merge sort. First <b>split</b> the array in half
          repeatedly until every box holds one fruit, then <b>merge</b> boxes back together in
          sorted order. <b>Drag</b> a fruit into the correct box (you can reuse each fruit as
          many times as it appears going down the tree). Then connect each box to the box(es)
          below it: drag from the small dot under a box down to the dot on top of the next box,
          <em> or</em> click a box to select it and click the target box to link them (click the
          selected box again to cancel). Click a wrong connection line, or the trash icon on a word, to
          remove it and try again.
        </p>
      </div>

      {/* Diagram */}
      <div
        ref={containerRef}
        className="relative overflow-x-auto rounded-xl border border-border/60 bg-background/40 p-4 sm:p-6"
        onDragOver={(e) => {
          if (draggingFrom) {
            const cr = containerRef.current?.getBoundingClientRect();
            if (cr) setGhostPos({ x: e.clientX - cr.left, y: e.clientY - cr.top });
          }
        }}
      >
        <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }}>
          <defs>
            <marker id="msb-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" className="fill-current text-muted-foreground" />
            </marker>
          </defs>
          {connections.map((c) => {
            const p1 = anchor(c.from, "bottom");
            const p2 = anchor(c.to, "top");
            const status = checkResult?.connStatus[c.id];
            const stroke =
              status === true ? "#22c55e" : status === false ? "#ef4444" : "currentColor";
            return (
              <g
                key={c.id}
                style={{ pointerEvents: "auto", cursor: "pointer" }}
                onClick={() => removeConnection(c.id)}
                className="text-muted-foreground"
              >
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={14} />
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={stroke}
                  strokeWidth={2.5}
                  markerEnd="url(#msb-arrow)"
                />
              </g>
            );
          })}
          {draggingFrom &&
            ghostPos &&
            (() => {
              const p1 = anchor(draggingFrom, "bottom");
              return (
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={ghostPos.x}
                  y2={ghostPos.y}
                  stroke="currentColor"
                  strokeDasharray="4 3"
                  strokeWidth={2}
                  className="text-primary/60"
                />
              );
            })()}
        </svg>

        <div className="relative flex flex-col items-center gap-10">
          {round.rows.map((rowBoxes, rIdx) => (
            <div key={rIdx} className="flex flex-col items-center gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {rIdx === 0
                  ? "Starting array (unsorted)"
                  : rIdx === round.leafRowIdx
                  ? "Individual elements"
                  : rIdx === lastRowIdx
                  ? "Sorted result"
                  : rIdx < round.leafRowIdx
                  ? `Split step ${rIdx}`
                  : `Merge step ${rIdx - round.leafRowIdx}`}
              </span>
              <div className="flex items-end gap-4">
                {rowBoxes.map((box) => {
                  const hasNextRow = box.row < lastRowIdx;
                  const isValidTarget =
                    !!selectedSource && box.parents.includes(selectedSource);

                  // Top connector node: shows whether this box's incoming
                  // connection(s) are in place / correct
                  const incomingConns = box.parents.map((p) =>
                    connections.find((c) => c.from === p && c.to === box.id)
                  );
                  const incomingStatuses = incomingConns.map((c) =>
                    c ? checkResult?.connStatus[c.id] : undefined
                  );
                  const topNodeColor =
                    checkResult && box.parents.length > 0
                      ? incomingStatuses.every((s) => s === true)
                        ? "border-green-500 bg-green-500"
                        : incomingStatuses.some((s) => s === false)
                        ? "border-red-500 bg-red-500"
                        : "border-muted-foreground/50"
                      : incomingConns.some(Boolean)
                      ? "border-primary bg-primary/70"
                      : "border-muted-foreground/50";

                  return (
                    <div key={box.id} className="relative flex flex-col items-center">
                      {box.row > 0 && (
                        <div
                          className={cn(
                            "-mb-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 bg-background",
                            topNodeColor
                          )}
                        />
                      )}
                      <div
                        ref={(el) => (boxRefs.current[box.id] = el)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          const fromId = e.dataTransfer.getData("application/x-connector");
                          if (fromId) tryConnect(fromId, box.id);
                        }}
                        onClick={() => handleBoxClick(box)}
                        className={cn(
                          "rounded-xl border-2 bg-card p-1.5 transition-colors",
                          isValidTarget
                            ? "border-primary/60 ring-2 ring-primary/30 cursor-pointer"
                            : "border-border"
                        )}
                      >
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          {box.row === 0
                            ? box.words.map((w, i) => (
                                <div
                                  key={i}
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData("application/x-word", w);
                                    e.dataTransfer.effectAllowed = "copy";
                                  }}
                                  onClick={() => handleWordSelect(w)}
                                  className={cn(
                                    "flex h-9 shrink-0 select-none items-center justify-center rounded-md border bg-background px-2 text-[11px] sm:text-xs cursor-grab active:cursor-grabbing hover:bg-accent",
                                    selectedWord === w && "ring-2 ring-primary"
                                  )}
                                  style={{ width: SLOT_W }}
                                >
                                  {w}
                                </div>
                              ))
                            : Array.from({ length: box.size }).map((_, i) => (
                                <Slot
                                  key={i}
                                  value={placements[box.id]?.[i] ?? null}
                                  status={checkResult?.wordStatus[box.id]?.[i]}
                                  selected={selectedWord === placements[box.id]?.[i]}
                                  onDrop={(w) => placeWord(box.id, i, w)}
                                  onRemove={() => removeWord(box.id, i)}
                                  onClick={() => {
                                    const currentWord = placements[box.id]?.[i] ?? null;
                                    if (currentWord) {
                                      handleWordClick(box.id, i, currentWord);
                                    } else if (selectedWord) {
                                      placeWord(box.id, i, selectedWord);
                                      setSelectedWord(null);
                                    }
                                  }}
                                />
                              ))}
                        </div>
                      </div>
                      {hasNextRow && (
                        <button
                          type="button"
                          aria-label="Start a connection from this box"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("application/x-connector", box.id);
                            e.dataTransfer.effectAllowed = "link";
                            setDraggingFrom(box.id);
                          }}
                          onDragEnd={() => {
                            setDraggingFrom(null);
                            setGhostPos(null);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSourceClick(box.id);
                          }}
                          className={cn(
                            "-mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 bg-background transition-transform hover:scale-125",
                            selectedSource === box.id
                              ? "border-primary bg-primary"
                              : "border-muted-foreground/50"
                          )}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feedback + controls */}
      <div className="flex flex-col gap-3">
        {checkResult && (
          <p className="text-xs sm:text-sm">
            This round — words correct: <b>{live.correctWords}/{live.totalWords}</b> · connections
            correct: <b>{live.correctConn}/{live.totalConn}</b>
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            Running score: {previewCorrect}/{previewTotal} points
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleReset}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Try again
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={handleCheck}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Check
            </Button>
            <Button type="button" size="sm" onClick={handleAdvance}>
              <Send className="mr-1.5 h-4 w-4" />
              {isLastRound ? "Submit result" : "Next round"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}