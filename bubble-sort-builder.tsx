import { useCallback, useEffect, useRef, useState } from "react";
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
// Bubble sort pass generation
// ═══════════════════════════════════════════════════════════════════════════

interface PassData {
  id: string;
  passIndex: number; // 0 = initial unsorted array
  words: string[]; // correct array state after this pass
  isInitial: boolean;
}

interface RoundData {
  index: number;
  passes: PassData[];
  totalWordSlots: number; // sum of slot counts across all non-initial passes
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function bubbleSortPasses(words: string[]): string[][] {
  const allPasses: string[][] = [[...words]];
  let current = [...words];
  for (let pass = 0; pass < current.length - 1; pass++) {
    const next = [...current];
    let swapped = false;
    for (let j = 0; j < next.length - 1 - pass; j++) {
      if (next[j] > next[j + 1]) {
        [next[j], next[j + 1]] = [next[j + 1], next[j]];
        swapped = true;
      }
    }
    allPasses.push([...next]);
    current = next;
    if (!swapped) break;
  }
  return allPasses;
}

function buildRound(index: number): RoundData {
  const n = 5 + Math.floor(Math.random() * 2); // 5 or 6 elements
  const words = shuffle(FRUITS).slice(0, n);
  const allPassWords = bubbleSortPasses(words);

  const passes: PassData[] = allPassWords.map((passWords, i) => ({
    id: `r${index}-p${i}`,
    passIndex: i,
    words: passWords,
    isInitial: i === 0,
  }));

  const totalWordSlots = passes.slice(1).reduce((sum, p) => sum + p.words.length, 0);

  return { index, passes, totalWordSlots };
}

// ═══════════════════════════════════════════════════════════════════════════
// Scoring helpers
// ═══════════════════════════════════════════════════════════════════════════

type Placements = Record<string, (string | null)[]>;

function evaluateWords(round: RoundData, placements: Placements) {
  const status: Record<string, boolean[]> = {};
  round.passes.slice(1).forEach((p) => {
    const placed = placements[p.id] ?? Array(p.words.length).fill(null);
    status[p.id] = p.words.map((w, i) => placed[i] === w);
  });
  return status;
}

function computeRoundScore(round: RoundData, placements: Placements) {
  const wordStatus = evaluateWords(round, placements);
  let correctWords = 0;
  Object.values(wordStatus).forEach((arr) => arr.forEach((v) => v && correctWords++));
  return { correctWords, totalWords: round.totalWordSlots };
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
          <span className="block w-full truncate px-1 pr-6 text-center">{value}</span>
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
            className="absolute bottom-0 right-0 m-0.5 rounded-full border border-border bg-background p-0.5 text-muted-foreground hover:text-foreground"
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

export default function BubbleSortBuilder({ assignmentId, maxScore, onComplete }: BespokeTaskProps) {
  const [rounds] = useState<RoundData[]>(() =>
    Array.from({ length: ROUND_COUNT }, (_, i) => buildRound(i))
  );
  const [roundIdx, setRoundIdx] = useState(0);
  const round = rounds[roundIdx];

  const [placements, setPlacements] = useState<Placements>({});
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<Record<string, boolean[]> | null>(null);
  const [cumulative, setCumulative] = useState({ correctWords: 0, totalWords: 0 });

  const startTimeRef = useRef<number>(Date.now());

  // Reset per-round state when the round changes
  useEffect(() => {
    setPlacements({});
    setSelectedWord(null);
    setCheckResult(null);
  }, [roundIdx]);

  const clearCheck = () => setCheckResult(null);

  const placeWord = useCallback((passId: string, slotIndex: number, wordCount: number, word: string) => {
    setPlacements((prev) => {
      const arr = prev[passId] ? [...prev[passId]] : Array(wordCount).fill(null);
      arr[slotIndex] = word;
      return { ...prev, [passId]: arr };
    });
    clearCheck();
  }, []);

  const removeWord = useCallback((passId: string, slotIndex: number) => {
    setPlacements((prev) => {
      if (!prev[passId]) return prev;
      const arr = [...prev[passId]];
      arr[slotIndex] = null;
      return { ...prev, [passId]: arr };
    });
    clearCheck();
  }, []);

  const handleWordSelect = (word: string) => {
    setSelectedWord((prev) => (prev === word ? null : word));
  };

  // Live score preview (not yet committed to cumulative totals)
  const live = computeRoundScore(round, placements);
  const previewCorrect = cumulative.correctWords + live.correctWords;
  const previewTotal = cumulative.totalWords + live.totalWords;

  const handleCheck = () => {
    setCheckResult(evaluateWords(round, placements));
  };

  const handleReset = () => {
    setPlacements({});
    setSelectedWord(null);
    setCheckResult(null);
  };

  const handleAdvance = () => {
    const roundScore = computeRoundScore(round, placements);
    const newCumulative = {
      correctWords: cumulative.correctWords + roundScore.correctWords,
      totalWords: cumulative.totalWords + roundScore.totalWords,
    };
    setCumulative(newCumulative);

    if (roundIdx === rounds.length - 1) {
      const pct = newCumulative.totalWords > 0
        ? (newCumulative.correctWords / newCumulative.totalWords) * 100
        : 0;
      const score = Math.round((pct / 100) * maxScore);
      const timeTakenSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
      onComplete({ score: Math.max(0, Math.min(maxScore, score)), timeTakenSeconds });
    } else {
      setRoundIdx((r) => r + 1);
    }
  };

  const isLastRound = roundIdx === rounds.length - 1;

  return (
    <div
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-6 text-foreground"
      data-assignment-id={assignmentId}
    >
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base sm:text-lg font-semibold">Bubble Sort Builder</h2>
          <Badge variant="secondary">Round {roundIdx + 1} of {rounds.length}</Badge>
        </div>
        <Progress value={(roundIdx / rounds.length) * 100} className="h-2" />
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          Sort the fruit at the top using bubble sort. Each pass compares adjacent elements and
          swaps them if they are out of order, bubbling the largest unsorted element to its final
          position at the end. <b>Drag</b> a fruit into each slot to show the correct array state
          after every pass, or click a fruit to select it and then click a slot to place it. Click
          the trash icon on a fruit to remove it and try again.
        </p>
      </div>

      {/* Diagram */}
      <div className="overflow-x-auto rounded-xl border border-border/60 bg-background/40 p-4 sm:p-6">
        <div className="flex flex-col items-center gap-6">
          {round.passes.map((pass, pIdx) => (
            <div key={pass.id} className="flex flex-col items-center gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {pIdx === 0
                  ? "Starting array (unsorted)"
                  : pIdx === round.passes.length - 1
                  ? `Pass ${pIdx} — sorted result`
                  : `After pass ${pIdx}`}
              </span>
              <div className="flex items-center gap-1">
                {pass.isInitial
                  ? pass.words.map((w, i) => (
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
                  : pass.words.map((_, i) => (
                      <Slot
                        key={i}
                        value={placements[pass.id]?.[i] ?? null}
                        status={checkResult?.[pass.id]?.[i]}
                        selected={selectedWord === placements[pass.id]?.[i]}
                        onDrop={(w) => placeWord(pass.id, i, pass.words.length, w)}
                        onRemove={() => removeWord(pass.id, i)}
                        onClick={() => {
                          const currentWord = placements[pass.id]?.[i] ?? null;
                          if (currentWord) {
                            handleWordSelect(currentWord);
                          } else if (selectedWord) {
                            placeWord(pass.id, i, pass.words.length, selectedWord);
                            setSelectedWord(null);
                          }
                        }}
                      />
                    ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feedback + controls */}
      <div className="flex flex-col gap-3">
        {checkResult && (
          <p className="text-xs sm:text-sm">
            This round — words correct: <b>{live.correctWords}/{live.totalWords}</b>
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
