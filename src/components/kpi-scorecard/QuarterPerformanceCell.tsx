import { useApolloClient, useMutation } from "@apollo/client";
import { useState } from "react";
import { Loader2, ChevronDown } from "lucide-react";
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
          const effectiveTarget = plan ? Number(plan.effectiveTarget) : null;
          const actual = hasResult ? Number(result!.finalActual) : null;

          const isFinalizing = loading && finalizingQuarter === quarter;
          const showFinalize =
            canFinalize &&
            plan?.status === "APPROVED" &&
            result?.status === "PROVISIONAL";

          // Determine display status: prefer result status, else plan status
          const displayStatus = result?.status ?? plan?.status;

          // "In Progress" label for open quarters with no result yet
          const isOpenQuarter = plan && !hasResult;

          // Tooltip breakdown content
          const breakdownContent = (
            <div className="space-y-1 text-xs min-w-[160px]">
              <div className="font-semibold text-foreground mb-1">
                Q{quarter} Breakdown
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Original target:</span>
                <span>{plan ? Number(plan.originalTarget).toFixed(2) : "—"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Carry in:</span>
                <span
                  className={
                    Number(plan?.carryIn ?? 0) < 0
                      ? "text-green-600"
                      : Number(plan?.carryIn ?? 0) > 0
                        ? "text-amber-600"
                        : ""
                  }
                >
                  {plan ? formatSigned(Number(plan.carryIn ?? 0)) : "—"}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Effective target:</span>
                <span className="font-medium">
                  {plan ? Number(plan.effectiveTarget).toFixed(2) : "—"}
                </span>
              </div>
              {hasResult && (
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
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Contribution:</span>
                    <span className="text-primary">
                      {Number(result!.weightedScore).toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      {result!.status === "FINAL"
                        ? "Applied carry:"
                        : "Projected carry:"}
                    </span>
                    <span>{formatSigned(Number(result!.carryOut))}</span>
                  </div>
                </>
              )}
            </div>
          );

          return (
            <Tooltip key={quarter}>
              <TooltipTrigger asChild>
                <div className="rounded-md border bg-muted/30 p-2 text-xs cursor-default hover:bg-muted/60 transition-colors">
                  {/* Quarter label + status badge */}
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-semibold">Q{quarter}</span>
                    <div className="flex items-center gap-0.5">
                      {getStatusBadge(displayStatus)}
                      <ChevronDown className="w-3 h-3 text-muted-foreground opacity-50" />
                    </div>
                  </div>

                  {/* Compact: Target vs Actual */}
                  {isOpenQuarter ? (
                    <div className="text-muted-foreground text-[10px] mt-0.5">
                      Target: {effectiveTarget?.toFixed(2) ?? "—"}
                      <div className="mt-0.5 text-[10px] text-blue-500 font-medium">
                        In Progress
                      </div>
                    </div>
                  ) : hasResult ? (
                    <>
                      <div className="text-muted-foreground text-[10px]">
                        {actual?.toFixed(2) ?? "—"} /{" "}
                        {effectiveTarget?.toFixed(2) ?? "—"}
                      </div>
                      <div
                        className={`mt-0.5 text-[11px] ${getAchievementClass(achievementRate)}`}
                      >
                        {achievementDisplay}
                      </div>
                    </>
                  ) : (
                    <div className="text-muted-foreground text-[10px]">
                      No data
                    </div>
                  )}

                  {/* Finalize button */}
                  {showFinalize && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2 h-6 w-full text-[10px]"
                          disabled={isFinalizing}
                        >
                          {isFinalizing && (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          )}
                          Finalize
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Finalize Q{quarter}?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This locks the quarter result and{" "}
                            {quarter < 4
                              ? `applies its ${formatSigned(Number(result!.carryOut))} balance to Q${quarter + 1}`
                              : "records the final annual balance"}
                            . Finalized quarters cannot accept new logbook
                            achievements.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleFinalize(quarter)}
                          >
                            Finalize Quarter
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
