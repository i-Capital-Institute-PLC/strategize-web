"use client";

import { useApolloClient, useMutation } from "@apollo/client";
import { useState } from "react";
import { toast } from "sonner";
import {
  useAssignmentContext,
  type AssigneeType,
} from "@/context/AssignmentContext";
import { CASCADE_OBJECTIVE_V2 } from "@/lib/graphql/mutations/objectives";
import { GET_OBJECTIVES } from "@/lib/graphql/queries/objectives";
import { GET_KPIS } from "@/lib/graphql/queries/kpis";
import { GET_ME } from "@/lib/graphql/queries/auth";
import { appLogger } from "@/lib/logger";
import {
  buildAssignedQuarterTargets,
  resolveAnnualKpiTarget,
} from "@/utils/quarterTargetAllocation";
import {
  allocateBasisQuarters,
  buildDirectBasisTargets,
  decimalValuesEqualTotal,
  multiplyBasisByPercent,
  splitBasisEvenly,
} from "@/utils/basisCalculation";
import type { CascadeObjectiveV2MutationVariables } from "@/types/graphql";

interface CascadeObjectiveV2Data {
  cascadeObjectiveV2: {
    parentObjective: {
      objectiveId: string;
      cascadeStatus: string;
    };
    children: Array<{
      objectiveId: string;
      assigneeType: AssigneeType;
      assigneeId: string;
    }>;
    createdCount: number;
    updatedCount: number;
  };
}

interface StagedRecipient {
  assigneeType: AssigneeType;
  assigneeId: string;
  kpiIds: Set<string>;
}

function recipientKey(assigneeType: AssigneeType, assigneeId: string): string {
  return `${assigneeType}:${assigneeId}`;
}

export function useAssignmentActions({
  onSuccess,
  onClose,
}: {
  onSuccess?: () => void;
  onClose: () => void;
}) {
  const client = useApolloClient();
  const {
    assignments,
    sourceObjective,
    availableKPIs,
    targets,
    directBasisAllocations,
    existingAllocationsByKpiId,
    clearAssignments,
    clearSelectedAssignees,
  } = useAssignmentContext();
  const [cascadeObjectiveV2] = useMutation<
    CascadeObjectiveV2Data,
    CascadeObjectiveV2MutationVariables
  >(CASCADE_OBJECTIVE_V2);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (assignments.length === 0 || !sourceObjective) return;
    setIsSubmitting(true);

    try {
      const recipientsByKey = new Map<string, StagedRecipient>();
      for (const assignment of assignments) {
        const key = recipientKey(assignment.assigneeType, assignment.assigneeId);
        const recipient = recipientsByKey.get(key) ?? {
          assigneeType: assignment.assigneeType,
          assigneeId: assignment.assigneeId,
          kpiIds: new Set<string>(),
        };
        assignment.kpis.forEach((kpiId) => recipient.kpiIds.add(kpiId));
        recipientsByKey.set(key, recipient);
      }
      const recipients = [...recipientsByKey.values()];

      for (const sourceKpi of availableKPIs) {
        if (sourceKpi.calculationBasisSource !== "LINKED_KPI") continue;
        const linkedBasisKpiId = sourceKpi.weightingBasisKpiId;
        if (!linkedBasisKpiId) {
          throw new Error(
            `"${sourceKpi.name}" has no linked approved denominator KPI configured.`,
          );
        }
        for (const recipient of recipients.filter((candidate) =>
          candidate.kpiIds.has(sourceKpi.kpiId),
        )) {
          if (!recipient.kpiIds.has(linkedBasisKpiId)) {
            const linkedName = availableKPIs.find(
              (candidate) => candidate.kpiId === linkedBasisKpiId,
            )?.name;
            throw new Error(
              `Cascade "${linkedName || "the linked denominator KPI"}" with "${sourceKpi.name}" for every assignee.`,
            );
          }
        }
      }

      // Multi-session Quota Validation: Direct-basis deliverables
      for (const sourceKpi of availableKPIs) {
        if (sourceKpi.calculationBasisSource !== "DIRECT_VALUE") continue;
        const kpiRecipients = recipients.filter((recipient) =>
          recipient.kpiIds.has(sourceKpi.kpiId),
        );
        if (kpiRecipients.length === 0) continue;
        const retention =
          sourceKpi.kpiMode === "HYBRID"
            ? Number(sourceKpi.managerRetentionPercent || 0)
            : 0;
        const cascadeBasis =
          multiplyBasisByPercent(
            sourceKpi.directBasisValue || "0",
            100 - retention,
          ) || "0";
        const maxBasis = Number(cascadeBasis);

        const stagedAssigneeIds = new Set(kpiRecipients.map((r) => r.assigneeId));
        const otherAllocations = (
          existingAllocationsByKpiId?.[sourceKpi.kpiId]?.allocations || []
        ).filter((a) => !stagedAssigneeIds.has(a.assigneeId));
        const previouslyAllocatedBasis = otherAllocations.reduce(
          (sum, a) => sum + (Number(a.directBasisValue) || 0),
          0,
        );
        const stagedBasis = kpiRecipients.reduce(
          (sum, { assigneeId }) =>
            sum + (Number(directBasisAllocations[sourceKpi.kpiId]?.[assigneeId]) || 0),
          0,
        );
        const totalOverallBasis = Math.round((previouslyAllocatedBasis + stagedBasis) * 100) / 100;

        if (totalOverallBasis > maxBasis + 0.01) {
          throw new Error(
            `Total deliverables allocated across all sessions (${totalOverallBasis.toLocaleString()}) cannot exceed the parent quota (${maxBasis.toLocaleString()}) for "${sourceKpi.name}".`,
          );
        }
      }

      // Multi-session Quota Validation: Additive KPIs
      for (const sourceKpi of availableKPIs) {
        const isAdditive =
          sourceKpi.unitType !== "PERCENT" &&
          sourceKpi.unitType !== "RATIO" &&
          (sourceKpi.aggregationMethod === "SUM" || !sourceKpi.aggregationMethod);
        if (!isAdditive) continue;

        const kpiRecipients = recipients.filter((recipient) =>
          recipient.kpiIds.has(sourceKpi.kpiId),
        );
        if (kpiRecipients.length === 0) continue;

        const resolvedParentTarget = resolveAnnualKpiTarget(sourceKpi);
        const retention =
          sourceKpi.kpiMode === "HYBRID"
            ? Number(sourceKpi.managerRetentionPercent || 0)
            : 0;
        const cascadeTarget =
          sourceKpi.kpiMode === "HYBRID"
            ? Math.round(((resolvedParentTarget * Math.max(0, 100 - retention)) / 100) * 100) / 100
            : resolvedParentTarget;

        const stagedAssigneeIds = new Set(kpiRecipients.map((r) => r.assigneeId));
        const otherAllocations = (
          existingAllocationsByKpiId?.[sourceKpi.kpiId]?.allocations || []
        ).filter((a) => !stagedAssigneeIds.has(a.assigneeId));
        const previouslyAllocatedTarget = otherAllocations.reduce(
          (sum, a) => sum + (Number(a.targetValue) || 0),
          0,
        );
        const stagedTarget = kpiRecipients.reduce(
          (sum, { assigneeId }) =>
            sum + (Number(targets[sourceKpi.kpiId]?.[assigneeId]) || 0),
          0,
        );
        const totalOverallTarget = Math.round((previouslyAllocatedTarget + stagedTarget) * 100) / 100;

        if (totalOverallTarget > cascadeTarget + 0.01) {
          throw new Error(
            `Total target allocated across all sessions (${totalOverallTarget.toLocaleString()}) cannot exceed the parent goal target (${cascadeTarget.toLocaleString()}) for "${sourceKpi.name}".`,
          );
        }
      }

      const { data } = await client.query({ query: GET_ME });
      const assignerId = data?.me?.employeeId;
      if (!assignerId) throw new Error("Could not identify current user ID");

      const basisTargetsByAllocation = new Map<
        string,
        Array<{ timeline: string; value: string }>
      >();
      for (const sourceKpi of availableKPIs) {
        if (sourceKpi.calculationBasisSource !== "DIRECT_VALUE") continue;
        const kpiRecipients = recipients.filter((recipient) =>
          recipient.kpiIds.has(sourceKpi.kpiId),
        );
        if (kpiRecipients.length === 0) continue;

        const parentQuarterTargets = (sourceKpi.directBasisTargets || [])
          .filter((target) => /-Q[1-4]$/i.test(target.timeline))
          .sort((left, right) => left.timeline.localeCompare(right.timeline));
        if (parentQuarterTargets.length !== 4) continue;

        const cascadePercent =
          sourceKpi.kpiMode === "HYBRID"
            ? 100 - Number(sourceKpi.managerRetentionPercent || 0)
            : 100;
        const quarterAllocations = allocateBasisQuarters(
          kpiRecipients.map(
            ({ assigneeId }) =>
              directBasisAllocations[sourceKpi.kpiId]?.[assigneeId] || "",
          ),
          parentQuarterTargets.map(
            (target) =>
              multiplyBasisByPercent(target.value, cascadePercent) || "",
          ),
        );
        if (quarterAllocations) {
          kpiRecipients.forEach((recipient, index) => {
            const quarters = quarterAllocations[index];
            basisTargetsByAllocation.set(
              `${recipientKey(recipient.assigneeType, recipient.assigneeId)}:${sourceKpi.kpiId}`,
              parentQuarterTargets.map((target, quarterIndex) => ({
                timeline: target.timeline,
                value: quarters[`q${quarterIndex + 1}` as keyof typeof quarters],
              })),
            );
          });
        }
      }

      const recipientInputs = recipients.map((recipient) => ({
        assigneeType: recipient.assigneeType,
        assigneeId: recipient.assigneeId,
        kpiAllocations: [...recipient.kpiIds].map((kpiId) => {
          const sourceKpi = availableKPIs.find((kpi) => kpi.kpiId === kpiId);
          if (!sourceKpi) {
            throw new Error(`KPI ${kpiId} is no longer available`);
          }
          const isDirectBasis =
            sourceKpi.calculationBasisSource === "DIRECT_VALUE";
          const targetValue = isDirectBasis
            ? resolveAnnualKpiTarget(sourceKpi)
            : targets[kpiId]?.[recipient.assigneeId];
          if (targetValue == null) {
            throw new Error(`Enter a target for "${sourceKpi.name}"`);
          }
          const directBasisValue = isDirectBasis
            ? directBasisAllocations[kpiId]?.[recipient.assigneeId] || ""
            : undefined;
          const timeline =
            sourceKpi.targets?.find((target) => !target.timeline.includes("-Q"))
              ?.timeline ||
            sourceKpi.directBasisTargets?.find(
              (target) => !target.timeline.includes("-Q"),
            )?.timeline ||
            sourceObjective.strategicPeriod?.startDate?.slice(0, 4) ||
            "2026";
          return {
            kpiId,
            targetValue,
            targets: buildAssignedQuarterTargets(
              sourceKpi,
              targetValue,
              timeline,
            ),
            directBasisValue,
            directBasisTargets:
              isDirectBasis && directBasisValue
                ? (basisTargetsByAllocation.get(
                    `${recipientKey(recipient.assigneeType, recipient.assigneeId)}:${kpiId}`,
                  ) ??
                  buildDirectBasisTargets(
                    timeline,
                    splitBasisEvenly(directBasisValue),
                  ))
                : undefined,
          };
        }),
      }));

      const { data: cascadeData } = await cascadeObjectiveV2({
        variables: {
          input: {
            objectiveId: sourceObjective.objectiveId,
            assignerId,
            recipients: recipientInputs,
          },
        },
        refetchQueries: [
          { query: GET_OBJECTIVES, variables: { page: 1, limit: 1000 } },
          { query: GET_KPIS, variables: { page: 1, limit: 1000 } },
        ],
        awaitRefetchQueries: true,
      });

      const result = cascadeData?.cascadeObjectiveV2;
      if (!result) {
        throw new Error("The server did not return a cascade result.");
      }
      const confirmedCount = result.createdCount + result.updatedCount;
      if (
        confirmedCount !== recipients.length ||
        result.children.length !== recipients.length
      ) {
        throw new Error(
          `The server confirmed ${confirmedCount} of ${recipients.length} cascades. No partial cascade was committed; refresh and try again.`,
        );
      }

      const counts = recipients.reduce<Record<AssigneeType, number>>(
        (totals, recipient) => {
          totals[recipient.assigneeType] = (totals[recipient.assigneeType] || 0) + 1;
          return totals;
        },
        { DIVISION: 0, DEPARTMENT: 0, UNIT: 0, PERSONNEL: 0 },
      );
      const cascadeSummary = (
        [
          ["DIVISION", "division"],
          ["DEPARTMENT", "department"],
          ["UNIT", "unit"],
          ["PERSONNEL", "employee"],
        ] as const
      )
        .filter(([type]) => counts[type] > 0)
        .map(([type, label]) =>
          `${counts[type]} ${label}${counts[type] === 1 ? "" : "s"}`,
        )
        .join(", ");

      toast.success(`Cascaded successfully to ${confirmedCount} assignees`, {
        description: `${cascadeSummary} created or updated atomically.`,
      });
      clearAssignments();
      clearSelectedAssignees();
      onSuccess?.();
      onClose();
    } catch (error: unknown) {
      appLogger.error("Assignment failed", error);
      toast.error("Assignment failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return { handleSubmit, isSubmitting };
}
