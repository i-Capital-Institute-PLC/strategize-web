import { useApolloClient, useMutation } from "@apollo/client";
import { useState, useMemo } from "react";
import { Loader2, ChevronDown, AlertTriangle, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/auth/useAuth";
import { FINALIZE_KPI_QUARTER } from "@/lib/graphql/queries/kpi-scorecard";
import type { KpiQuarterPlan, KpiQuarterResult } from "@/types/graphql";
import { cn } from "@/lib/utils";

interface QuarterPerformanceCellProps {
  kpiId: string;
  plans?: KpiQuarterPlan[];
  results?: KpiQuarterResult[];
}

function getStatusBadge(status: string | undefined) {
  if (!status) return null;
  switch (status) {
    case "FINAL":
      return (
        <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 rounded-full">
          Final
        </Badge>
      );
    case "APPROVED":
      return (
        <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 rounded-full">
          Approved
        </Badge>
      );
    case "PROVISIONAL":
      return (
        <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0 rounded-full">
          Provisional
        </Badge>
      );
    default:
      return (
        <Badge className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground border-0 rounded-full">
          {status}
        </Badge>
      );
  }
}

function getAchievementClass(rate: number | undefined): string {
  if (rate === undefined) return "text-muted-foreground";
  if (rate >= 1.0) return "text-emerald-600 font-semibold";
  if (rate >= 0.75) return "text-blue-600 font-semibold";
  if (rate >= 0.6) return "text-yellow-600 font-semibold";
  return "text-red-600 font-semibold";
}

export function QuarterPerformanceCell({
  kpiId,
  plans = [],
  results = [],
}: QuarterPerformanceCellProps) {
  const { user } = useAuth();
  const client = useApolloClient();
  const canFinalize = ["HR", "ADMIN", "SUPER_ADMIN"].includes(user?.role ?? "");
  const [finalizingQuarter, setFinalizingQuarter] = useState<number | null>(
    null,
  );
  const [finalizeQuarter, { loading }] = useMutation(FINALIZE_KPI_QUARTER, {
    onCompleted: async () => {
      toast.success("Quarter finalized and carry-forward applied");
      await client.refetchQueries({
        include: ["GetRealtimeIndividualScorecard", "GetTotalScorecardScore"],
      });
    },
    onError: (error) => toast.error(error.message),
  });

  const handleFinalize = async (quarterNumber: number) => {
    setFinalizingQuarter(quarterNumber);
    try {
      await finalizeQuarter({ variables: { kpiId, quarterNumber } });
    } finally {
      setFinalizingQuarter(null);
    }
  };

  // Determine current active fiscal quarter and elapsed pace
  const { activeQuarter, calendarElapsed } = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    // Fiscal quarters starting in July (6):
    // Jul(6), Aug(7), Sep(8) -> Q1
    // Oct(9), Nov(10), Dec(11) -> Q2
    // Jan(0), Feb(1), Mar(2) -> Q3
    // Apr(3), May(4), Jun(5) -> Q4
    const qNum = m >= 6 ? Math.floor((m - 6) / 3) + 1 : Math.floor(m / 3) + 3;

    let qStartMonth = 9;
    if (qNum === 1) qStartMonth = 6;
    else if (qNum === 2) qStartMonth = 9;
    else if (qNum === 3) qStartMonth = 0;
    else if (qNum === 4) qStartMonth = 3;

    const qStartDate = new Date(now.getFullYear(), qStartMonth, 1);
    const qEndDate = new Date(now.getFullYear(), qStartMonth + 3, 0, 23, 59, 59);

    const totalMs = qEndDate.getTime() - qStartDate.getTime();
    const elapsedMs = now.getTime() - qStartDate.getTime();
    const elapsed = Math.max(0.05, Math.min(1.0, elapsedMs / totalMs));

    return { activeQuarter: qNum, calendarElapsed: elapsed };
  }, []);

  if (plans.length === 0) {
    return <span className="text-xs text-muted-foreground">Annual only</span>;
  }

  return (
    <TooltipProvider>
      <div className="grid min-w-[18rem] grid-cols-4 gap-1.5 sm:min-w-[22rem]">
        {[1, 2, 3, 4].map((quarter) => {
          const plan = plans.find((item) => item.quarterNumber === quarter);
          const result = results.find(
            (item) => item.quarterPlanId === plan?.kpiQuarterPlanId,
          );

          const hasResult = Boolean(result);
          const achievementRate = hasResult
            ? Number(result!.finalAchievementRate)
            : undefined;
          const achievementDisplay =
            achievementRate !== undefined
              ? `${(achievementRate * 100).toFixed(1)}%`
              : null;

          // Effective target vs actual – compact summary
          const effectiveTarget = plan ? Number(plan.effectiveTarget ?? plan.originalTarget ?? 0) : null;
          const actual = hasResult ? Number(result!.finalActual) : null;

          const isZeroTarget = plan != null && effectiveTarget === 0;

          // Pacing check for current active quarter
          const isActiveQuarter = quarter === activeQuarter;
          let isAtRisk = false;
          let pacingVariance = 0;

          if (isActiveQuarter && !isZeroTarget && effectiveTarget && effectiveTarget > 0) {
            const delivered = actual ?? 0;
            const pace = delivered / effectiveTarget;
            pacingVariance = pace - calendarElapsed;
            if (pacingVariance <= -0.2) {
              isAtRisk = true;
            }
          }

          const isFinalizing = loading && finalizingQuarter === quarter;
          const showFinalize =
            canFinalize &&
            plan?.status === "APPROVED" &&
            result?.status === "PROVISIONAL";

          // Determine display status: prefer result status, else plan status
          const displayStatus = result?.status ?? plan?.status;

          // "In Progress" label for open quarters with no result yet
          const isOpenQuarter = plan && !hasResult;

          // Unachieved check for closed/recorded quarters
          const isUnachievedClosed = hasResult && achievementRate !== undefined && achievementRate < 0.75;

          // Tooltip breakdown content
          const breakdownContent = (
            <div className="space-y-1 text-xs min-w-[170px]">
              <div className="font-semibold text-foreground mb-1 flex items-center justify-between">
                <span>Q{quarter} Breakdown</span>
                {isAtRisk && (
                  <span className="text-[10px] text-red-600 font-bold bg-red-100 dark:bg-red-950 px-1 rounded">
                    At-Risk
                  </span>
                )}
              </div>

              {isZeroTarget ? (
                <div className="text-slate-400 py-1">
                  There is no planned target this quarter (0.00 quota).
                </div>
              ) : (
                <>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Original target:</span>
                    <span>{plan ? Number(plan.originalTarget).toFixed(2) : "—"}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Carry in:</span>
                    <span
                      className={
                        Number(plan?.carryIn ?? 0) < 0
                          ? "text-emerald-600 font-semibold"
                          : Number(plan?.carryIn ?? 0) > 0
                            ? "text-amber-600 font-semibold"
                            : ""
                      }
                      title={
                        Number(plan?.carryIn ?? 0) < 0
                          ? "Surplus credit applied: reduced effective target"
                          : Number(plan?.carryIn ?? 0) > 0
                            ? "Deficit carry: increased effective target"
                            : undefined
                      }
                    >
                      {plan
                        ? Number(plan.carryIn ?? 0) < 0
                          ? `${formatSigned(Number(plan.carryIn ?? 0))} (surplus credit)`
                          : Number(plan.carryIn ?? 0) > 0
                            ? `${formatSigned(Number(plan.carryIn ?? 0))} (deficit)`
                            : "0.00"
                        : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Effective target:</span>
                    <span className="font-medium">
                      {plan ? Number(plan.effectiveTarget).toFixed(2) : "—"}
                    </span>
                  </div>
                </>
              )}

              {hasResult && !isZeroTarget && (
                <>
                  <div className="border-t my-1" />
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Actual:</span>
                    <span>{Number(result!.finalActual).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Achievement:</span>
                    <span className={getAchievementClass(achievementRate)}>
                      {achievementDisplay}
                    </span>
                  </div>
                  {result!.weightedScore != null && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Contribution:</span>
                      <span className="text-primary">
                        {Number(result!.weightedScore).toFixed(2)}%
                      </span>
                    </div>
                  )}
                  {result!.carryOut != null && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">
                        {result!.status === "FINAL"
                          ? "Applied carry:"
                          : "Projected carry:"}
                      </span>
                      <span
                        className={
                          Number(result!.carryOut) < 0
                            ? "text-emerald-600 font-semibold"
                            : Number(result!.carryOut) > 0
                              ? "text-amber-600 font-semibold"
                              : ""
                        }
                        title={
                          Number(result!.carryOut) < 0
                            ? "Overachievement surplus: carried forward to reduce next quarter's target (not a penalty)"
                            : Number(result!.carryOut) > 0
                              ? "Target deficit: carried forward to next quarter"
                              : undefined
                        }
                      >
                        {Number(result!.carryOut) < 0
                          ? `${formatSigned(Number(result!.carryOut))} (surplus credit)`
                          : Number(result!.carryOut) > 0
                            ? `${formatSigned(Number(result!.carryOut))} (deficit)`
                            : "0.00"}
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Pacing Info for Active Quarter */}
              {isActiveQuarter && !isZeroTarget && (
                <div className="border-t pt-1 mt-1 space-y-0.5 text-[11px]">
                  <div className="flex justify-between text-slate-500">
                    <span>Quarter Elapsed:</span>
                    <span>{(calendarElapsed * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Pacing Variance:</span>
                    <span
                      className={
                        pacingVariance >= 0
                          ? "text-emerald-600 font-semibold"
                          : pacingVariance <= -0.2
                            ? "text-red-600 font-bold"
                            : "text-amber-600"
                      }
                    >
                      {pacingVariance >= 0 ? "+" : ""}
                      {(pacingVariance * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          );

          return (
            <Tooltip key={quarter}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "rounded-md border p-2 text-xs cursor-default transition-colors relative",
                    isAtRisk
                      ? "border-red-300 bg-red-50/40 dark:border-red-900/60 dark:bg-red-950/20 hover:bg-red-50/70"
                      : isUnachievedClosed
                        ? "border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/10 hover:bg-amber-50/50"
                        : "border-slate-200 dark:border-slate-800 bg-muted/30 hover:bg-muted/60",
                  )}
                >
                  {/* Quarter label + status badge */}
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-semibold flex items-center gap-1">
                      Q{quarter}
                      {isActiveQuarter && (
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-600" title="Active Quarter" />
                      )}
                    </span>
                    <div className="flex items-center gap-0.5">
                      {getStatusBadge(displayStatus)}
                      <ChevronDown className="w-3 h-3 text-muted-foreground opacity-50" />
                    </div>
                  </div>

                  {/* Compact: Target vs Actual */}
                  {isZeroTarget ? (
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 italic mt-0.5 leading-tight">
                      No planned target this quarter
                    </div>
                  ) : isOpenQuarter ? (
                    <div className="text-muted-foreground text-[10px] mt-0.5">
                      Target: {effectiveTarget?.toFixed(2) ?? "—"}
                      <div className="mt-0.5 flex items-center justify-between">
                        <span className="text-[10px] text-blue-500 font-medium">
                          In Progress
                        </span>
                        {isAtRisk && (
                          <span className="text-[9px] font-bold text-red-600 bg-red-100 dark:bg-red-950 px-1 rounded animate-pulse">
                            At-Risk
                          </span>
                        )}
                      </div>
                    </div>
                  ) : hasResult ? (
                    <>
                      <div className="text-muted-foreground text-[10px]">
                        {actual?.toFixed(2) ?? "—"} /{" "}
                        {effectiveTarget?.toFixed(2) ?? "—"}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span
                          className={`text-[11px] ${getAchievementClass(achievementRate)}`}
                        >
                          {achievementDisplay}
                        </span>
                        {isAtRisk && (
                          <span className="text-[9px] font-bold text-red-600 bg-red-100 dark:bg-red-950 px-1 rounded">
                            At-Risk
                          </span>
                        )}
                        {isUnachievedClosed && !isAtRisk && (
                          <span className="text-[9px] text-amber-600 bg-amber-50 dark:bg-amber-950/60 px-1 rounded">
                            Unachieved
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-muted-foreground text-[10px]">
                      No data
                    </div>
                  )}

                  {/* High-impact prominent Finalize action button */}
                  {showFinalize && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          className="mt-2.5 h-7 w-full px-1.5 text-[11px] font-bold tracking-tight shadow-sm transition-all duration-150 flex items-center justify-center gap-1 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white dark:from-indigo-500 dark:to-blue-600 dark:hover:from-indigo-600 dark:hover:to-blue-700 rounded border border-indigo-700/30 hover:shadow-md active:scale-95 cursor-pointer ring-1 ring-indigo-400/20"
                          disabled={isFinalizing}
                          title={`Finalize Q${quarter} to lock balance and apply carry-forward`}
                        >
                          {isFinalizing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Lock className="h-3 w-3 stroke-[2.5]" />
                          )}
                          <span>Finalize</span>
                          <span className="hidden sm:inline">Q{quarter}</span>
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="max-w-md">
                        <AlertDialogHeader>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                              <AlertTriangle className="h-5 w-5" />
                            </div>
                            <AlertDialogTitle className="text-base font-bold">
                              Finalize Quarter {quarter} & Lock Results?
                            </AlertDialogTitle>
                          </div>
                          <AlertDialogDescription asChild>
                            <div className="text-sm space-y-2 text-foreground/80 mt-1">
                              <p>
                                This is a permanent operational action that <strong>locks Q{quarter}</strong> and transfers the balance to the subsequent quarter.
                              </p>
                              <div className="p-3 rounded-lg border bg-muted/50 text-xs space-y-1.5">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Status Change:</span>
                                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">PROVISIONAL → FINAL</span>
                                </div>
                                <div className="flex justify-between gap-2">
                                  <span className="text-muted-foreground whitespace-nowrap">Carry-Forward Impact:</span>
                                  <span className="font-bold text-right">
                                    {quarter < 4
                                      ? Number(result!.carryOut ?? 0) < 0
                                        ? `+${Math.abs(Number(result!.carryOut)).toFixed(2)} surplus credit applied to Q${quarter + 1}`
                                        : Number(result!.carryOut ?? 0) > 0
                                          ? `-${Number(result!.carryOut).toFixed(2)} deficit added to Q${quarter + 1} target`
                                          : `0.00 (on-target, no adjustment)`
                                      : "Final annual balance recorded"}
                                  </span>
                                </div>
                                <div className="text-[11px] text-muted-foreground pt-1.5 border-t">
                                  Once locked, no new logbook achievements or revisions can be submitted for Q{quarter}.
                                </div>
                              </div>
                            </div>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="mt-3">
                          <AlertDialogCancel className="font-medium">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleFinalize(quarter)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-1.5 shadow-sm"
                          >
                            <Lock className="h-4 w-4" />
                            Confirm & Finalize Q{quarter}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="p-3 max-w-[240px]">
                {breakdownContent}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

function formatSigned(value: number): string {
  if (value === 0) return "0.00";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}
