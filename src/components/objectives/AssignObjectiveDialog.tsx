"use client";

import React, { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Users } from "lucide-react";
import { useQuery } from "@apollo/client";
import { GET_KPIS } from "@/lib/graphql/queries/kpis";
import {
  AssignmentProvider,
  type ExistingAllocation,
  type ExistingKpiAllocations,
} from "@/context/AssignmentContext";
import type { Objective, Kpi } from "@/types/graphql";
import { AssignObjectiveContent } from "./assign-dialog";

interface AssignObjectiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objective: Objective;
  kpis: Kpi[];
  onSuccess?: () => void;
}

export default function AssignObjectiveDialog({
  open,
  onOpenChange,
  objective,
  kpis,
  onSuccess,
}: AssignObjectiveDialogProps) {
  // If dialog is not open, don't render content to avoid unnecessary mounts/fetches
  if (!open) return null;

  const { data: allKpisData } = useQuery(GET_KPIS, {
    variables: {
      organizationId: (objective as any).organizationId,
      limit: 1000,
    },
    skip: !(objective as any)?.organizationId,
    fetchPolicy: "network-only",
  });

  const existingAllocations = useMemo(() => {
    const map: Record<string, ExistingKpiAllocations> = {};
    const items = allKpisData?.kpis?.items || [];
    for (const kpi of kpis) {
      const children = items.filter(
        (item: any) => item.parent?.kpiId === kpi.kpiId && !item.isDeleted,
      );
      const allocations: ExistingAllocation[] = children.map((c: any) => ({
        assigneeId: c.assigneeId,
        assigneeType: c.assigneeType,
        assigneeName: c.createdBy?.fullName || c.name || "Assigned",
        targetValue: Number(c.assignedTargetValue ?? c.targetValue ?? 0),
        directBasisValue: c.directBasisValue || undefined,
      }));
      map[kpi.kpiId] = {
        totalTarget: allocations.reduce((sum, a) => sum + a.targetValue, 0),
        totalBasis: allocations.reduce(
          (sum, a) => sum + (Number(a.directBasisValue) || 0),
          0,
        ),
        allocations,
      };
    }
    return map;
  }, [allKpisData, kpis]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Assign Objective
          </DialogTitle>
          <DialogDescription>
            Assign &quot;{objective.title || objective.name}&quot; to a{" "}
            {(() => {
              // Determine effective level from assigneeType (for cascaded objectives)
              const effectiveLevel = objective.assigneeType === "DIVISION" ? "DIVISION"
                : objective.assigneeType === "DEPARTMENT" ? "DEPARTMENT"
                : objective.type;
              if (effectiveLevel === "CORPORATE") return "division or department";
              if (effectiveLevel === "DIVISION") return "department or employee";
              return "employee";
            })()}{" "}
            with selected KPIs.
          </DialogDescription>
        </DialogHeader>

        <AssignmentProvider
          objective={objective}
          kpis={kpis}
          existingAllocations={existingAllocations}
        >
          <AssignObjectiveContent onSuccess={onSuccess} onClose={() => onOpenChange(false)} />
        </AssignmentProvider>
      </DialogContent>
    </Dialog>
  );
}
