import { useEffect, useRef, useState } from "react";
import type { BespokeTaskProps } from "../bespoke-task-runner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { CheckCircle2, RefreshCw, Send, Trash2, Check, X, ChevronLeft, ChevronRight } from "lucide-react";

// Sorted animal list for binary search
const ANIMALS_SORTED: string[] = [
  "Ant", "Bat", "Bear", "Bison", "Camel", "Cat", "Cobra", "Crow",
  "Deer", "Dingo", "Dove", "Eagle", "Eel", "Finch", "Fox", "Frog",
  "Gecko", "Goat", "Goose", "Heron", "Hippo", "Horse", "Hyena", "Ibex",
  "Koala", "Lemur", "Lynx", "Mole", "Moose", "Otter", "Panda", "Quail",
  "Raven", "Seal", "Shark", "Sheep", "Sloth", "Snake", "Swan", "Tiger",
  "Toad", "Trout", "Whale", "Wolf", "Wren", "Yak", "Zebra",
];

const ROUND_COUNT = 5;
// Each round picks a random size from 7, 8, or 9
const WORD_COUNT_OPTIONS = [7, 8, 9];

type CompareResult = "match" | "less-than" | "greater-than";
// less-than means target < mid (discard mid and right → search left)
// greater-than means target > mid (discard mid and left → search right)
type Decision = "found" | "not-found" | "discard-mid-left" | "discard-mid-right";

interface RowState {
  id: string;
  words: string[];         // full word list (unchanged across rows)
  lo: number;              // current search window low index (inclusive)
  hi: number;              // current search window high index (inclusive)
  midIndex: number | null; // student-selected midpoint
  compareResult: CompareResult | null;
  decision: Decision | null;
}

interface RoundData {
  index: number;
  target: string;
  words: string[];         // sorted slice
  isPresent: boolean;
}

interface ExpectedStep {
  lo: number;
  hi: number;
  midIndex: number;        // floor((lo+hi)/2)
  compareResult: CompareResult;
  decision: Decision;
  nextLo: number | null;
  nextHi: number | null;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildRound(index: number, isPresent: boolean): RoundData {
  const wordCount = pickRandom(WORD_COUNT_OPTIONS);
  // Pick a random contiguous sorted slice from the full sorted list
  const maxStart = ANIMALS_SORTED.length - wordCount;
  const start = Math.floor(Math.random() * (maxStart + 1));
  const words = ANIMALS_SORTED.slice(start, start + wordCount);

  let target: string;
  if (isPresent) {
    target = pickRandom(words);
  } else {
    // Pick a word that is NOT in the slice but exists in the full list
    const absent = ANIMALS_SORTED.filter((a) => !words.includes(a));
    target = pickRandom(absent);
  }

  return { index, target, words, isPresent };
}

function buildRounds(): RoundData[] {
  const presencePattern: boolean[] = [];
  // 3 present, 2 absent — shuffled
  const base = [true, true, true, false, false];
  const shuffled = [...base];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (const v of shuffled) presencePattern.push(v);
  return presencePattern.map((isPresent, i) => buildRound(i, isPresent));
}

function makeInitialRow(round: RoundData): RowState {
  return {
    id: `r${round.index}-0`,
    words: [...round.words],
    lo: 0,
    hi: round.words.length - 1,
    midIndex: null,
    compareResult: null,
    decision: null,
  };
}

/** Compute the canonical expected binary search steps for a round. */
function binarySearchSteps(round: RoundData): ExpectedStep[] {
  const steps: ExpectedStep[] = [];
  let lo = 0;
  let hi = round.words.length - 1;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const midWord = round.words[mid];
    const cmp = round.target.localeCompare(midWord);

    if (cmp === 0) {
      steps.push({
        lo, hi, midIndex: mid,
        compareResult: "match",
        decision: "found",
        nextLo: null, nextHi: null,
      });
      return steps;
    } else if (cmp < 0) {
      // target < mid → discard mid and right, search left half
      steps.push({
        lo, hi, midIndex: mid,
        compareResult: "less-than",
        decision: "discard-mid-right",
        nextLo: lo, nextHi: mid - 1,
      });
      hi = mid - 1;
    } else {
      // target > mid → discard mid and left, search right half
      steps.push({
        lo, hi, midIndex: mid,
        compareResult: "greater-than",
        decision: "discard-mid-left",
        nextLo: mid + 1, nextHi: hi,
      });
      lo = mid + 1;
    }
  }

  // lo > hi → not found
  steps.push({
    lo, hi, midIndex: -1,
    compareResult: "less-than", // dummy — window is empty
    decision: "not-found",
    nextLo: null, nextHi: null,
  });

  return steps;
}

function isFinalizedRow(row: RowState): boolean {
  return row.midIndex !== null && row.compareResult !== null && row.decision !== null;
}

function rowMatchesStep(row: RowState, step: ExpectedStep): boolean {
  return (
    row.lo === step.lo &&
    row.hi === step.hi &&
    row.midIndex === step.midIndex &&
    row.compareResult === step.compareResult &&
    row.decision === step.decision
  );
}

// 1 mark: correct mid word, 1 mark: correct compare result, 1 mark: correct decision
function computeCheckStats(rows: RowState[], round: RoundData): { correctOps: number; totalOps: number } {
  const expectedSteps = binarySearchSteps(round);
  const finalizedRows = rows.filter(isFinalizedRow);
  let correctOps = 0;

  finalizedRows.forEach((row, stepIndex) => {
    const expected = expectedSteps[stepIndex];
    if (!expected) return;
    if (row.midIndex === expected.midIndex) correctOps++;
    if (row.compareResult === expected.compareResult) correctOps++;
    if (row.decision === expected.decision) correctOps++;
  });

  return { correctOps, totalOps: finalizedRows.length * 3 };
}

function computeExpectedOps(round: RoundData): number {
  return binarySearchSteps(round).length;
}

export default function BinarySearchBuilder({ assignmentId, maxScore, onComplete }: BespokeTaskProps) {
  const [rounds] = useState<RoundData[]>(() => buildRounds());
  const [roundIdx, setRoundIdx] = useState(0);
  const [rows, setRows] = useState<RowState[]>(() => [makeInitialRow(rounds[0])]);
  const [rowCounter, setRowCounter] = useState(1);
  const [checkPerformed, setCheckPerformed] = useState(false);
  const [cumulative, setCumulative] = useState({ correctOps: 0, expectedOps: 0 });

  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    setRows([makeInitialRow(rounds[roundIdx])]);
    setRowCounter(1);
    setCheckPerformed(false);
  }, [roundIdx, rounds]);

  const round = rounds[roundIdx];
  const activeRow = rows[rows.length - 1];
  const isLastRound = roundIdx === rounds.length - 1;
  const expectedSteps = binarySearchSteps(round);

  const updateActiveRow = (updater: (row: RowState) => RowState) => {
    setRows((prev) => {
      const updated = [...prev];
      updated[updated.length - 1] = updater(updated[updated.length - 1]);
      return updated;
    });
  };

  // Student clicks a cell within the current [lo, hi] window to select midpoint
  const handleCellClick = (idx: number) => {
    if (activeRow.decision !== null) return;
    if (idx < activeRow.lo || idx > activeRow.hi) return;
    setCheckPerformed(false);
    updateActiveRow((row) => ({
      ...row,
      midIndex: row.midIndex === idx ? null : idx,
      compareResult: null,
      decision: null,
    }));
  };

  const handleMatch = () => {
    if (activeRow.midIndex === null) return;
    setCheckPerformed(false);
    updateActiveRow((row) => ({ ...row, compareResult: "match", decision: null }));
  };

  const handleLessThan = () => {
    if (activeRow.midIndex === null) return;
    setCheckPerformed(false);
    updateActiveRow((row) => ({ ...row, compareResult: "less-than", decision: null }));
  };

  const handleGreaterThan = () => {
    if (activeRow.midIndex === null) return;
    setCheckPerformed(false);
    updateActiveRow((row) => ({ ...row, compareResult: "greater-than", decision: null }));
  };

  const handleReturnFound = () => {
    if (activeRow.compareResult !== "match") return;
    setCheckPerformed(false);
    updateActiveRow((row) => ({ ...row, decision: "found" }));
  };

  const handleReturnNotFound = () => {
    if (activeRow.compareResult === null) return;
    setCheckPerformed(false);
    updateActiveRow((row) => ({ ...row, decision: "not-found" }));
  };

  // Discard mid and left (target > mid) → next window is [mid+1, hi]
  const handleDiscardMidLeft = () => {
    if (activeRow.compareResult !== "greater-than" || activeRow.midIndex === null) return;
    const nextLo = activeRow.midIndex + 1;
    if (nextLo > activeRow.hi) return;

    const currentRow: RowState = { ...activeRow, decision: "discard-mid-left" };
    const newRow: RowState = {
      id: `r${roundIdx}-${rowCounter}`,
      words: [...activeRow.words],
      lo: nextLo,
      hi: activeRow.hi,
      midIndex: null,
      compareResult: null,
      decision: null,
    };

    setRows((prev) => [...prev.slice(0, -1), currentRow, newRow]);
    setRowCounter((c) => c + 1);
    setCheckPerformed(false);
  };

  // Discard mid and right (target < mid) → next window is [lo, mid-1]
  const handleDiscardMidRight = () => {
    if (activeRow.compareResult !== "less-than" || activeRow.midIndex === null) return;
    const nextHi = activeRow.midIndex - 1;
    if (nextHi < activeRow.lo) return;

    const currentRow: RowState = { ...activeRow, decision: "discard-mid-right" };
    const newRow: RowState = {
      id: `r${roundIdx}-${rowCounter}`,
      words: [...activeRow.words],
      lo: activeRow.lo,
      hi: nextHi,
      midIndex: null,
      compareResult: null,
      decision: null,
    };

    setRows((prev) => [...prev.slice(0, -1), currentRow, newRow]);
    setRowCounter((c) => c + 1);
    setCheckPerformed(false);
  };

  const handleDeleteRow = () => {
    setRows((prev) => {
      if (prev.length === 1) return [makeInitialRow(round)];
      const trimmed = prev.slice(0, -1);
      const last = trimmed[trimmed.length - 1];
      if (last.decision === "discard-mid-left" || last.decision === "discard-mid-right") {
        trimmed[trimmed.length - 1] = { ...last, decision: null };
      }
      return trimmed;
    });
    setCheckPerformed(false);
  };

  const handleCheck = () => setCheckPerformed(true);

  const handleReset = () => {
    setRows([makeInitialRow(round)]);
    setRowCounter(1);
    setCheckPerformed(false);
  };

  const handleSubmit = () => {
    const { correctOps } = computeCheckStats(rows, round);
    const roundExpected = computeExpectedOps(round) * 3;
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

  const currentRoundExpected = computeExpectedOps(round) * 3;
  const liveStats = computeCheckStats(rows, round);
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
          <h2 className="text-base sm:text-lg font-semibold">Binary Search Builder</h2>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">Max: {currentRoundExpected} marks</Badge>
            <Badge variant="secondary">Round {roundIdx + 1} of {rounds.length}</Badge>
          </div>
        </div>
        <Progress value={(roundIdx / rounds.length) * 100} className="h-2" />
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          The list is sorted. Click a word in the active window (highlighted) to select the{" "}
          <b>midpoint</b>, then mark it <b>Match</b>, <b>Target &lt; Mid</b>, or <b>Target &gt; Mid</b>.
          Then choose your decision:{" "}
          <b>Return Found</b>, <b>Return Not Found</b>,{" "}
          <b>Discard Mid &amp; Left</b> (target &gt; mid), or{" "}
          <b>Discard Mid &amp; Right</b> (target &lt; mid).
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Target word:</span>
          <Badge variant="secondary" className="text-sm font-bold">{round.target}</Badge>
        </div>
      </div>

      {/* Steps */}
      <div className="overflow-x-auto rounded-xl border border-border/60 bg-background/40 p-4 sm:p-6">
        <div className="flex flex-col items-center gap-6">
          {rows.map((row, rowIndex) => {
            const isActive = rowIndex === rows.length - 1;
            const finalizedRows = rows.slice(0, rowIndex + 1).filter(isFinalizedRow);
            const expectedStep = isFinalizedRow(row)
              ? expectedSteps[finalizedRows.length - 1] ?? null
              : null;
            const rowCorrect = checkPerformed && isFinalizedRow(row)
              ? !!expectedStep && rowMatchesStep(row, expectedStep)
              : null;

            return (
              <div key={row.id} className="flex flex-col items-center gap-2 w-full">
                {/* Step label */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Step {rowIndex + 1}
                  </span>
                  {!isActive && (
                    <span className="text-[10px] text-muted-foreground">
                      Window: [{row.lo}–{row.hi}]
                    </span>
                  )}
                  {rowCorrect !== null && (
                    <span
                      className={cn(
                        "flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide",
                        rowCorrect
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400",
                      )}
                    >
                      {rowCorrect
                        ? <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        : <X className="h-3.5 w-3.5" strokeWidth={3} />}
                      {rowCorrect ? "Correct" : "Review"}
                    </span>
                  )}
                </div>

                {/* Word cells */}
                <div className="flex items-center gap-1 py-2">
                  {row.words.map((word, cellIdx) => {
                    const inWindow = cellIdx >= row.lo && cellIdx <= row.hi;
                    const isMid = row.midIndex === cellIdx;
                    const isDiscarded = !inWindow;
                    const isClickable = isActive && inWindow && row.decision === null;

                    return (
                      <div
                        key={cellIdx}
                        onClick={() => isClickable && handleCellClick(cellIdx)}
                        className={cn(
                          "relative flex h-9 w-[72px] shrink-0 select-none items-center justify-center rounded-md border text-[11px] sm:text-xs font-medium transition-all",
                          isClickable ? "cursor-pointer hover:opacity-75" : "cursor-default",
                          // Discarded items — greyed out
                          isDiscarded
                            ? "border-border/30 bg-muted/30 text-muted-foreground/40 opacity-40"
                            // Selected mid with compare result
                            : isMid && row.compareResult === "match"
                            ? "border-green-300 bg-green-100 text-green-800 dark:border-green-700 dark:bg-green-950/60 dark:text-green-200"
                            : isMid && row.compareResult === "less-than"
                            ? "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-700 dark:bg-orange-950/60 dark:text-orange-200"
                            : isMid && row.compareResult === "greater-than"
                            ? "border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-700 dark:bg-blue-950/60 dark:text-blue-200"
                            : isMid
                            ? "border-primary bg-primary/10 text-primary ring-2 ring-primary ring-offset-1"
                            // Active window (not mid)
                            : inWindow
                            ? "border-border bg-background text-foreground"
                            : "border-border bg-background text-foreground",
                        )}
                      >
                        <span className="block w-full truncate px-1 text-center">{word}</span>
                        {isMid && (
                          <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] font-bold text-primary uppercase tracking-wide">
                            mid
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Row summary */}
                <div className="flex flex-wrap justify-center gap-2 text-[11px] text-muted-foreground">
                  <span>
                    Mid:{" "}
                    {row.midIndex === null ? "—" : row.words[row.midIndex]}
                  </span>
                  <span>•</span>
                  <span>
                    Compare:{" "}
                    {row.compareResult === null
                      ? "—"
                      : row.compareResult === "match"
                      ? "Match"
                      : row.compareResult === "less-than"
                      ? "Target < Mid"
                      : "Target > Mid"}
                  </span>
                  <span>•</span>
                  <span>
                    Decision:{" "}
                    {row.decision === null
                      ? "—"
                      : row.decision === "found"
                      ? "Return found"
                      : row.decision === "not-found"
                      ? "Return not found"
                      : row.decision === "discard-mid-left"
                      ? "Discard mid & left"
                      : "Discard mid & right"}
                  </span>
                </div>

                {/* Action buttons — only on active row */}
                {isActive && (
                  <div className="flex flex-col gap-2 pt-1 w-full max-w-xl">
                    {/* Compare buttons */}
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleMatch}
                        disabled={activeRow.midIndex === null}
                      >
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                        Match
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleLessThan}
                        disabled={activeRow.midIndex === null}
                      >
                        <ChevronLeft className="mr-1.5 h-3.5 w-3.5" />
                        Target &lt; Mid
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleGreaterThan}
                        disabled={activeRow.midIndex === null}
                      >
                        <ChevronRight className="mr-1.5 h-3.5 w-3.5" />
                        Target &gt; Mid
                      </Button>
                    </div>
                    {/* Decision buttons */}
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleReturnFound}
                        disabled={activeRow.compareResult !== "match"}
                      >
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                        Return Found
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleReturnNotFound}
                        disabled={activeRow.compareResult === null}
                      >
                        <X className="mr-1.5 h-3.5 w-3.5" />
                        Return Not Found
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleDiscardMidLeft}
                        disabled={activeRow.compareResult !== "greater-than"}
                      >
                        <ChevronRight className="mr-1.5 h-3.5 w-3.5" />
                        Discard Mid &amp; Left
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleDiscardMidRight}
                        disabled={activeRow.compareResult !== "less-than"}
                      >
                        <ChevronLeft className="mr-1.5 h-3.5 w-3.5" />
                        Discard Mid &amp; Right
                      </Button>
                    </div>
                    {/* Utility buttons */}
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleDeleteRow}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Delete Row
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
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
              ? "No completed search steps to check yet."
              : `${checkStats.correctOps}/${checkStats.totalOps} marks`}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            Score: {liveCorrect}/{liveExpected} marks
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
