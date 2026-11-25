"use client";
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserX, UserCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useEmployeeMutations } from "@/hooks/employees/useEmployeeMutations";
import { parseGraphQLError } from "@/utils/errorParsing";
import { EmployeeStatus } from "@/types/graphql";

interface OffboardEmployeeDialogProps {
  children: React.ReactNode;
  employeeName?: string;
  employeeId?: string;
  currentStatus?: EmployeeStatus;
  onSuccess?: () => void;
}

export const OffboardEmployeeDialog: React.FC<OffboardEmployeeDialogProps> = ({
  children,
  employeeName = "this employee",
  employeeId,
  currentStatus = "ACTIVE",
  onSuccess,
}) => {
  const [open, setOpen] = useState(false);
  const { updateEmployee, updateLoading } = useEmployeeMutations();

  const isCurrentlyDisabled = currentStatus === "DISABLED";
  const targetStatus: EmployeeStatus = isCurrentlyDisabled ? "ACTIVE" : "DISABLED";

  const handleToggleStatus = async () => {
    if (!employeeId) {
      toast.error("Error", {
        description: "Employee ID is missing.",
      });
      return;
    }

    const result = await updateEmployee({
      employeeId,
      status: targetStatus,
    });

    if (result.success) {
      toast.success(
        isCurrentlyDisabled
          ? "Employee reactivated successfully"
          : "Employee offboarded successfully",
        {
          description: isCurrentlyDisabled
            ? `${employeeName} is now active.`
            : `${employeeName} has been offboarded and set to read-only archive mode.`,
        }
      );
      setOpen(false);
      onSuccess?.();
    } else {
      const errorInfo = parseGraphQLError(result.error, "employee");
      toast.error(errorInfo.title, {
        description: errorInfo.description,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-[320px] sm:max-w-[480px] mx-auto p-6 sm:p-8">
        <DialogHeader className="text-center sm:text-left">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-full ${
                isCurrentlyDisabled
                  ? "bg-green-100 text-green-600"
                  : "bg-amber-100 text-amber-600"
              }`}
            >
              {isCurrentlyDisabled ? (
                <UserCheck className="h-6 w-6" />
              ) : (
                <UserX className="h-6 w-6" />
              )}
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold text-gray-900">
                {isCurrentlyDisabled
                  ? "Reactivate Employee"
                  : "Offboard Employee"}
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-500 mt-1">
                {isCurrentlyDisabled
                  ? `Restore ${employeeName}'s active status and system access.`
                  : `Deactivate ${employeeName}'s credentials and transition account to read-only archive mode.`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-gray-600">
            {isCurrentlyDisabled ? (
              <>
                Reactivating <strong>{employeeName}</strong> will restore their
                full login access and active status in departmental and
                organizational workflows.
              </>
            ) : (
              <>
                Offboarding <strong>{employeeName}</strong> will disable their
                credentials and block all write operations. All historical
                KPIs, 360° evaluations, and logbooks are permanently preserved in
                read-only archive mode.
              </>
            )}
          </p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={updateLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={isCurrentlyDisabled ? "default" : "destructive"}
            className={
              isCurrentlyDisabled
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-amber-600 hover:bg-amber-700 text-white"
            }
            onClick={handleToggleStatus}
            disabled={updateLoading}
          >
            {updateLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isCurrentlyDisabled ? "Reactivating..." : "Offboarding..."}
              </>
            ) : isCurrentlyDisabled ? (
              "Confirm Reactivation"
            ) : (
              "Confirm Offboard"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OffboardEmployeeDialog;
