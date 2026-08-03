import { useEffect, useRef, useState } from "react";
import type { BespokeTaskProps } from "../bespoke-task-runner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { CheckCircle2, RefreshCw, Send, Trash2, Check, X, ArrowRight } from "lucide-react";

const ANIMALS: string[] = [
  "Ant", "Bat", "Bear", "Bison", "Camel", "Cat", "Cobra", "Crow",
  "Deer", "Dingo", "Dove", "Eagle", "Eel", "Finch", "Fox", "Frog",
  "Gecko", "Goat", "Goose", "Heron", "Hippo", "Horse", "Hyena", "Ibex",
  "Koala", "Lemur", "Lynx", "Moose", "Mole", "Otter", "Panda", "Quail",
  "Raven", "Seal", "Shark", "Sheep", "Sloth", "Snake", "Swan", "Tiger",
  "Toad", "Trout", "Whale", "Wolf", "Wren", "Yak", "Zebra",
];

const ROUND_COUNT = 5;
const WORD_COUNT = 8;

type CompareResult = "match" | "no-match";
type Decision = "next" | "found" | "not-found";

interface RowState {
  id: string;
  words: string[];
  checkedIndices: number[];
  currentIndex: number | null;
  compareResult: CompareResult | null;
  nextIndex: number | null;
  decision: Decision | null;
}

interface RoundData {
  index: number;
  target: string;
  words: string[];
  isPresent: boolean;
}

interface ExpectedStep {
  comparedIndex: number;
  compareResult: CompareResult;
  decision: Decision;
  nextIndex: number | null;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildRound(index: number, isPresent: boolean): RoundData {
  const words = shuffle(ANIMALS).slice(0, WORD_COUNT);
  const target = isPresent
    ? words[Math.floor(Math.random() * words.length)]
    : shuffle(ANIMALS.filter((animal) => !words.includes(animal)))[0];

  return { index, target, words, isPresent };
}

function buildRounds(): RoundData[] {
  const presencePattern = shuffle([true, true, true, false, false]);
  return presencePattern.map((isPresent, index) => buildRound(index, isPresent));
}

function makeInitialRow(round: RoundData): RowState {
  return {
    id: `r${round.index}-0`,
    words: [...round.words],
    checkedIndices: [],
    currentIndex: null,
    compareResult: null,
    nextIndex: null,
    decision: null,
  };
}

function linearSearchSteps(round: RoundData): ExpectedStep[] {
  const foundIndex = round.words.indexOf(round.target);
  const steps: ExpectedStep[] = [];

  if (foundIndex >= 0) {
    for (let i = 0; i < foundIndex; i++) {
      steps.push({
        comparedIndex: i,
        compareResult: "no-match",
        decision: "next",
        nextIndex: i + 1,
      });
    }
    steps.push({
      comparedIndex: foundIndex,
      compareResult: "match",
      decision: "found",
      nextIndex: null,
    });
    return steps;
  }

  for (let i = 0; i < round.words.length; i++) {
    steps.push({
      comparedIndex: i,
      compareResult: "no-match",
      decision: i === round.words.length - 1 ? "not-found" : "next",
      nextIndex: i === round.words.length - 1 ? null : i + 1,
    });
  }

  return steps;
}

function isFinalizedRow(row: RowState): boolean {
  return row.currentIndex !== null && row.compareResult !== null && row.decision !== null;
}

function rowMatchesStep(row: RowState, step: ExpectedStep): boolean {
  return (
    row.currentIndex === step.comparedIndex &&
    row.compareResult === step.compareResult &&
    row.decision === step.decision &&
    row.nextIndex === step.nextIndex
  );
}

function computeExpectedOps(round: RoundData): number {
  return linearSearchSteps(round).length;
}

// Returns marks: 1 for correct word, 1 for correct match/no-match, 1 for correct decision (max 3 per row)
function computeCheckStats(rows: RowState[], round: RoundData): { correctOps: number; totalOps: number } {
  const expectedSteps = linearSearchSteps(round);
  const finalizedRows = rows.filter(isFinalizedRow);
  let correctOps = 0;

  finalizedRows.forEach((row, stepIndex) => {
    const expected = expectedSteps[stepIndex];
    if (!expected) return;
    if (row.currentIndex === expected.comparedIndex) correctOps++;
    if (row.compareResult === expected.compareResult) correctOps++;
    if (row.decision === expected.decision) correctOps++;
  });

  return { correctOps, totalOps: finalizedRows.length * 3 };
}

export default function LinearSearchBuilder({ assignmentId, maxScore, onComplete }: BespokeTaskProps) {
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
  const expectedSteps = linearSearchSteps(round);

  const updateActiveRow = (updater: (row: RowState) => RowState) => {
    setRows((prev) => {
      const updated = [...prev];
      updated[updated.length - 1] = updater(updated[updated.length - 1]);
      return updated;
    });
  };

  const handleCellClick = (idx: number) => {
    if (activeRow.decision === "found" || activeRow.decision === "not-found") return;
    setCheckPerformed(false);

    updateActiveRow((row) => ({
      ...row,
      currentIndex: row.currentIndex === idx ? null : idx,
      compareResult: null,
      nextIndex: null,
      decision: null,
    }));
  };

  const handleMatch = () => {
    if (activeRow.currentIndex === null) return;
    setCheckPerformed(false);
    updateActiveRow((row) => ({
      ...row,
      compareResult: "match",
      nextIndex: null,
      decision: null,
    }));
  };

  const handleNoMatch = () => {
    if (activeRow.currentIndex === null) return;
    setCheckPerformed(false);
    updateActiveRow((row) => ({
      ...row,
      compareResult: "no-match",
      nextIndex: null,
      decision: null,
    }));
  };

  const handleReturnFound = () => {
    if (activeRow.compareResult !== "match") return;
    setCheckPerformed(false);
    updateActiveRow((row) => ({ ...row, decision: "found", nextIndex: null }));
  };

  const handleReturnNotFound = () => {
    if (activeRow.compareResult !== "no-match") return;
    setCheckPerformed(false);
    updateActiveRow((row) => ({ ...row, decision: "not-found", nextIndex: null }));
  };

  const handleCarryOn = () => {
    if (activeRow.compareResult !== "no-match" || activeRow.currentIndex === null) return;
    const nextIndex = activeRow.currentIndex + 1;
    if (nextIndex >= activeRow.words.length) return;

    const checkedIndices = [...new Set([...activeRow.checkedIndices, activeRow.currentIndex])];
    const currentRow: RowState = {
      ...activeRow,
      checkedIndices,
      nextIndex,
      decision: "next",
    };
    const newRow: RowState = {
      id: `r${roundIdx}-${rowCounter}`,
      words: [...activeRow.words],
      checkedIndices,
      currentIndex: null,
      compareResult: null,
      nextIndex: null,
      decision: null,
    };

    setRows((prev) => [...prev.slice(0, -1), currentRow, newRow]);
    setRowCounter((count) => count + 1);
    setCheckPerformed(false);
  };

  const handleDeleteRow = () => {
    setRows((prev) => {
      if (prev.length === 1) {
        return [makeInitialRow(round)];
      }

      const trimmed = prev.slice(0, -1);
      const last = trimmed[trimmed.length - 1];

      if (last.decision === "next") {
        trimmed[trimmed.length - 1] = {
          ...last,
          nextIndex: null,
          decision: null,
        };
      }

      return trimmed;
    });
    setCheckPerformed(false);
  };

  const handleCheck = () => {
    setCheckPerformed(true);
  };

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
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base sm:text-lg font-semibold">Linear Search Builder</h2>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">Max: {currentRoundExpected} marks</Badge>
            <Badge variant="secondary">Round {roundIdx + 1} of {rounds.length}</Badge>
          </div>
        </div>
        <Progress value={(roundIdx / rounds.length) * 100} className="h-2" />
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          Start with the target word, choose a word to compare, then mark it <b>Match</b> or{" "}
          <b>No Match</b>. If the search should continue, click <b>Carry On</b> to move to the next word
          and add the next row. Use <b>Return Found</b> or{" "}
          <b>Return Not Found</b> to finish the search.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Target word:</span>
          <Badge variant="secondary" className="text-sm">{round.target}</Badge>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/60 bg-background/40 p-4 sm:p-6">
        <div className="flex flex-col items-center gap-5">
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
              <div key={row.id} className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Step {rowIndex + 1}
                  </span>
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

                <div className="flex items-center gap-1 py-2">
                  {row.words.map((word, cellIdx) => {
                    const isChecked = row.checkedIndices.includes(cellIdx) && row.currentIndex !== cellIdx;
                    const isCurrent = row.currentIndex === cellIdx;
                    const isNext = row.nextIndex === cellIdx && row.compareResult === "no-match";

                    return (
                      <div
                        key={cellIdx}
                        onClick={() => isActive && handleCellClick(cellIdx)}
                        className={cn(
                          "relative flex h-9 w-[76px] shrink-0 select-none items-center justify-center rounded-md border text-[11px] sm:text-xs font-medium transition-all",
                          isActive ? "cursor-pointer hover:opacity-75" : "cursor-default",
                          isCurrent && row.compareResult === "match"
                            ? "border-green-300 bg-green-100 text-green-800 dark:border-green-700 dark:bg-green-950/60 dark:text-green-200"
                            : isCurrent && row.compareResult === "no-match"
                            ? "border-yellow-300 bg-yellow-100 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-200"
                            : isChecked
                            ? "border-purple-300 bg-purple-100 text-purple-800 dark:border-purple-700 dark:bg-purple-950/60 dark:text-purple-200"
                            : "border-border bg-background text-foreground",
                          isCurrent && row.compareResult === null && "ring-2 ring-primary ring-offset-1",
                        )}
                      >
                        <span className="block w-full truncate px-2 text-center">{word}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap justify-center gap-2 text-[11px] text-muted-foreground">
                  <span>
                    Compare:{" "}
                    {row.currentIndex === null ? "—" : row.words[row.currentIndex]}
                  </span>
                  <span>•</span>
                  <span>
                    Result:{" "}
                    {row.compareResult === null
                      ? "—"
                      : row.compareResult === "match"
                      ? "Match"
                      : "No match"}
                  </span>
                  <span>•</span>
                  <span>
                    Decision:{" "}
                    {row.decision === null
                      ? "—"
                      : row.decision === "next"
                      ? `Next: ${row.nextIndex === null ? "—" : row.words[row.nextIndex]}`
                      : row.decision === "found"
                      ? "Return found"
                      : "Return not found"}
                  </span>
                </div>

                {isActive && (
                  <div className="flex flex-wrap justify-center gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleMatch}
                      disabled={activeRow.currentIndex === null}
                    >
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                      Match
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleNoMatch}
                      disabled={activeRow.currentIndex === null}
                    >
                      <X className="mr-1.5 h-3.5 w-3.5" />
                      No Match
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleReturnFound}
                      disabled={activeRow.compareResult === null}
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
                      onClick={handleCarryOn}
                      disabled={activeRow.compareResult === null}
                    >
                      <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
                      Carry On
                    </Button>
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
