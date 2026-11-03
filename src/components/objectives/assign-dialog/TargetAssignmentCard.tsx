"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Button } from "@/components/ui/button";
import { Target, CheckCircle, AlertCircle } from "lucide-react";
import { getDetailedUnitLabel } from "@/utils/unitTypeDetection";
import {
  getTargetAssignmentDescription,
  getTargetAssignmentStrategy,
} from "@/lib/objectives/targetAssignmentStrategy";
import type { Kpi } from "@/types/graphql";
import { resolveAnnualKpiTarget } from "@/utils/quarterTargetAllocation";
import {
  formatBasisNumber,
  multiplyBasisByPercent,
} from "@/utils/basisCalculation";

// Helper to round numbers to max 2 decimal places
const roundValue = (value: number): number => Math.round(value * 100) / 100;

import { useAssignmentContext } from "@/context/AssignmentContext";

export function TargetAssignmentCard() {
  const {
    availableKPIs: kpis,
    existingAllocationsByKpiId,
    assignments,
    bulkAssignmentValues,
    setBulkAssignmentValue,
    targets, // We use this to lookup current values
    setTarget, // Replaces updateTargetAssignment
    directBasisAllocations,
    setDirectBasisAllocation,
  } = useAssignmentContext();

  // Helper: Get total assigned target for a KPI in current staged assignments
  const getTotalAssignedTarget = (kpiId: string) => {
    let total = 0;
    assignments
      .filter((assignment) => assignment.kpis.includes(kpiId))
      .forEach((assignment) => {
        const val = targets[kpiId]?.[assignment.assigneeId] || 0;
        total += val;
      });
    return roundValue(total);
  };

  const rateTargetsRepeat = (kpiId: string, expectedTarget: number) => {
    const assigned = assignments.filter((assignment) =>
      assignment.kpis.includes(kpiId),
    );
    return (
      assigned.length > 0 &&
      assigned.every((assignment) =>
        Math.abs(
          Number(targets[kpiId]?.[assignment.assigneeId] || 0) - expectedTarget,
        ) <= 0.01,
      )
    );
  };

  const allTargetsEntered = (kpiId: string) => {
    const assigned = assignments.filter((assignment) =>
      assignment.kpis.includes(kpiId),
    );
    return (
      assigned.length > 0 &&
      assigned.every(
        (assignment) => targets[kpiId]?.[assignment.assigneeId] != null,
      )
    );
  };

  const getAverageAssignedTarget = (kpiId: string) => {
    const assigned = assignments.filter((assignment) =>
      assignment.kpis.includes(kpiId),
    );
    if (assigned.length === 0) return 0;
    return (
      assigned.reduce(
        (sum, assignment) =>
          sum + Number(targets[kpiId]?.[assignment.assigneeId] || 0),
        0,
      ) / assigned.length
    );
  };

  const handleBulkAssignment = (kpiId: string, value: number) => {
    assignments.forEach((assignment) => {
      setTarget(kpiId, assignment.assigneeId, value);
    });
  };

  const getCascadeTarget = (kpi: Kpi, fullTarget: number): number => {
    if (kpi.unitType === "PERCENT" || kpi.unitType === "RATIO") {
      return fullTarget;
    }
    const mode = kpi.kpiMode || "AGGREGATED";
    if (mode !== "HYBRID") return fullTarget;

    const retentionPercent = Number(kpi.managerRetentionPercent || 0);
    const cascadePercent = Math.max(0, 100 - retentionPercent);
    return roundValue((fullTarget * cascadePercent) / 100);
  };

  const handleAutoSplit = (kpiId: string, targetToDistribute: number) => {
    const assigned = assignments.filter((assignment) =>
      assignment.kpis.includes(kpiId),
    );
    if (assigned.length === 0) return;
    const splitValue = roundValue(targetToDistribute / assigned.length);
    assigned.forEach((assignment, index) => {
      if (index === assigned.length - 1) {
        // Last one gets the remainder to ensure exact sum matching
        const valueForLast = roundValue(
          targetToDistribute - splitValue * (assigned.length - 1),
        );
        setTarget(kpiId, assignment.assigneeId, valueForLast);
      } else {
        setTarget(kpiId, assignment.assigneeId, splitValue);
      }
    });
  };

  const assignedKpiIds = [
    ...new Set(assignments.flatMap((assignment) => assignment.kpis)),
  ];

  if (assignedKpiIds.length === 0 || assignments.length === 0) {
    return null;
  }

  return (
    <Card className="bg-blue-50 border-blue-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-800">
          <Target className="w-5 h-5" />
          Target Assignment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {assignedKpiIds.map((kpiId) => {
          const kpi = kpis.find((k) => k.kpiId === kpiId);
          if (!kpi) return null;

          const assignmentStrategy = getTargetAssignmentStrategy(kpi);
          const isDirectBasis = assignmentStrategy === "DIRECT_BASIS_RATE";
          const requiresRepeatedRate =
            assignmentStrategy === "REPEATED_RATE" ||
            assignmentStrategy === "LINKED_BASIS_RATE" ||
            isDirectBasis;
          const isAdditive = assignmentStrategy === "ADDITIVE_SUM";
          const isScoreAverage = assignmentStrategy === "SCORE_AVERAGE";
          const usesChildSpecificTargets =
            assignmentStrategy === "FORMULA_RATIO" ||
            assignmentStrategy === "FORMULA_RESULT" ||
            assignmentStrategy === "WEIGHTED_COMPONENT_RATE";
          const kpiAssignments = assignments.filter((assignment) =>
            assignment.kpis.includes(kpiId),
          );
          if (kpiAssignments.length === 0) return null;
          const isCurrency = kpi.unitType === "CURRENCY";
          const formatTarget = (value: number) =>
            isCurrency ? value.toLocaleString() : value;
          const cleanName = kpi.name;
          const resolvedParentTarget = resolveAnnualKpiTarget(kpi);
          const fullParentTarget =
            kpi.unitType === "PERCENT" || kpi.unitType === "RATIO"
              ? resolvedParentTarget
              : roundValue(resolvedParentTarget);
          const parentTarget = getCascadeTarget(kpi, fullParentTarget);
          const unitLabel = getDetailedUnitLabel(kpi);
          const assignmentMethod =
            getTargetAssignmentDescription(assignmentStrategy);
          const assignedAverage = getAverageAssignedTarget(kpiId);
          const everyTargetEntered = allTargetsEntered(kpiId);
          const scoreAverageMatches =
            everyTargetEntered &&
            Math.abs(assignedAverage - parentTarget) <= 0.01;
          const mode = kpi.kpiMode || "AGGREGATED";
          const isHybrid = mode === "HYBRID";
          const managerRetentionPercent = Number(
            kpi.managerRetentionPercent || 0,
          );
          const cascadeBasisString = isHybrid
            ? multiplyBasisByPercent(
                kpi.directBasisValue || "0",
                Math.max(0, 100 - managerRetentionPercent),
              ) || "0"
            : kpi.directBasisValue || "0";
          const cascadeBasis = Number(cascadeBasisString);
          const assignedBasisValues = kpiAssignments.map(
            (assignment) =>
              directBasisAllocations[kpiId]?.[assignment.assigneeId] || "",
          );

          // Over-Allocation Prevention: Resolve previous session allocations
          const existing = existingAllocationsByKpiId[kpiId];
          const stagedAssigneeIds = new Set(
            kpiAssignments.map((a) => a.assigneeId),
          );
          const otherAllocations = (existing?.allocations || []).filter(
            (a) => !stagedAssigneeIds.has(a.assigneeId),
          );
          const previouslyAllocatedTarget = roundValue(
            otherAllocations.reduce((sum, a) => sum + a.targetValue, 0),
          );
          const previouslyAllocatedBasis = roundValue(
            otherAllocations.reduce(
              (sum, a) => sum + (Number(a.directBasisValue) || 0),
              0,
            ),
          );

          // Additive Quota Computations
          const stagedTarget = roundValue(getTotalAssignedTarget(kpiId));
          const totalOverallTarget = roundValue(
            previouslyAllocatedTarget + stagedTarget,
          );
          const remainingTargetQuota = roundValue(
            parentTarget - totalOverallTarget,
          );
          const isTargetOverAllocated = totalOverallTarget > parentTarget + 0.01;
          const isTargetFullyAllocated =
            Math.abs(totalOverallTarget - parentTarget) <= 0.01;

          // Direct Basis Quota Computations
          const basisUnitLabel =
            kpi.basisUnitType && kpi.basisUnitType !== "NUMBER"
              ? kpi.basisUnitType
              : "deliverables";
          const stagedBasis = roundValue(
            assignedBasisValues.reduce(
              (sum, value) => sum + (Number(value) || 0),
              0,
            ),
          );
          const totalOverallBasis = roundValue(
            previouslyAllocatedBasis + stagedBasis,
          );
          const remainingBasisQuota = roundValue(
            cascadeBasis - totalOverallBasis,
          );
          const isBasisOverAllocated = totalOverallBasis > cascadeBasis + 0.01;
          const isBasisReconciles =
            Math.abs(totalOverallBasis - cascadeBasis) <= 0.01;

          return (
            <div key={kpiId} className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-blue-900">{cleanName}</h4>
                  <p className="text-sm text-blue-700">
                    {assignmentMethod}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-blue-700">
                    {isHybrid ? "Cascade Target" : "Parent Target"}:{" "}
                    {formatTarget(parentTarget)} {unitLabel}
                  </p>
                  {isHybrid && (
                    <p className="text-xs text-blue-600">
                      {isDirectBasis
                        ? `${managerRetentionPercent}% of deliverables stay with manager; ${100 - managerRetentionPercent}% allocated to team.`
                        : `Full target ${formatTarget(fullParentTarget)} ${unitLabel}: ${managerRetentionPercent}% manager / ${100 - managerRetentionPercent}% cascade`}
                    </p>
                  )}
                  {isDirectBasis && (
                    <div className="mt-1 flex flex-col items-end gap-1">
                      <p
                        className={
                          isBasisReconciles
                            ? "text-sm text-green-600 font-medium"
                            : isBasisOverAllocated
                              ? "text-sm text-red-600 font-bold"
                              : "text-sm text-amber-700 font-medium"
                        }
                      >
                        Deliverables allocated: {formatBasisNumber(totalOverallBasis)} / {formatBasisNumber(cascadeBasis)} {basisUnitLabel}
                      </p>
                      {previouslyAllocatedBasis > 0 && (
                        <div className="text-xs text-slate-600 flex flex-wrap gap-1 justify-end">
                          <span>Prev: <strong>{formatBasisNumber(previouslyAllocatedBasis)}</strong></span>
                          <span>·</span>
                          <span>Staged: <strong>{formatBasisNumber(stagedBasis)}</strong></span>
                          <span>·</span>
                          <span>Rem: <strong className={remainingBasisQuota < 0 ? "text-red-600 font-bold" : "text-green-700 font-bold"}>{formatBasisNumber(remainingBasisQuota)}</strong></span>
                        </div>
                      )}
                    </div>
                  )}
                  {isAdditive && (
                    <div className="flex flex-col items-end gap-1">
                      <p
                        className={`text-sm ${
                          isTargetFullyAllocated
                            ? "text-green-600 font-medium"
                            : isTargetOverAllocated
                              ? "text-red-600 font-bold"
                              : "text-amber-700 font-medium"
                        }`}
                      >
                        Total Allocated: {formatTarget(totalOverallTarget)} / {formatTarget(parentTarget)} {unitLabel}
                      </p>
                      {previouslyAllocatedTarget > 0 && (
                        <div className="text-xs text-slate-600 flex flex-wrap gap-1 justify-end">
                          <span>Prev: <strong>{formatTarget(previouslyAllocatedTarget)}</strong></span>
                          <span>·</span>
                          <span>Staged: <strong>{formatTarget(stagedTarget)}</strong></span>
                          <span>·</span>
                          <span>Rem: <strong className={remainingTargetQuota < 0 ? "text-red-600 font-bold" : "text-green-700 font-bold"}>{formatTarget(remainingTargetQuota)}</strong></span>
                        </div>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleAutoSplit(
                            kpiId,
                            Math.max(0, parentTarget - previouslyAllocatedTarget),
                          )
                        }
                        className="text-xs mt-1"
                      >
                        Auto Split Remaining
                      </Button>
                    </div>
                  )}
                  {requiresRepeatedRate && (
                    <div className="flex flex-col items-end gap-1">
                      <p
                        className={`text-sm ${
                          rateTargetsRepeat(kpiId, parentTarget)
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        Rate target must repeat for every assignee: {parentTarget}{" "}
                        {unitLabel}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          type="number"
                          step="any"
                          placeholder={parentTarget.toString()}
                          value={bulkAssignmentValues[kpiId] || ""}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value) || 0;
                            setBulkAssignmentValue(kpiId, value);
                          }}
                          className="w-20 text-sm h-8"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const value =
                                bulkAssignmentValues[kpiId] || parentTarget;
                              handleBulkAssignment(kpiId, value);
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const value =
                              bulkAssignmentValues[kpiId] || parentTarget;
                            handleBulkAssignment(kpiId, value);
                          }}
                          className="h-8 text-xs"
                        >
                          Bulk Assign
                        </Button>
                      </div>
                    </div>
                  )}
                  {isScoreAverage && (
                    <p
                      className={`mt-1 text-sm ${
                        scoreAverageMatches ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      Child score average: {roundValue(assignedAverage)} / {parentTarget}{" "}
                      {unitLabel}
                    </p>
                  )}
                  {usesChildSpecificTargets && (
                    <p
                      className={`mt-1 text-sm ${
                        everyTargetEntered ? "text-green-600" : "text-amber-700"
                      }`}
                    >
                      {everyTargetEntered
                        ? "Every child has its own expected target."
                        : "Enter an expected target for every child."}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-3">
                {kpiAssignments.map((assignment) => {
                  const assigneeName = assignment.assigneeName;

                  const currentTarget =
                    targets[kpiId]?.[assignment.assigneeId] ?? null;

                  return (
                    <div
                      key={`${kpiId}-${assignment.assigneeId}`}
                      className="flex items-center justify-between gap-4 p-3 bg-white border border-blue-200 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{assigneeName}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {isDirectBasis && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 font-medium">Deliverables:</span>
                            <FormattedNumberInput
                              step="any"
                              value={
                                directBasisAllocations[kpiId]?.[
                                  assignment.assigneeId
                                ] || ""
                              }
                              currency={kpi.basisUnitType === "CURRENCY"}
                              onValueChange={(value) =>
                                setDirectBasisAllocation(
                                  kpiId,
                                  assignment.assigneeId,
                                  value,
                                )
                              }
                              className="w-24 h-9"
                              placeholder="0"
                            />
                            <span className="text-sm text-gray-600">
                              {basisUnitLabel}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 font-medium">Target:</span>
                          <FormattedNumberInput
                            step="any"
                            value={
                              currentTarget == null ? "" : currentTarget.toString()
                            }
                            currency={isCurrency}
                            onValueChange={(value) => {
                              const normalized = value.trim();
                              setTarget(
                                kpiId,
                                assignment.assigneeId,
                                normalized === "" ? null : Number(normalized),
                              );
                            }}
                            className="w-24 h-9"
                            placeholder={
                              isDirectBasis || requiresRepeatedRate
                                ? parentTarget.toString()
                                : isCurrency
                                  ? "283,654,789"
                                  : "0"
                            }
                          />
                          <span className="text-sm text-gray-600">
                            {unitLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {isAdditive && (
                <div
                  className={`flex items-center gap-2 p-2 rounded ${
                    isTargetOverAllocated
                      ? "bg-red-100 text-red-800 border border-red-300"
                      : isTargetFullyAllocated
                        ? "bg-green-100 text-green-800"
                        : "bg-amber-50 text-amber-800 border border-amber-200"
                  }`}
                >
                  {isTargetFullyAllocated ? (
                    <CheckCircle className="w-4 h-4 shrink-0 text-green-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  )}
                  <span className="text-sm">
                    {isTargetOverAllocated
                      ? `Over-allocated by ${formatTarget(roundValue(totalOverallTarget - parentTarget))} ${unitLabel}! Total allocation across all sessions cannot exceed ${formatTarget(parentTarget)} ${unitLabel}.`
                      : isTargetFullyAllocated
                        ? `Target allocation matches parent goal (${formatTarget(parentTarget)} ${unitLabel}).`
                        : `${formatTarget(remainingTargetQuota)} ${unitLabel} remaining to allocate to reach parent target of ${formatTarget(parentTarget)} ${unitLabel}.`}
                  </span>
                </div>
              )}

              {isDirectBasis && (
                <div
                  className={`flex items-center gap-2 p-2 rounded ${
                    isBasisOverAllocated
                      ? "bg-red-100 text-red-800 border border-red-300"
                      : isBasisReconciles
                        ? "bg-green-100 text-green-800"
                        : "bg-amber-50 text-amber-800 border border-amber-200"
                  }`}
                >
                  {isBasisReconciles ? (
                    <CheckCircle className="w-4 h-4 shrink-0 text-green-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  )}
                  <span className="text-sm">
                    {isBasisOverAllocated
                      ? `Deliverables over-allocated by ${formatBasisNumber(roundValue(totalOverallBasis - cascadeBasis))} ${basisUnitLabel}! Total deliverables cannot exceed ${formatBasisNumber(cascadeBasis)} ${basisUnitLabel}.`
                      : isBasisReconciles
                        ? `Allocated deliverables match the team target of ${formatBasisNumber(cascadeBasis)} ${basisUnitLabel}.`
                        : `${formatBasisNumber(remainingBasisQuota)} ${basisUnitLabel} remaining to allocate to reach team target of ${formatBasisNumber(cascadeBasis)} ${basisUnitLabel}.`}
                  </span>
                </div>
              )}

              {requiresRepeatedRate && !isDirectBasis && (
                <div
                  className={`flex items-center gap-2 p-2 rounded ${
                    rateTargetsRepeat(kpiId, parentTarget)
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {rateTargetsRepeat(kpiId, parentTarget) ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                  <span className="text-sm">
                    {rateTargetsRepeat(kpiId, parentTarget)
                      ? "The same rate target is assigned to every child."
                      : `Every assignee must receive the ${isHybrid ? "cascade" : "parent"} rate target ${parentTarget} ${unitLabel}; this manual rate is repeated, not split.`}
                  </span>
                </div>
              )}

              {isScoreAverage && (
                <div
                  className={`flex items-center gap-2 rounded p-2 ${
                    scoreAverageMatches
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {scoreAverageMatches ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  <span className="text-sm">
                    {scoreAverageMatches
                      ? "The simple average of all child score targets matches the parent target."
                      : `The simple average of all child score targets (${roundValue(assignedAverage)} ${unitLabel}) must equal ${parentTarget} ${unitLabel}.`}
                  </span>
                </div>
              )}

              {usesChildSpecificTargets && (
                <div
                  className={`flex items-center gap-2 rounded p-2 ${
                    everyTargetEntered
                      ? "bg-green-100 text-green-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {everyTargetEntered ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  <span className="text-sm">
                    {assignmentStrategy === "FORMULA_RATIO"
                      ? "Child targets may differ. Parent achievement is calculated as sum of child numerators divided by sum of child denominators; child rates are never averaged."
                      : assignmentStrategy === "WEIGHTED_COMPONENT_RATE"
                        ? "Child targets may differ. Parent achievement uses the configured weighting basis, not a simple average of child rates."
                        : "Child targets may differ. Each child must reconcile its target from the inherited approved formula and source plans."}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
