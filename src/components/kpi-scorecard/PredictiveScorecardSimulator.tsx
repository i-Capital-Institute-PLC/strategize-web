"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Sparkles,
  TrendingUp,
  RotateCcw,
  Award,
  Target,
  Sliders,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SimulatorKpiScore {
  aggregatedKpiScoreId: string;
  kpi: {
    kpiId: string;
    name: string;
    description?: string;
    quarterPlans?: Array<{
      quarterNumber: number;
      effectiveTarget?: number | string | null;
      status?: string | null;
    }>;
    quarterResults?: Array<{
      quarterPlanId?: string;
      finalActual?: number | string | null;
      finalAchievementRate?: number | string | null;
      status?: string | null;
    }>;
  };
  level: string;
  actualValue: number;
  targetValue: number;
  weight: number;
  cap: number;
  achievementRate: number;
  score: number;
}

interface PredictiveScorecardSimulatorProps {
  currentTotalScore: number;
  maxPossibleScore: number;
  kpiScores: SimulatorKpiScore[];
  currentQuarter?: number;
  onApplySimulatedScores?: (projectedScores: Map<string, number>) => void;
  className?: string;
}

type AppraisalTier = {
  tierName: string;
  label: string;
  minPct: number;
  badgeClass: string;
  color: string;
};

const APPRAISAL_TIERS: AppraisalTier[] = [
  {
    tierName: "Tier 1",
    label: "Exceeds Expectations (Exceptional)",
    minPct: 120,
    badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300",
    color: "#059669",
  },
  {
    tierName: "Tier 2",
    label: "Meets Expectations (Achieved)",
    minPct: 100,
    badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300",
    color: "#2563eb",
  },
  {
    tierName: "Tier 3",
    label: "Needs Improvement (Developing)",
    minPct: 75,
    badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300",
    color: "#d97706",
  },
  {
    tierName: "Tier 4",
    label: "Below Expectations (Unsatisfactory)",
    minPct: 0,
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-red-300",
    color: "#dc2626",
  },
];

function getAppraisalTier(ratePercent: number): AppraisalTier {
  for (const tier of APPRAISAL_TIERS) {
    if (ratePercent >= tier.minPct) return tier;
  }
  return APPRAISAL_TIERS[APPRAISAL_TIERS.length - 1];
}

export function PredictiveScorecardSimulator({
  currentTotalScore,
  maxPossibleScore,
  kpiScores,
  currentQuarter = 2,
  className,
}: PredictiveScorecardSimulatorProps) {
  // Determine which quarters are open/future for simulation
  const futureQuarters = useMemo(() => {
    const list: number[] = [];
    for (let q = Math.max(1, currentQuarter); q <= 4; q++) {
      list.push(q);
    }
    return list;
  }, [currentQuarter]);

  // Quarter simulation slider rates (percentage from 0 to 150)
  const [quarterSimulations, setQuarterSimulations] = useState<Record<number, number>>(() => {
    const initial: Record<number, number> = {};
    for (const q of futureQuarters) {
      initial[q] = 100;
    }
    return initial;
  });

  const [expandedDetails, setExpandedDetails] = useState(false);

  // Set simulation for all future quarters at once
  const handleGlobalRateChange = (rate: number) => {
    const next: Record<number, number> = {};
    for (const q of futureQuarters) {
      next[q] = rate;
    }
    setQuarterSimulations(next);
  };

  const handleQuarterChange = (quarter: number, rate: number) => {
    setQuarterSimulations((prev) => ({
      ...prev,
      [quarter]: rate,
    }));
  };

  const handleReset = () => {
    const resetVals: Record<number, number> = {};
    for (const q of futureQuarters) {
      resetVals[q] = 100;
    }
    setQuarterSimulations(resetVals);
  };

  // Recalculate projected scores based on simulated quarter delivery
  const projection = useMemo(() => {
    let projectedTotal = 0;
    const kpiProjections = kpiScores.map((kpiScore) => {
      const plans = kpiScore.kpi.quarterPlans || [];
      const results = kpiScore.kpi.quarterResults || [];

      // Calculate annual projected achievement by averaging quarter rates (or weighted)
      let quarterRateSum = 0;
      let quartersCount = 0;

      for (let q = 1; q <= 4; q++) {
        const plan = plans.find((p) => p.quarterNumber === q);
        const result = results.find(
          (r) => r.quarterPlanId && plan && r.quarterPlanId === (plan as any).kpiQuarterPlanId,
        );

        if (q < currentQuarter && result && result.finalAchievementRate != null) {
          // Closed quarter: use actual
          quarterRateSum += Number(result.finalAchievementRate);
          quartersCount++;
        } else if (futureQuarters.includes(q)) {
          // Open/Future quarter: use simulated rate
          const simPct = quarterSimulations[q] ?? 100;
          quarterRateSum += simPct / 100;
          quartersCount++;
        } else if (result && result.finalAchievementRate != null) {
          quarterRateSum += Number(result.finalAchievementRate);
          quartersCount++;
        } else {
          // Default baseline
          quarterRateSum += 1.0;
          quartersCount++;
        }
      }

      const avgAchievementRate = quartersCount > 0 ? quarterRateSum / quartersCount : kpiScore.achievementRate;
      const cappedRate = Math.min(avgAchievementRate, kpiScore.cap || 1.5);
      const projectedScore = cappedRate * kpiScore.weight;

      projectedTotal += projectedScore;

      return {
        ...kpiScore,
        projectedAchievementRate: avgAchievementRate,
        projectedScore,
        deltaScore: projectedScore - kpiScore.score,
      };
    });

    const maxScore = maxPossibleScore > 0 ? maxPossibleScore : 100;
    const currentRatePct = (currentTotalScore / maxScore) * 100;
    const projectedRatePct = (projectedTotal / maxScore) * 100;
    const deltaTotal = projectedTotal - currentTotalScore;

    return {
      projectedTotal,
      projectedRatePct,
      currentRatePct,
      deltaTotal,
      currentTier: getAppraisalTier(currentRatePct),
      projectedTier: getAppraisalTier(projectedRatePct),
      kpiProjections,
    };
  }, [
    kpiScores,
    currentQuarter,
    futureQuarters,
    quarterSimulations,
    currentTotalScore,
    maxPossibleScore,
  ]);

  return (
    <Card className={cn("border-2 border-indigo-200 dark:border-indigo-900 bg-gradient-to-br from-indigo-50/40 via-white to-blue-50/40 dark:from-indigo-950/20 dark:via-slate-900 dark:to-blue-950/20 shadow-md", className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                What-If Predictive Performance Simulator
                <Badge variant="outline" className="border-indigo-300 text-indigo-700 dark:text-indigo-300 text-[10px]">
                  Interactive
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Simulate future quarter target fulfillment to instantly preview projected annual composite appraisal impact.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="h-8 text-xs gap-1 border-slate-300 dark:border-slate-700"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Actuals
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Comparison Hero Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Current Actual */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Current Actual Score
              </span>
              <Badge className={cn("text-xs font-medium", projection.currentTier.badgeClass)}>
                {projection.currentTier.label}
              </Badge>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                {currentTotalScore.toFixed(2)}%
              </span>
              <span className="text-xs text-muted-foreground">
                of {maxPossibleScore.toFixed(0)}% max
              </span>
            </div>
            <Progress
              value={Math.min(projection.currentRatePct, 100)}
              className="h-2 bg-slate-100 dark:bg-slate-800"
            />
          </div>

          {/* Projected Simulated */}
          <div className="rounded-xl border-2 border-indigo-300 dark:border-indigo-700 bg-indigo-50/60 dark:bg-indigo-950/40 p-4 space-y-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-200 uppercase tracking-wide flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-indigo-600" />
                Projected Composite Appraisal
              </span>
              <Badge className={cn("text-xs font-bold shadow-sm", projection.projectedTier.badgeClass)}>
                {projection.projectedTier.label}
              </Badge>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-indigo-700 dark:text-indigo-300">
                {projection.projectedTotal.toFixed(2)}%
              </span>
              <span
                className={cn(
                  "text-xs font-bold px-2 py-0.5 rounded-full",
                  projection.deltaTotal >= 0
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
                )}
              >
                {projection.deltaTotal >= 0 ? "+" : ""}
                {projection.deltaTotal.toFixed(2)}% Projected Impact
              </span>
            </div>
            <Progress
              value={Math.min(projection.projectedRatePct, 100)}
              className="h-2 bg-indigo-200 dark:bg-indigo-900"
            />
          </div>
        </div>

        {/* Quick Scenario Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400 mr-1 flex items-center gap-1">
            <Sliders className="h-3.5 w-3.5" />
            Quick Scenarios:
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleGlobalRateChange(100)}
            className="h-7 text-xs bg-white dark:bg-slate-900 hover:bg-slate-100"
          >
            🎯 100% On-Target
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleGlobalRateChange(120)}
            className="h-7 text-xs bg-white dark:bg-slate-900 hover:bg-slate-100 text-emerald-700 dark:text-emerald-400 border-emerald-300"
          >
            🚀 120% High Performer
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleGlobalRateChange(80)}
            className="h-7 text-xs bg-white dark:bg-slate-900 hover:bg-slate-100 text-amber-700 dark:text-amber-400"
          >
            ⚠️ 80% Conservative
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleGlobalRateChange(50)}
            className="h-7 text-xs bg-white dark:bg-slate-900 hover:bg-slate-100 text-red-600"
          >
            🚨 50% Stress Test
          </Button>
        </div>

        {/* Interactive Quarter Sliders */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 p-4 space-y-4">
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
            Adjust Future Quarter Delivery Sliders
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {futureQuarters.map((quarter) => {
              const currentVal = quarterSimulations[quarter] ?? 100;
              return (
                <div
                  key={quarter}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-indigo-500" />
                      Q{quarter} Simulated Delivery
                    </span>
                    <span
                      className={cn(
                        "font-mono text-xs font-bold px-2 py-0.5 rounded",
                        currentVal >= 100
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : currentVal >= 75
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
                      )}
                    >
                      {currentVal}%
                    </span>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={150}
                    step={5}
                    value={currentVal}
                    onChange={(e) =>
                      handleQuarterChange(quarter, Number(e.target.value))
                    }
                    className="w-full accent-indigo-600 cursor-pointer"
                  />

                  <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100% (Quota)</span>
                    <span>150%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Collapsible Per-KPI Projected Impact Breakdown */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpandedDetails(!expandedDetails)}
            className="w-full justify-between text-xs text-muted-foreground hover:text-foreground"
          >
            <span>
              {expandedDetails ? "Hide" : "Show"} Individual KPI Projected Scores ({kpiScores.length} KPIs)
            </span>
            {expandedDetails ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>

          {expandedDetails && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-slate-500 font-semibold text-left">
                    <th className="py-2 pr-3">KPI Name</th>
                    <th className="py-2 px-2 text-right">Weight</th>
                    <th className="py-2 px-2 text-right">Actual Score</th>
                    <th className="py-2 px-2 text-right">Projected Score</th>
                    <th className="py-2 pl-2 text-right">Projected Gain</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {projection.kpiProjections.map((kp) => (
                    <tr key={kp.aggregatedKpiScoreId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2 pr-3 font-medium text-slate-800 dark:text-slate-200 max-w-[240px] truncate">
                        {kp.kpi.name}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-slate-600 dark:text-slate-400">
                        {kp.weight.toFixed(1)}%
                      </td>
                      <td className="py-2 px-2 text-right font-mono">
                        {kp.score.toFixed(2)}%
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {kp.projectedScore.toFixed(2)}%
                      </td>
                      <td className="py-2 pl-2 text-right font-mono font-semibold">
                        <span
                          className={
                            kp.deltaScore >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400"
                          }
                        >
                          {kp.deltaScore >= 0 ? "+" : ""}
                          {kp.deltaScore.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

