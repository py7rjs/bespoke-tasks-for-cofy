import { useEffect, useRef, useState } from "react";
import type { BespokeTaskProps } from "../bespoke-task-runner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { CheckCircle2, RefreshCw, Send, Trash2, Check, X, Copy, ArrowRight, CornerUpLeft } from "lucide-react";

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
  /** Temporary value currently copied out of the array. */
  heldWord: string | null;
  /** Original index of the temporary copied value. */
  heldFrom: number | null;
  /** Action represented by this row. */
  actionType: "copy" | "shift" | "return" | null;
  /** Indices affected by the most recent action (shown yellow). */
  affectedIndices: number[] | null;
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
  const n = 7 + Math.floor(Math.random() * 3); // 7, 8, or 9 elements
  return { index, initial: shuffle(FRUITS).slice(0, n) };
}

function makeInitialRow(round: RoundData): RowState {
  return {
    id: `r${round.index}-0`,
    words: [...round.initial],
    heldWord: null,
    heldFrom: null,
    actionType: null,
    affectedIndices: null,
    isSorted: false,
  };
}

interface ExpectedActionState {
  words: string[];
  heldWord: string | null;
  heldFrom: number | null;
  actionType: "copy" | "shift" | "return";
}

function insertionSortActionStates(words: string[]): ExpectedActionState[] {
  const allStates: ExpectedActionState[] = [];
  const current = [...words];

  for (let i = 1; i < current.length; i++) {
    const key = current[i];
    allStates.push({
      words: [...current],
      heldWord: key,
      heldFrom: i,
      actionType: "copy",
    });

    let j = i - 1;

    while (j >= 0 && current[j] > key) {
      current[j + 1] = current[j];
      allStates.push({
        words: [...current],
        heldWord: key,
        heldFrom: i,
        actionType: "shift",
      });
      j--;
    }

    current[j + 1] = key;
    allStates.push({
      words: [...current],
      heldWord: null,
      heldFrom: null,
      actionType: "return",
    });
  }

  return allStates;
}

/** Expected operations for a round: copy + shifts + return for each insertion pass. */
function computeExpectedOps(initial: string[]): number {
  return insertionSortActionStates(initial).length;
}

function computeCheckStats(rows: RowState[], initial: string[]): { correctOps: number; totalOps: number } {
  const expectedStates = insertionSortActionStates(initial);
  let correctOps = 0;
  let totalOps = 0;
  const actualActionRows = rows.filter((row) => row.actionType !== null);

  actualActionRows.forEach((row, actionIndex) => {
    const expected = expectedStates[actionIndex];
    totalOps++;
    if (!expected) return;
    const wordsMatch = expected.words.every((word, idx) => row.words[idx] === word);
    const heldMatch = row.heldWord === expected.heldWord && row.heldFrom === expected.heldFrom;
    if (row.actionType === expected.actionType && wordsMatch && heldMatch) {
      correctOps++;
    }
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
  const expectedActionStates = insertionSortActionStates(rounds[roundIdx].initial);

  const handleCellClick = (idx: number) => {
    if (activeRow.isSorted) return;
    setCheckPerformed(false);
    setSelectedIndices((prev) => {
      if (prev[0] === idx) return [];
      return [idx];
    });
  };

  const handleCopy = () => {
    if (selectedIndices.length !== 1) return;
    const sourceIdx = selectedIndices[0];
    const heldWord = activeRow.words[sourceIdx];
    const newRow: RowState = {
      id: `r${roundIdx}-${rowCounter}`,
      words: [...activeRow.words],
      heldWord,
      heldFrom: sourceIdx,
      actionType: "copy",
      affectedIndices: [sourceIdx],
      isSorted: false,
    };

    setRows((prev) => [...prev, newRow]);
    setRowCounter((count) => count + 1);
    setSelectedIndices([]);
    setCheckPerformed(false);
  };

  const handleShift = () => {
    if (selectedIndices.length !== 1) return;
    const sourceIdx = selectedIndices[0];
    if (sourceIdx >= activeRow.words.length - 1) return;

    const newWords = [...activeRow.words];
    newWords[sourceIdx + 1] = activeRow.words[sourceIdx];
    const newRow: RowState = {
      id: `r${roundIdx}-${rowCounter}`,
      words: newWords,
      heldWord: activeRow.heldWord,
      heldFrom: activeRow.heldFrom,
      actionType: "shift",
      affectedIndices: [sourceIdx, sourceIdx + 1],
      isSorted: false,
    };

    setRows((prev) => [...prev, newRow]);
    setRowCounter((count) => count + 1);
    setSelectedIndices([]);
    setCheckPerformed(false);
  };

  const handleReturn = () => {
    if (selectedIndices.length !== 1 || !activeRow.heldWord) return;
    const targetIdx = selectedIndices[0];
    const newWords = [...activeRow.words];
    newWords[targetIdx] = activeRow.heldWord;

    const newRow: RowState = {
      id: `r${roundIdx}-${rowCounter}`,
      words: newWords,
      heldWord: null,
      heldFrom: null,
      actionType: "return",
      affectedIndices: [targetIdx],
      isSorted: false,
    };

    setRows((prev) => [...prev, newRow]);
    setRowCounter((count) => count + 1);
    setSelectedIndices([]);
    setCheckPerformed(false);
  };

  const handleDeleteRow = () => {
    if (rows.length <= 1) return;
    setRows((prev) => prev.slice(0, -1));
    setSelectedIndices([]);
    setCheckPerformed(false);
  };

  const handleSorted = () => {
    setRows((prev) => {
      const updated = [...prev];
      updated[updated.length - 1] = { ...updated[updated.length - 1], isSorted: true };
      return updated;
    });
    setSelectedIndices([]);
    setCheckPerformed(false);
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
          Sort the fruits alphabetically using insertion sort operations only: <b>Copy</b> the key
          into temporary storage, <b>Shift</b> larger items one step right, then <b>Return</b> the
          copied key into its final spot. Use <b>Delete Row</b> to undo the last step and
          <b> Sorted</b> when the array is complete.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/60 bg-background/40 p-4 sm:p-6">
        <div className="flex flex-col items-center gap-5">
          {rows.map((row, rowIndex) => {
            const isActive = rowIndex === rows.length - 1;

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
                    const isAffected = row.affectedIndices?.includes(cellIdx) ?? false;
                    const isSelected =
                      isActive && !row.isSorted && selectedIndices.includes(cellIdx);

                    let cellCorrect: boolean | null = null;
                    if (checkPerformed) {
                      const actionRows = rows.slice(0, rowIndex + 1).filter((candidate) => candidate.actionType !== null);
                      const actionIndex = actionRows.length - 1;
                      const expectedState = actionIndex >= 0 ? expectedActionStates[actionIndex] : null;
                      if (row.actionType && expectedState && isAffected) {
                        cellCorrect = expectedState.words[cellIdx] === row.words[cellIdx];
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
                          isAffected
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
                <div className="flex items-center gap-1 -mt-1 pb-1">
                  {row.words.map((_, cellIdx) => {
                    const isHoldingAtCell = row.heldFrom === cellIdx && row.heldWord !== null;
                    return (
                      <div
                        key={`temp-${row.id}-${cellIdx}`}
                        className={cn(
                          "flex h-8 w-[76px] shrink-0 items-center justify-center rounded-md border border-dashed text-[11px] sm:text-xs",
                          isHoldingAtCell
                            ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/60 dark:text-blue-200"
                            : "border-transparent text-transparent",
                        )}
                      >
                        {isHoldingAtCell ? row.heldWord : "·"}
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
                      onClick={handleCopy}
                      disabled={selectedIndices.length !== 1}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Copy
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleShift}
                      disabled={selectedIndices.length !== 1 || selectedIndices[0] >= activeRow.words.length - 1}
                    >
                      <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
                      Shift
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleReturn}
                      disabled={selectedIndices.length !== 1 || !activeRow.heldWord}
                    >
                      <CornerUpLeft className="mr-1.5 h-3.5 w-3.5" />
                      Return
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
            ? "No copy/shift/return actions to check yet."
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
