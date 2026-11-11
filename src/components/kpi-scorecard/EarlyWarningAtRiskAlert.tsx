"use client";

import { useMemo } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export interface AtRiskKpiItem {
  kpiId: string;
  name: string;
  weight: number;
  effectiveTarget: number;
  deliveredActual: number;
  elapsedPct: number;
  deliveredPct: number;
  variance: number; // e.g. -0.25 (-25%)
  status: "AT_RISK" | "WATCH" | "ON_TRACK" | "NO_PLANNED_TARGET";
}

interface EarlyWarningAtRiskAlertProps {
  kpiScores: any[];
  currentQuarter?: number;
  onOpenCheckInDialog?: (kpiId: string, kpiName: string) => void;
  className?: string;
}

export function EarlyWarningAtRiskAlert({
  kpiScores,
  currentQuarter = 2,
  onOpenCheckInDialog,
  className,
}: EarlyWarningAtRiskAlertProps) {
  const router = useRouter();

  // Calculate calendar elapsed percentage in the active quarter
  const calendarElapsed = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth(); // 0 to 11
    // Quarter boundaries (assuming standard July-June fiscal year):
    // Q1: Jul 1 (6) - Sep 30 (8)
    // Q2: Oct 1 (9) - Dec 31 (11)
    // Q3: Jan 1 (0) - Mar 31 (2)
    // Q4: Apr 1 (3) - Jun 30 (5)
    let qStartMonth = 9;
    let qEndMonth = 11;
    if (currentQuarter === 1) {
      qStartMonth = 6;
      qEndMonth = 8;
    } else if (currentQuarter === 2) {
      qStartMonth = 9;
      qEndMonth = 11;
    } else if (currentQuarter === 3) {
      qStartMonth = 0;
      qEndMonth = 2;
    } else if (currentQuarter === 4) {
      qStartMonth = 3;
      qEndMonth = 5;
    }

    const currentYear = now.getFullYear();
    const qStartDate = new Date(currentYear, qStartMonth, 1);
    const qEndDate = new Date(currentYear, qEndMonth + 1, 0, 23, 59, 59);

    const totalMs = qEndDate.getTime() - qStartDate.getTime();
    const elapsedMs = now.getTime() - qStartDate.getTime();

    if (elapsedMs <= 0) return 0.1; // beginning of quarter
    if (elapsedMs >= totalMs) return 1.0; // quarter finished
    return elapsedMs / totalMs;
  }, [currentQuarter]);

  // Evaluate pacing for each KPI
  const { atRiskKpis, watchKpis, zeroTargetKpis, onTrackKpis } = useMemo(() => {
    const atRisk: AtRiskKpiItem[] = [];
    const watch: AtRiskKpiItem[] = [];
    const zeroTarget: AtRiskKpiItem[] = [];
    const onTrack: AtRiskKpiItem[] = [];

    for (const scoreItem of kpiScores) {
      const plans = scoreItem.kpi?.quarterPlans || [];
      const results = scoreItem.kpi?.quarterResults || [];

      const plan = plans.find((p: any) => p.quarterNumber === currentQuarter);
      const effectiveTarget = plan ? Number(plan.effectiveTarget ?? plan.originalTarget ?? 0) : 0;

      const result = results.find(
        (r: any) => plan && r.quarterPlanId === plan.kpiQuarterPlanId,
      );
      const deliveredActual = result ? Number(result.finalActual ?? 0) : 0;

      if (effectiveTarget === 0) {
        zeroTarget.push({
          kpiId: scoreItem.kpi.kpiId,
          name: scoreItem.kpi.name,
          weight: scoreItem.weight,
          effectiveTarget: 0,
          deliveredActual,
          elapsedPct: calendarElapsed,
          deliveredPct: 0,
          variance: 0,
          status: "NO_PLANNED_TARGET",
        });
        continue;
      }

      const deliveredPct = deliveredActual / effectiveTarget;
      const variance = deliveredPct - calendarElapsed;

      const item: AtRiskKpiItem = {
        kpiId: scoreItem.kpi.kpiId,
        name: scoreItem.kpi.name,
        weight: scoreItem.weight,
        effectiveTarget,
        deliveredActual,
        elapsedPct: calendarElapsed,
        deliveredPct,
        variance,
        status:
          variance <= -0.2
            ? "AT_RISK"
            : variance < 0
              ? "WATCH"
              : "ON_TRACK",
      };

      if (item.status === "AT_RISK") {
        atRisk.push(item);
      } else if (item.status === "WATCH") {
        watch.push(item);
      } else {
        onTrack.push(item);
      }
    }

    return {
      atRiskKpis: atRisk,
      watchKpis: watch,
      zeroTargetKpis: zeroTarget,
      onTrackKpis: onTrack,
    };
  }, [kpiScores, currentQuarter, calendarElapsed]);

  if (atRiskKpis.length === 0 && watchKpis.length === 0) {
    return null;
  }

  const elapsedPercentDisplay = (calendarElapsed * 100).toFixed(0);

  return (
    <div
      className={cn(
        "rounded-xl border p-4 space-y-3.5 shadow-sm transition-all duration-200",
        atRiskKpis.length > 0
          ? "border-red-300 bg-red-50/50 dark:border-red-900/60 dark:bg-red-950/20"
          : "border-amber-300 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20",
        className,
      )}
    >
      {/* Alert Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg text-white font-bold",
              atRiskKpis.length > 0
                ? "bg-red-600 animate-pulse"
                : "bg-amber-600",
            )}
          >
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div>
            <h4
              className={cn(
                "text-sm font-bold flex items-center gap-2",
                atRiskKpis.length > 0
                  ? "text-red-900 dark:text-red-200"
                  : "text-amber-900 dark:text-amber-200",
              )}
            >
              {atRiskKpis.length > 0
                ? `Early Warning: ${atRiskKpis.length} KPI${atRiskKpis.length > 1 ? "s" : ""} At-Risk Mid Quarter`
                : `${watchKpis.length} KPI${watchKpis.length > 1 ? "s" : ""} on Watch (Slight Pace Lag)`}
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] font-mono",
                  atRiskKpis.length > 0
                    ? "border-red-400 text-red-700 dark:text-red-300"
                    : "border-amber-400 text-amber-700 dark:text-amber-300",
                )}
              >
                Q{currentQuarter} · {elapsedPercentDisplay}% Elapsed
              </Badge>
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Pacing has fallen behind calendar schedule. Managers & employees are
              prompted to conduct check-in alignment sessions before it is too
              late to recover.
            </p>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={() => {
            if (onOpenCheckInDialog && atRiskKpis[0]) {
              onOpenCheckInDialog(atRiskKpis[0].kpiId, atRiskKpis[0].name);
            } else {
              router.push("/dashboard/checkin");
            }
          }}
          className={cn(
            "h-8 text-xs font-semibold gap-1.5 shadow-sm",
            atRiskKpis.length > 0
              ? "bg-red-600 hover:bg-red-700 text-white"
              : "bg-amber-600 hover:bg-amber-700 text-white",
          )}
        >
          <span>Schedule Alignment Check-In</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* List of At-Risk and Lagging KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
        {atRiskKpis.map((kpi) => {
          const deficitPct = Math.abs(kpi.variance * 100).toFixed(0);
          return (
            <div
              key={kpi.kpiId}
              className="rounded-lg border border-red-200 dark:border-red-900 bg-white/90 dark:bg-slate-900/90 p-3 space-y-1.5 shadow-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate max-w-[200px]">
                  {kpi.name}
                </span>
                <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-red-300 text-[10px] px-1.5 py-0 font-bold shrink-0">
                  🚨 {deficitPct}% Behind Pace
                </Badge>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>
                  Weight: <strong>{kpi.weight.toFixed(1)}%</strong>
                </span>
                <span>
                  Delivered:{" "}
                  <strong>
                    {kpi.deliveredActual.toFixed(1)} / {kpi.effectiveTarget.toFixed(1)}
                  </strong>{" "}
                  ({(kpi.deliveredPct * 100).toFixed(1)}%)
                </span>
              </div>

              {/* Mini visual pacing bar */}
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden relative">
                <div
                  className="bg-red-500 h-full rounded-full transition-all"
                  style={{ width: `${Math.min(kpi.deliveredPct * 100, 100)}%` }}
                />
              </div>
            </div>
          );
        })}

        {watchKpis.map((kpi) => {
          const deficitPct = Math.abs(kpi.variance * 100).toFixed(0);
          return (
            <div
              key={kpi.kpiId}
              className="rounded-lg border border-amber-200 dark:border-amber-900 bg-white/90 dark:bg-slate-900/90 p-3 space-y-1.5 shadow-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate max-w-[200px]">
                  {kpi.name}
                </span>
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 text-[10px] px-1.5 py-0 shrink-0">
                  ⚠️ {deficitPct}% Pace Lag
                </Badge>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>
                  Weight: <strong>{kpi.weight.toFixed(1)}%</strong>
                </span>
                <span>
                  Delivered:{" "}
                  <strong>
                    {kpi.deliveredActual.toFixed(1)} / {kpi.effectiveTarget.toFixed(1)}
                  </strong>{" "}
                  ({(kpi.deliveredPct * 100).toFixed(1)}%)
                </span>
              </div>

              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden relative">
                <div
                  className="bg-amber-500 h-full rounded-full transition-all"
                  style={{ width: `${Math.min(kpi.deliveredPct * 100, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

