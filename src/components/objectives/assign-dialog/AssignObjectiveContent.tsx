"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Building2, Users, CheckCircle } from "lucide-react";
import { AssigneeTab } from "./AssigneeTab";
import { KPISelectionCard } from "./KPISelectionCard";
import { TargetAssignmentCard } from "./TargetAssignmentCard";
import { AssignmentListCard } from "./AssignmentListCard";
import {
    useAssignmentContext,
    type AssigneeType,
} from "@/context/AssignmentContext";
import { useAssignmentActions } from "@/hooks/objectives/useAssignmentActions";
import { getTargetAssignmentStrategy } from "@/lib/objectives/targetAssignmentStrategy";
import { resolveAnnualKpiTarget } from "@/utils/quarterTargetAllocation";
import { multiplyBasisByPercent } from "@/utils/basisCalculation";

export function AssignObjectiveContent({ onSuccess, onClose }: { onSuccess?: () => void; onClose: () => void }) {
    const {
        sourceObjective: objective,
        assigneeType,
        setAssigneeType,
        availableKPIs,
        existingAllocationsByKpiId,
        assignments,
        targets,
        directBasisAllocations,
        removeAssignment
    } = useAssignmentContext();

    const { handleSubmit, isSubmitting } = useAssignmentActions({ onSuccess, onClose });

    // Determine the effective cascading level:
    // - For cascaded objectives (assigned from above), use assigneeType to determine what level we're at
    // - A CORPORATE objective assigned to a DIVISION should cascade to DEPARTMENT/PERSONNEL (not DIVISION again)
    // - Falls back to objective.type for top-level objectives
    const effectiveLevel = React.useMemo(() => {
        if (!objective) return "CORPORATE";
        // If this objective was assigned to a specific type, that's the current level
        if (objective.assigneeType === "DIVISION") return "DIVISION";
        if (objective.assigneeType === "DEPARTMENT") return "DEPARTMENT";
        if (objective.assigneeType === "UNIT") return "UNIT";
        if (objective.assigneeType === "EMPLOYEE") return "PERSONNEL";
        if (objective.assigneeType === "PERSONNEL") return "PERSONNEL";
        // Fall back to objective type
        return objective.type || "CORPORATE";
    }, [objective]);

    // Task 2.1: Detect over-allocation across previous sessions and current staged assignments
    const isOverAllocated = React.useMemo(() => {
        return availableKPIs.some((kpi) => {
            const strategy = getTargetAssignmentStrategy(kpi);
            const kpiAssignments = assignments.filter((a) => a.kpis.includes(kpi.kpiId));
            if (kpiAssignments.length === 0) return false;

            const existing = existingAllocationsByKpiId[kpi.kpiId];
            const stagedAssigneeIds = new Set(kpiAssignments.map((a) => a.assigneeId));
            const otherAllocations = (existing?.allocations || []).filter(
                (a) => !stagedAssigneeIds.has(a.assigneeId),
            );

            if (strategy === "ADDITIVE_SUM") {
                const prev = otherAllocations.reduce((sum, a) => sum + a.targetValue, 0);
                const staged = kpiAssignments.reduce(
                    (sum, a) => sum + (targets[kpi.kpiId]?.[a.assigneeId] || 0),
                    0,
                );
                const resolvedTarget = resolveAnnualKpiTarget(kpi);
                const retention = Number(kpi.managerRetentionPercent || 0);
                const maxTarget = kpi.kpiMode === "HYBRID"
                    ? Math.round((resolvedTarget * (100 - retention)) / 100 * 100) / 100
                    : resolvedTarget;
                return prev + staged > maxTarget + 0.01;
            }

            if (strategy === "DIRECT_BASIS_RATE") {
                const prev = otherAllocations.reduce(
                    (sum, a) => sum + (Number(a.directBasisValue) || 0),
                    0,
                );
                const staged = kpiAssignments.reduce(
                    (sum, a) => sum + (Number(directBasisAllocations[kpi.kpiId]?.[a.assigneeId]) || 0),
                    0,
                );
                const retention = Number(kpi.managerRetentionPercent || 0);
                const cascadeBasis = Number(
                    kpi.kpiMode === "HYBRID"
                        ? multiplyBasisByPercent(kpi.directBasisValue || "0", 100 - retention)
                        : kpi.directBasisValue || "0",
                );
                return prev + staged > cascadeBasis + 0.01;
            }

            return false;
        });
    }, [availableKPIs, assignments, targets, directBasisAllocations, existingAllocationsByKpiId]);

    return (
        <div className="space-y-6">
            {/* Smart Assignment Info */}
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div className="text-green-800 text-sm">
                    <strong>Smart Assignment:</strong> The system prevents duplicate objectives.
                </div>
            </div>

            <Tabs
                value={assigneeType}
                onValueChange={(value) => setAssigneeType(value as AssigneeType)}
            >
                <TabsList className="w-full [&>button]:flex-1">
                    {effectiveLevel === "CORPORATE" && (
                        <TabsTrigger value="DIVISION" className="flex items-center gap-2">
                            <Building2 className="w-4 h-4" />
                            Division
                        </TabsTrigger>
                    )}
                    {(effectiveLevel === "CORPORATE" || effectiveLevel === "DIVISION") && (
                        <TabsTrigger value="DEPARTMENT" className="flex items-center gap-2">
                            <Building2 className="w-4 h-4" />
                            Department
                        </TabsTrigger>
                    )}
                    {(effectiveLevel === "DIVISION" || effectiveLevel === "DEPARTMENT") && (
                        <TabsTrigger value="UNIT" className="flex items-center gap-2">
                            <Building2 className="w-4 h-4" />
                            Unit
                        </TabsTrigger>
                    )}
                    {(effectiveLevel === "DIVISION" || effectiveLevel === "DEPARTMENT" || effectiveLevel === "UNIT") && (
                        <TabsTrigger value="PERSONNEL" className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Employee
                        </TabsTrigger>
                    )}
                </TabsList>

                <TabsContent value="DIVISION">
                    <AssigneeTab type="DIVISION" />
                </TabsContent>
                <TabsContent value="DEPARTMENT">
                    <AssigneeTab type="DEPARTMENT" />
                </TabsContent>
                <TabsContent value="UNIT">
                    <AssigneeTab type="UNIT" />
                </TabsContent>
                <TabsContent value="PERSONNEL">
                    <AssigneeTab type="PERSONNEL" />
                </TabsContent>
            </Tabs>

            <Separator />

            <AddToAssignmentButton />

            <Separator />

            <KPISelectionCard />

            <TargetAssignmentCard />

            <AssignmentListCard
                assignments={assignments}
                kpis={availableKPIs}
                onRemoveAssignment={removeAssignment}
            />

            {/* Footer Actions */}
            <div className="space-y-2 pt-4 border-t">
                {isOverAllocated && (
                    <p className="text-xs text-red-600 font-semibold text-right">
                        Cannot submit: one or more KPI targets exceed the total available cascade quota.
                    </p>
                )}
                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={assignments.length === 0 || isSubmitting || isOverAllocated}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                    >
                        {isSubmitting ? "Assigning..." : "Submit Assignments"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// Sub-component to handle the "Add to List" logic which requires data access
function AddToAssignmentButton() {
    const {
        selectedAssignees,
        selectedKPIs,
        addAssignment,
        clearSelectedAssignees,
    } = useAssignmentContext();

    const handleAdd = () => {
        selectedAssignees.forEach(assignee => {
            addAssignment({
                assigneeId: assignee.id,
                assigneeType: assignee.type,
                assigneeName: assignee.name,
                kpis: selectedKPIs
            });
        });
        clearSelectedAssignees();
    };

    if (selectedAssignees.length === 0 || selectedKPIs.length === 0) return null;

    return (
        <div className="space-y-2 text-center">
            <Button
                onClick={handleAdd}
                className="bg-green-600 hover:bg-green-700 text-white"
            >
                Add {selectedAssignees.length} to Assignment List
            </Button>
        </div>
    );
}
