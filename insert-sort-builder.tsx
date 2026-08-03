import { useEffect, useRef, useState } from "react";
import type { BespokeTaskProps } from "../bespoke-task-runner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { CheckCircle2, RefreshCw, Send, ArrowLeftRight, Lock, Trash2, Check, X } from "lucide-react";

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

// ═══════════════════════════════════════════════════════════════════════════
// Data types and helpers
// ═══════════════════════════════════════════════════════════════════════════

interface RowState {
  id: string;
  words: string[];
  /** Indices that currently belong to the sorted prefix (shown purple). */
  fixedIndices: number[];
  /** Indices affected by the most recent insertion move (shown yellow). */
  movedIndices: number[] | null;
  /** True once the student marks this row as fully sorted. */
  isSorted: boolean;
}

interface RoundData {
  index: number;
  initial: string[];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildRound(index: number): RoundData {
  const n = 5 + Math.floor(Math.random() * 2); // 5 or 6 elements
  return { index, initial: shuffle(FRUITS).slice(0, n) };
}

function makeInitialRow(round: RoundData): RowState {
  return {
    id: `r${round.index}-0`,
    words: [...round.initial],
    fixedIndices: [],
    movedIndices: null,
    isSorted: false,
  };
}

function insertionSortPasses(words: string[]): string[][] {
  const allPasses: string[][] = [[...words]];
  const current = [...words];

  for (let i = 1; i < current.length; i++) {
    const key = current[i];
    let j = i - 1;

    while (j >= 0 && current[j] > key) {
      current[j + 1] = current[j];
      j--;
    }

    current[j + 1] = key;
    allPasses.push([...current]);
  }

  return allPasses;
}

function moveWord(words: string[], sourceIdx: number, targetIdx: number): string[] {
  if (sourceIdx === targetIdx) return [...words];

  const next = [...words];
  const [movedWord] = next.splice(sourceIdx, 1);
  next.splice(targetIdx, 0, movedWord);
  return next;
}

function getMovedIndices(sourceIdx: number, targetIdx: number): number[] {
  const start = Math.min(sourceIdx, targetIdx);
  const end = Math.max(sourceIdx, targetIdx);
  return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
}

/** Expected operations for a round: insertion passes + sorted-prefix fixes after each pass. */
function computeExpectedOps(initial: string[]): number {
  const insertionPassCount = Math.max(0, initial.length - 1);
  return insertionPassCount * 2;
}

function computeCheckStats(rows: RowState[], initial: string[]): { correctOps: number; totalOps: number } {
  const expectedPasses = insertionSortPasses(initial);
  let correctOps = 0;
  let totalOps = 0;
  let completedPasses = 0;

  rows.forEach((row, rowIndex) => {
    if (row.movedIndices) {
      const nextPass = Math.min(completedPasses + 1, expectedPasses.length - 1);
      const expectedWords = expectedPasses[nextPass];
      const matchesPass = expectedWords.every((word, idx) => row.words[idx] === word);

      if (matchesPass) correctOps++;
      totalOps++;
      completedPasses = nextPass;
    }

    const prevFixed = rowIndex > 0 ? rows[rowIndex - 1].fixedIndices : [];
    const newlyFixed = row.fixedIndices.filter((idx) => !prevFixed.includes(idx));

    newlyFixed.forEach((idx) => {
      if (idx <= completedPasses) correctOps++;
      totalOps++;
    });
  });

  return { correctOps, totalOps };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main task component
// ═══════════════════════════════════════════════════════════════════════════

export default function InsertSortBuilder({ assignmentId, maxScore, onComplete }: BespokeTaskProps) {
  const [rounds] = useState<RoundData[]>(() =>
    Array.from({ length: ROUND_COUNT }, (_, i) => buildRound(i))
  );
  const [roundIdx, setRoundIdx] = useState(0);

  const [rows, setRows] = useState<RowState[]>(() => [makeInitialRow(rounds[0])]);
  const [rowCounter, setRowCounter] = useState(1);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [checkPerformed, setCheckPerformed] = useState(false);
  const [cumulative, setCumulative] = useState({ correctOps: 0, expectedOps: 0 });

  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    setRows([makeInitialRow(rounds[roundIdx])]);
    setSelectedIndices([]);
    setCheckPerformed(false);
    setRowCounter(1);
  }, [roundIdx, rounds]);

  const activeRow = rows[rows.length - 1];
  const isLastRound = roundIdx === rounds.length - 1;
  const expectedPasses = insertionSortPasses(rounds[roundIdx].initial);

  const handleCellClick = (idx: number) => {
    if (activeRow.isSorted) return;
    setSelectedIndices((prev) => {
      if (prev.includes(idx)) return prev.filter((value) => value !== idx);
      if (prev.length >= 2) return [prev[1], idx];
      return [...prev, idx];
    });
  };

  const handleInsert = () => {
    if (selectedIndices.length !== 2) return;

    const [sourceIdx, targetIdx] = selectedIndices as [number, number];
    const newWords = moveWord(activeRow.words, sourceIdx, targetIdx);
    const movedIndices = getMovedIndices(sourceIdx, targetIdx);

    const updatedCurrent: RowState = {
      ...activeRow,
      words: newWords,
      movedIndices,
    };
    const newRow: RowState = {
      id: `r${roundIdx}-${rowCounter}`,
      words: newWords,
      fixedIndices: [...activeRow.fixedIndices],
      movedIndices: null,
      isSorted: false,
    };

    setRows((prev) => [...prev.slice(0, -1), updatedCurrent, newRow]);
    setRowCounter((count) => count + 1);
    setSelectedIndices([]);
  };

  const handleFix = () => {
    if (selectedIndices.length === 0) return;

    const newFixed = [...new Set([...activeRow.fixedIndices, ...selectedIndices])].sort((a, b) => a - b);
    const updatedCurrent: RowState = { ...activeRow, fixedIndices: newFixed };
    const newRow: RowState = {
      id: `r${roundIdx}-${rowCounter}`,
      words: [...activeRow.words],
      fixedIndices: newFixed,
      movedIndices: null,
      isSorted: false,
    };

    setRows((prev) => [...prev.slice(0, -1), updatedCurrent, newRow]);
    setRowCounter((count) => count + 1);
    setSelectedIndices([]);
  };

  const handleDeleteRow = () => {
    if (rows.length <= 1) return;
    setRows((prev) => prev.slice(0, -1));
    setSelectedIndices([]);
  };

  const handleSorted = () => {
    setRows((prev) => {
      const updated = [...prev];
      updated[updated.length - 1] = { ...updated[updated.length - 1], isSorted: true };
      return updated;
    });
    setSelectedIndices([]);
  };

  const handleCheck = () => {
    setCheckPerformed(true);
  };

  const handleReset = () => {
    setRows([makeInitialRow(rounds[roundIdx])]);
    setSelectedIndices([]);
    setCheckPerformed(false);
    setRowCounter(1);
  };

  const handleSubmit = () => {
    const { correctOps } = computeCheckStats(rows, rounds[roundIdx].initial);
    const roundExpected = computeExpectedOps(rounds[roundIdx].initial);
    const newCumulative = {
      correctOps: cumulative.correctOps + correctOps,
      expectedOps: cumulative.expectedOps + roundExpected,
    };
    setCumulative(newCumulative);

    if (isLastRound) {
      const score = newCumulative.expectedOps > 0
        ? Math.round((newCumulative.correctOps / newCumulative.expectedOps) * maxScore)
        : 0;
      const timeTakenSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
      onComplete({ score: Math.max(0, Math.min(maxScore, score)), timeTakenSeconds });
    } else {
      setRoundIdx((idx) => idx + 1);
    }
  };

  const currentRoundExpected = computeExpectedOps(rounds[roundIdx].initial);
  const liveStats = computeCheckStats(rows, rounds[roundIdx].initial);
  const liveCorrect = cumulative.correctOps + liveStats.correctOps;
  const liveExpected = cumulative.expectedOps + currentRoundExpected;
  const checkStats = checkPerformed ? liveStats : null;

  return (
    <div
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-6 text-foreground"
      data-assignment-id={assignmentId}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base sm:text-lg font-semibold">Insertion Sort Builder</h2>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">Max: {currentRoundExpected}</Badge>
            <Badge variant="secondary">Round {roundIdx + 1} of {rounds.length}</Badge>
          </div>
        </div>
        <Progress value={(roundIdx / rounds.length) * 100} className="h-2" />
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          Sort the fruits alphabetically using insertion sort. Click the word you want to move,
          then click its target position so you can <b>Insert</b> it into the sorted prefix.
          Use <b>Fix</b> to mark the sorted prefix (purple), <b>Delete Row</b> to undo the last
          step, and <b>Sorted</b> when the array is complete.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/60 bg-background/40 p-4 sm:p-6">
        <div className="flex flex-col items-center gap-5">
          {rows.map((row, rowIndex) => {
            const isActive = rowIndex === rows.length - 1;
            const passNumber = rows
              .slice(0, rowIndex + 1)
              .filter((candidate) => candidate.movedIndices !== null).length;

            return (
              <div key={row.id} className="flex flex-col items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {rowIndex === 0
                    ? "Starting array (unsorted)"
                    : row.isSorted
                    ? "Sorted ✓"
                    : `Step ${rowIndex}`}
                </span>

                <div className="flex items-center gap-1 py-2">
                  {row.words.map((word, cellIdx) => {
                    const isFixed = row.fixedIndices.includes(cellIdx);
                    const isMoved = row.movedIndices?.includes(cellIdx) ?? false;
                    const isSelected =
                      isActive && !row.isSorted && selectedIndices.includes(cellIdx);

                    const prevRow = rowIndex > 0 ? rows[rowIndex - 1] : null;
                    const newlyFixed = prevRow
                      ? row.fixedIndices.filter((idx) => !prevRow.fixedIndices.includes(idx))
                      : row.fixedIndices;
                    const isNewlyFixed = newlyFixed.includes(cellIdx);

                    let cellCorrect: boolean | null = null;
                    if (checkPerformed) {
                      if (isMoved) {
                        const expectedWords = expectedPasses[Math.min(passNumber, expectedPasses.length - 1)];
                        cellCorrect = expectedWords?.[cellIdx] === row.words[cellIdx];
                      } else if (isNewlyFixed) {
                        cellCorrect = cellIdx <= passNumber;
                      }
                    }

                    return (
                      <div
                        key={cellIdx}
                        onClick={() => isActive && handleCellClick(cellIdx)}
                        className={cn(
                          "relative flex h-9 w-[76px] shrink-0 select-none items-center justify-center rounded-md border text-[11px] sm:text-xs font-medium transition-all",
                          isActive && !row.isSorted
                            ? "cursor-pointer hover:opacity-75"
                            : "cursor-default",
                          isFixed
                            ? "border-purple-300 bg-purple-100 text-purple-800 dark:border-purple-700 dark:bg-purple-950/60 dark:text-purple-200"
                            : isMoved
                            ? "border-yellow-300 bg-yellow-100 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-200"
                            : "border-border bg-background text-foreground",
                          isSelected && "ring-2 ring-primary ring-offset-1",
                        )}
                      >
                        <span className="block w-full truncate px-2 text-center">{word}</span>
                        {cellCorrect !== null && (
                          <span
                            className={cn(
                              "absolute right-0 top-0 z-10 flex h-4 w-4 items-center justify-center",
                              cellCorrect
                                ? "text-green-600 dark:text-green-400"
                                : "text-red-600 dark:text-red-400",
                            )}
                          >
                            {cellCorrect
                              ? <Check className="h-3.5 w-3.5" strokeWidth={3} />
                              : <X className="h-3.5 w-3.5" strokeWidth={3} />}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {isActive && !row.isSorted && (
                  <div className="flex flex-wrap justify-center gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleInsert}
                      disabled={selectedIndices.length !== 2}
                    >
                      <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" />
                      Insert
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleFix}
                      disabled={selectedIndices.length === 0}
                    >
                      <Lock className="mr-1.5 h-3.5 w-3.5" />
                      Fix
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDeleteRow}
                      disabled={rows.length <= 1}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Delete Row
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSorted}
                    >
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                      Sorted
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {checkStats !== null && (
          <p
            className={cn(
              "text-xs sm:text-sm font-medium",
              checkStats.correctOps === checkStats.totalOps && checkStats.totalOps > 0
                ? "text-green-600 dark:text-green-400"
                : checkStats.totalOps === 0
                ? "text-muted-foreground"
                : "text-yellow-600 dark:text-yellow-400",
            )}
          >
            {checkStats.totalOps === 0
              ? "No inserts or fixes to check yet."
              : `${checkStats.correctOps}/${checkStats.totalOps} operations correct`}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            Score: {liveCorrect}/{liveExpected} ops
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleReset}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Reset
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={handleCheck}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Check
            </Button>
            <Button type="button" size="sm" onClick={handleSubmit}>
              <Send className="mr-1.5 h-4 w-4" />
              {isLastRound ? "Submit" : "Next round"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
