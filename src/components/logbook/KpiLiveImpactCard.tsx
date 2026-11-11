"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Target,
  TrendingUp,
  AlertTriangle,
  Info,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiLiveImpactCardProps {
  kpiName?: string;
  quarterNumber: number;
  quarterTarget: number;
  annualTarget: number;
  deliveredPriorQuarter: number;
  deliveredPriorAnnual: number;
  enteredValue: number;
  unitType?: string | null;
  measurementUnit?: string | null;
  className?: string;
}

export function KpiLiveImpactCard({
  kpiName,
  quarterNumber,
  quarterTarget,
  annualTarget,
  deliveredPriorQuarter,
  deliveredPriorAnnual,
  enteredValue,
  unitType,
  measurementUnit,
  className,
}: KpiLiveImpactCardProps) {
  const displayUnit =
    measurementUnit ||
    (unitType === "PERCENT"
      ? "%"
      : unitType === "CURRENCY"
        ? "USD"
        : "");

  // Quarter calculations
  const isZeroQuarterTarget = quarterTarget <= 0;
  const newDeliveredQuarter = deliveredPriorQuarter + enteredValue;
  const remainingQuarter = isZeroQuarterTarget
    ? 0
    : Math.max(0, quarterTarget - newDeliveredQuarter);
  const quarterAchievementPct = isZeroQuarterTarget
    ? 0
    : (newDeliveredQuarter / quarterTarget) * 100;
  const baselineQuarterPct = isZeroQuarterTarget
    ? 0
    : (deliveredPriorQuarter / quarterTarget) * 100;
  const quarterGain = quarterAchievementPct - baselineQuarterPct;
  const isQuarterExceeded = !isZeroQuarterTarget && newDeliveredQuarter > quarterTarget;
  const quarterSurplus = newDeliveredQuarter - quarterTarget;

  // Annual calculations
  const isZeroAnnualTarget = annualTarget <= 0;
  const newDeliveredAnnual = deliveredPriorAnnual + enteredValue;
  const remainingAnnual = isZeroAnnualTarget
    ? 0
    : Math.max(0, annualTarget - newDeliveredAnnual);
  const annualAchievementPct = isZeroAnnualTarget
    ? 0
    : (newDeliveredAnnual / annualTarget) * 100;
  const baselineAnnualPct = isZeroAnnualTarget
    ? 0
    : (deliveredPriorAnnual / annualTarget) * 100;
  const annualGain = annualAchievementPct - baselineAnnualPct;

  const formatVal = (val: number) => {
    return Number.isInteger(val) ? val.toString() : val.toFixed(2);
  };

  return (
    <Card
      className={cn(
        "overflow-hidden border transition-all duration-200",
        isQuarterExceeded
          ? "border-amber-300 bg-amber-50/20 dark:border-amber-800/80 dark:bg-amber-950/10"
          : "border-blue-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40",
        className,
      )}
    >
      <CardContent className="p-4 space-y-4">
        {/* Header: Title + Quarter Pill */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5 dark:border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Live KPI Target & Impact Preview
              </span>
              {kpiName && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[280px]">
                  {kpiName}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge
              variant="secondary"
              className="bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 font-semibold text-xs"
            >
              <Calendar className="mr-1 h-3 w-3" />
              Q{quarterNumber} Focus
            </Badge>
            {displayUnit && (
              <Badge variant="outline" className="text-[11px] font-mono">
                {displayUnit}
              </Badge>
            )}
          </div>
        </div>

        {/* Zero quarter target notification */}
        {isZeroQuarterTarget ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100/70 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
            <Info className="h-4 w-4 shrink-0 text-slate-500" />
            <span>
              <strong>No planned target this quarter (0 target).</strong> Any
              activity entered will count towards annual aggregation and
              non-quota operational records.
            </span>
          </div>
        ) : (
          /* Quarterly Live Impact Section */
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-blue-600" />
                Quarter {quarterNumber} Target Achievement
              </span>
              <div className="flex items-center gap-2">
                {enteredValue > 0 && quarterGain > 0 && (
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 text-[10px] px-1.5 py-0">
                    +{quarterGain.toFixed(1)}% Live Impact
                  </Badge>
                )}
                <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  {quarterAchievementPct.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-1">
              <Progress
                value={Math.min(quarterAchievementPct, 100)}
                className="h-2.5 bg-slate-200 dark:bg-slate-800"
              />
              <div className="flex justify-between items-center text-[11px] text-slate-500 dark:text-slate-400">
                <span>
                  Delivered:{" "}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {formatVal(newDeliveredQuarter)}
                  </strong>{" "}
                  / {formatVal(quarterTarget)} {displayUnit}
                </span>
                <span>
                  Remaining:{" "}
                  <strong
                    className={
                      remainingQuarter === 0
                        ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                        : "text-blue-600 dark:text-blue-400 font-semibold"
                    }
                  >
                    {remainingQuarter === 0
                      ? "Quota Fulfilled"
                      : `${formatVal(remainingQuarter)} ${displayUnit}`}
                  </strong>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Annual Live Impact Section */}
        {!isZeroAnnualTarget && (
          <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800/60">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-indigo-600" />
                Annual Overall Target Progress
              </span>
              <div className="flex items-center gap-2">
                {enteredValue > 0 && annualGain > 0 && (
                  <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 text-[10px] px-1.5 py-0">
                    +{annualGain.toFixed(1)}% Live Impact
                  </Badge>
                )}
                <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                  {annualAchievementPct.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <Progress
                value={Math.min(annualAchievementPct, 100)}
                className="h-1.5 bg-slate-200 dark:bg-slate-800"
              />
              <div className="flex justify-between items-center text-[11px] text-slate-500 dark:text-slate-400">
                <span>
                  Annual Delivered:{" "}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {formatVal(newDeliveredAnnual)}
                  </strong>{" "}
                  / {formatVal(annualTarget)} {displayUnit}
                </span>
                <span>
                  Remaining Annual Goal:{" "}
                  <strong className="text-indigo-600 dark:text-indigo-400 font-semibold">
                    {formatVal(remainingAnnual)} {displayUnit}
                  </strong>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Warning: Exceeded Quarter Target */}
        {isQuarterExceeded && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200 animate-in fade-in">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold text-amber-800 dark:text-amber-300">
                Quarterly Target Exceeded
              </p>
              <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                This entry brings your Q{quarterNumber} progress to{" "}
                <strong>{quarterAchievementPct.toFixed(1)}%</strong> (+
                {formatVal(quarterSurplus)} {displayUnit} over the planned
                quota of {formatVal(quarterTarget)}).
                Overachievement will be recorded upon manager ratification.
              </p>
            </div>
          </div>
        )}

        {/* Target Reached celebration when precisely 100% */}
        {quarterAchievementPct >= 100 && !isQuarterExceeded && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/80 p-2.5 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>
              🎉 <strong>Quarterly Target Reached!</strong> This entry satisfies
              100% of your Q{quarterNumber} target.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

