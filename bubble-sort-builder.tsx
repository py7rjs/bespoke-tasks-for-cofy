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
  /** Indices locked in place (shown purple); carried forward to the next row. */
  fixedIndices: number[];
  /** The two indices that were swapped to produce this row (shown yellow). */
  swappedIndices: [number, number] | null;
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
    swappedIndices: null,
    isSorted: false,
  };
}

/** Number of inversions = minimum swaps needed to sort (bubble sort optimal). */
function countInversions(words: string[]): number {
  let count = 0;
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      if (words[i] > words[j]) count++;
    }
  }
  return count;
}

/** Expected operations for a round: inversions (swaps) + array length (fixes). */
function computeExpectedOps(initial: string[]): number {
  return countInversions(initial) + initial.length;
}

/**
 * Evaluate all rows and count correct vs total operations.
 * A swap is correct when the cell at the lower index ends up ≤ the cell at the higher index.
 * A fix is correct when the element occupies its correct position in the sorted array.
 * Only newly-added fixed indices (not inherited from the previous row) are counted.
 */
function computeCheckStats(rows: RowState[]): { correctOps: number; totalOps: number } {
  let correctOps = 0;
  let totalOps = 0;

  rows.forEach((row, rowIndex) => {
    if (row.swappedIndices) {
      const [i, j] = row.swappedIndices;
      const lo = Math.min(i, j);
      const hi = Math.max(i, j);
      if (row.words[lo] <= row.words[hi]) correctOps++;
      totalOps++;
    }

    const prevFixed = rowIndex > 0 ? rows[rowIndex - 1].fixedIndices : [];
    const newlyFixed = row.fixedIndices.filter((p) => !prevFixed.includes(p));
    if (newlyFixed.length > 0) {
      const sortedWords = [...row.words].sort((a, b) => a.localeCompare(b));
      newlyFixed.forEach((p) => {
        if (sortedWords[p] === row.words[p]) correctOps++;
        totalOps++;
      });
    }
  });

  return { correctOps, totalOps };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main task component
// ═══════════════════════════════════════════════════════════════════════════

export default function BubbleSortBuilder({ assignmentId, maxScore, onComplete }: BespokeTaskProps) {
  const [rounds] = useState<RoundData[]>(() =>
    Array.from({ length: ROUND_COUNT }, (_, i) => buildRound(i))
  );
  const [roundIdx, setRoundIdx] = useState(0);

  const [rows, setRows] = useState<RowState[]>(() => [makeInitialRow(rounds[0])]);
  // Monotonically increasing counter used to generate unique row IDs within a round.
  const [rowCounter, setRowCounter] = useState(1);
  // Up to two selected cell indices in the active (last) row.
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [checkPerformed, setCheckPerformed] = useState(false);
  const [cumulative, setCumulative] = useState({ correctOps: 0, expectedOps: 0 });

  const startTimeRef = useRef<number>(Date.now());

  // Reset per-round state when the round changes.
  useEffect(() => {
    setRows([makeInitialRow(rounds[roundIdx])]);
    setSelectedIndices([]);
    setCheckPerformed(false);
    setRowCounter(1);
  }, [roundIdx, rounds]);

  const activeRow = rows[rows.length - 1];
  const isLastRound = roundIdx === rounds.length - 1;

  // ── Cell selection ──────────────────────────────────────────────────────

  const handleCellClick = (idx: number) => {
    if (activeRow.isSorted) return;
    setSelectedIndices((prev) => {
      if (prev.includes(idx)) return prev.filter((i) => i !== idx);
      // Cap at 2; replace the older selection when a third is clicked.
      if (prev.length >= 2) return [prev[1], idx];
      return [...prev, idx];
    });
  };

  // ── Action buttons ──────────────────────────────────────────────────────

  const handleSwap = () => {
    if (selectedIndices.length !== 2) return;
    const [i1, i2] = selectedIndices as [number, number];
    const newWords = [...activeRow.words];
    [newWords[i1], newWords[i2]] = [newWords[i2], newWords[i1]];

    // Mark the swapped cells yellow on the current row, then add a clean new row.
    const updatedCurrent: RowState = { ...activeRow, words: newWords, swappedIndices: [i1, i2] };
    const newRow: RowState = {
      id: `r${roundIdx}-${rowCounter}`,
      words: newWords,
      fixedIndices: [...activeRow.fixedIndices],
      swappedIndices: null,
      isSorted: false,
    };

    setRows((prev) => [...prev.slice(0, -1), updatedCurrent, newRow]);
    setRowCounter((c) => c + 1);
    setSelectedIndices([]);
  };

  const handleFix = () => {
    if (selectedIndices.length === 0) return;
    const newFixed = [...new Set([...activeRow.fixedIndices, ...selectedIndices])];

    // Turn the selected cells purple on the current row, then carry them to a new row.
    const updatedCurrent: RowState = { ...activeRow, fixedIndices: newFixed };
    const newRow: RowState = {
      id: `r${roundIdx}-${rowCounter}`,
      words: [...activeRow.words],
      fixedIndices: newFixed,
      swappedIndices: null,
      isSorted: false,
    };

    setRows((prev) => [...prev.slice(0, -1), updatedCurrent, newRow]);
    setRowCounter((c) => c + 1);
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

  // ── Bottom bar ──────────────────────────────────────────────────────────

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
    const { correctOps } = computeCheckStats(rows);
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
      setRoundIdx((r) => r + 1);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  const currentRoundExpected = computeExpectedOps(rounds[roundIdx].initial);

  // Live running score including the current round's operations so far.
  const liveStats = computeCheckStats(rows);
  const liveCorrect = cumulative.correctOps + liveStats.correctOps;
  const liveExpected = cumulative.expectedOps + currentRoundExpected;

  const checkStats = checkPerformed ? liveStats : null;

  return (
    <div
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-6 text-foreground"
      data-assignment-id={assignmentId}
    >
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base sm:text-lg font-semibold">Bubble Sort Builder</h2>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">Max: {currentRoundExpected}</Badge>
            <Badge variant="secondary">Round {roundIdx + 1} of {rounds.length}</Badge>
          </div>
        </div>
        <Progress value={(roundIdx / rounds.length) * 100} className="h-2" />
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          Sort the fruits alphabetically using bubble sort. Click words to select them (up to two
          at a time), then use the buttons below the row: <b>Swap</b> exchanges two selected words,{" "}
          <b>Fix</b> locks a word in place (purple), <b>Delete Row</b> undoes the last step, and{" "}
          <b>Sorted</b> marks the array as complete.
        </p>
      </div>

      {/* Rows */}
      <div className="overflow-x-auto rounded-xl border border-border/60 bg-background/40 p-4 sm:p-6">
        <div className="flex flex-col items-center gap-5">
          {rows.map((row, rowIndex) => {
            const isActive = rowIndex === rows.length - 1;

            return (
              <div key={row.id} className="flex flex-col items-center gap-2">
                {/* Row label */}
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {rowIndex === 0
                    ? "Starting array (unsorted)"
                    : row.isSorted
                    ? "Sorted ✓"
                    : `Step ${rowIndex}`}
                </span>

                {/* Word cells */}
                <div className="flex items-center gap-1 py-2">
                  {row.words.map((word, cellIdx) => {
                    const isFixed = row.fixedIndices.includes(cellIdx);
                    const isSwapped = row.swappedIndices?.includes(cellIdx) ?? false;
                    const isSelected =
                      isActive && !row.isSorted && selectedIndices.includes(cellIdx);

                    // Determine if this cell should show a tick/cross badge.
                    const prevRow = rowIndex > 0 ? rows[rowIndex - 1] : null;
                    const newlyFixed = prevRow
                      ? row.fixedIndices.filter((p) => !prevRow.fixedIndices.includes(p))
                      : row.fixedIndices;
                    const isNewlyFixed = newlyFixed.includes(cellIdx);

                    let cellCorrect: boolean | null = null;
                    if (checkPerformed) {
                      if (isSwapped && row.swappedIndices) {
                        const [si, sj] = row.swappedIndices;
                        cellCorrect = row.words[Math.min(si, sj)] <= row.words[Math.max(si, sj)];
                      } else if (isNewlyFixed) {
                        const sortedWords = [...row.words].sort((a, b) => a.localeCompare(b));
                        cellCorrect = sortedWords[cellIdx] === row.words[cellIdx];
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
                          // Colour priority: fixed (purple) > swapped (yellow) > default
                          isFixed
                            ? "border-purple-300 bg-purple-100 text-purple-800 dark:border-purple-700 dark:bg-purple-950/60 dark:text-purple-200"
                            : isSwapped
                            ? "border-yellow-300 bg-yellow-100 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-200"
                            : "border-border bg-background text-foreground",
                          isSelected && "ring-2 ring-primary ring-offset-1",
                        )}
                      >
                        {word}
                        {cellCorrect !== null && (
                          <span
                            className={cn(
                              "absolute -top-1.5 -right-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full text-white",
                              cellCorrect ? "bg-green-500" : "bg-red-500",
                            )}
                          >
                            {cellCorrect
                              ? <Check className="h-2.5 w-2.5" />
                              : <X className="h-2.5 w-2.5" />}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Action buttons — only on the active, not-yet-sorted row */}
                {isActive && !row.isSorted && (
                  <div className="flex flex-wrap justify-center gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSwap}
                      disabled={selectedIndices.length !== 2}
                    >
                      <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" />
                      Swap
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

      {/* Bottom controls */}
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
              ? "No swaps or fixes to check yet."
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
