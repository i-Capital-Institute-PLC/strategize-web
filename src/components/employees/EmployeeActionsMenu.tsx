import { Button } from "@/components/ui/button";
import { tableIconButtonClassName } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Edit, Trash2, Building2, Eye, Award, ArrowUpDown, UserX, UserCheck } from "lucide-react";
import DeleteEmployeeDialog from "./DeleteEmployeeDialog";
import EditEmployeeDialog from "./EditEmployeeDialog";
import ViewEmployeeDialog from "./ViewEmployeeDialog";
import AddToDepartmentDialog from "./AddToDepartmentDialog";
import PromoteEmployeeDialog from "./PromoteEmployeeDialog";
import OffboardEmployeeDialog from "./OffboardEmployeeDialog";
import { Employee as GraphQLEmployee } from "@/types/graphql";
import { usePermissions } from "@/hooks/permissions/usePermissions";

const EmployeeActionsMenu = ({
  employeeName,
  employeeId,
  originalEmployee,
}: {
  employeeName?: string;
  employeeId?: string;
  originalEmployee?: GraphQLEmployee;
}) => {
  const { guards, role, can } = usePermissions();

  const canBeAddedToDepartment =
    originalEmployee?.role === "NORMAL" ||
    originalEmployee?.role === "COORDINATOR";

  const isHR = role === "HR";
  const canEdit = guards.isAdmin || guards.isSuperAdmin || isHR || can("employees:update_all");
  const canDelete = guards.isSuperAdmin;
  const canOffboard = isHR || guards.isAdmin || guards.isSuperAdmin;
  const isCurrentlyDisabled = originalEmployee?.status === "DISABLED";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={tableIconButtonClassName}
          aria-label="Employee actions"
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {originalEmployee && (
          <ViewEmployeeDialog employee={originalEmployee}>
            <DropdownMenuItem
              className="flex items-center gap-2 text-gray-700 hover:text-gray-900"
              onSelect={(e) => e.preventDefault()}
            >
              <Eye className="h-4 w-4" />
              View
            </DropdownMenuItem>
          </ViewEmployeeDialog>
        )}
        {originalEmployee && !isCurrentlyDisabled && (
          <PromoteEmployeeDialog employee={originalEmployee}>
            <DropdownMenuItem
              className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 font-medium"
              onSelect={(e) => e.preventDefault()}
            >
              <ArrowUpDown className="h-4 w-4" />
              Promotion / Demotion
            </DropdownMenuItem>
          </PromoteEmployeeDialog>
        )}
        {employeeId && employeeName && canBeAddedToDepartment && (
          <AddToDepartmentDialog
            employeeId={employeeId}
            employeeName={employeeName}
          >
            <DropdownMenuItem
              className="flex items-center gap-2 text-gray-700 hover:text-gray-900 hover:bg-blue-50"
              onSelect={(e) => e.preventDefault()}
            >
              <Building2 className="h-4 w-4" />
              Add to Department
            </DropdownMenuItem>
          </AddToDepartmentDialog>
        )}
        {originalEmployee && canEdit && (
          <EditEmployeeDialog employee={originalEmployee}>
            <DropdownMenuItem
              className="flex items-center gap-2 text-gray-700 hover:text-gray-900"
              onSelect={(e) => e.preventDefault()}
            >
              <Edit className="h-4 w-4" />
              Edit
            </DropdownMenuItem>
          </EditEmployeeDialog>
        )}
        {originalEmployee && canOffboard && (
          <OffboardEmployeeDialog
            employeeId={originalEmployee.employeeId}
            employeeName={originalEmployee.fullName}
            currentStatus={originalEmployee.status}
          >
            <DropdownMenuItem
              className={`flex items-center gap-2 font-medium ${
                isCurrentlyDisabled
                  ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                  : "text-amber-600 hover:text-amber-700 hover:bg-amber-50"
              }`}
              onSelect={(e) => e.preventDefault()}
            >
              {isCurrentlyDisabled ? (
                <>
                  <UserCheck className="h-4 w-4" />
                  Reactivate Employee
                </>
              ) : (
                <>
                  <UserX className="h-4 w-4" />
                  Offboard Employee
                </>
              )}
            </DropdownMenuItem>
          </OffboardEmployeeDialog>
        )}
        {canDelete && (
          <DeleteEmployeeDialog
            employeeName={employeeName}
            employeeId={employeeId}
          >
            <DropdownMenuItem
              className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
              onSelect={(e) => e.preventDefault()}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DeleteEmployeeDialog>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default EmployeeActionsMenu;
