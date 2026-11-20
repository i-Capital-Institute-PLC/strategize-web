"use client";
import React, { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery } from "@apollo/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Building2, Layers } from "lucide-react";
import DivisionDetailsTable from "@/components/divisions/DivisionDetailsTable";
import DivisionPagination from "@/components/divisions/DivisionPagination";
import AddDepartmentDialog from "@/components/departments/AddDepartmentDialog";
import DivisionHoldingPoolManager from "@/components/divisions/DivisionHoldingPoolManager";
import { GET_DIVISION_BASIC } from "@/lib/graphql/queries/divisions";
import { GET_DEPARTMENTS } from "@/lib/graphql/queries/departments";
import { GET_EMPLOYEES } from "@/lib/graphql/queries/employees";
import { useDepartmentMutations } from "@/hooks/departments/useDepartmentMutations";
import { usePermissions } from "@/hooks/permissions/usePermissions";
import { useAuthStore } from "@/stores";
import type {
  GetDivisionResponse,
  DivisionQueryVariables,
  PaginatedDepartments,
  PaginatedEmployees,
  Department as GraphQLDepartment,
  Employee,
} from "@/types/graphql";

const DivisionDetailsPage = () => {
  const router = useRouter();
  const params = useParams();
  const divisionId = params.divisionId as string;
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [activeMainTab, setActiveMainTab] = useState<"departments" | "holding-pool">("departments");

  // Get permissions to check if user can access employees
  const { guards, scope } = usePermissions();
  const user = useAuthStore((state) => state.user);
  const canAccessEmployees = guards.isAdmin || guards.isSuperAdmin;

  // Query to get basic division info (without departments to avoid manager constraint)
  const {
    data: divisionData,
    loading: divisionLoading,
    error: divisionError,
  } = useQuery<GetDivisionResponse, DivisionQueryVariables>(
    GET_DIVISION_BASIC,
    {
      variables: { divisionId },
      fetchPolicy: "cache-first",
      nextFetchPolicy: "cache-first",
    }
  );

  const isGlobalAdmin = guards.isAdmin || guards.isSuperAdmin;
  const isMyDivision =
    isGlobalAdmin ||
    (guards.isDirector &&
      (divisionData?.division?.head?.employeeId === user?.employeeId ||
        (scope?.managedDivisionIds && scope.managedDivisionIds.includes(divisionId)) ||
        (user?.fullName && divisionData?.division?.head?.fullName === user.fullName)));

  // Query to get departments for this division
  const {
    data: departmentsData,
    loading: departmentsLoading,
    refetch: refetchDepartments,
  } = useQuery<{
    departments: PaginatedDepartments;
  }>(GET_DEPARTMENTS, {
    variables: {
      page: currentPage,
      limit: 50,
      divisionId: divisionId,
    },
    fetchPolicy: "cache-and-network",
    nextFetchPolicy: "cache-and-network",
  });

  // Query to get employees for manager selection
  // Only fetch if user has admin access (backend requires ADMIN or SUPER_ADMIN)
  const { data: employeesData } = useQuery<{ employees: PaginatedEmployees }>(
    GET_EMPLOYEES,
    {
      variables: { page: 1, limit: 100 },
      skip: !canAccessEmployees,
    }
  );

  // Department mutations
  const { createDepartment, loading: mutationLoading } =
    useDepartmentMutations();

  // Add Department Dialog state
  const [isAddDepartmentOpen, setIsAddDepartmentOpen] = useState(false);
  const [departmentName, setDepartmentName] = useState("");
  const [departmentManager, setDepartmentManager] = useState("");
  const [departmentMembers, setDepartmentMembers] = useState<string[]>([]);

  // Get division name
  const divisionName = divisionData?.division?.name || "Division";

  // Get managers and employees
  const managers =
    employeesData?.employees?.items?.filter(
      (emp: Employee) => emp.role === "MANAGER"
    ) || [];

  const allEmployees =
    employeesData?.employees?.items?.filter(
      (emp: Employee) => emp.role === "NORMAL"
    ) || [];

  // Transform departments for table (filter by division)
  const departments =
    departmentsData?.departments?.items
      ?.filter(
        (dept: GraphQLDepartment) =>
          dept.division?.divisionId === divisionId && !dept.isDeleted
      )
      ?.map((dept: GraphQLDepartment) => ({
        id: dept.departmentId,
        departmentName: dept.name,
        createdBy: "System",
        createdOn: new Date(dept.createdAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        managedBy: dept.head?.fullName || "Unassigned",
        managerId: dept.head?.employeeId || null,
        managerEmail: dept.head?.email || null,
        division: divisionName,
        members: dept.employees?.length || 0,
      })) || [];

  const totalItems = departmentsData?.departments?.meta?.totalItems || 0;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const loading = divisionLoading || departmentsLoading;

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleAddDepartment = () => {
    setIsAddDepartmentOpen(true);
  };

  const handleSubmitDepartment = async () => {
    if (!departmentName.trim()) {
      return;
    }

    try {
      await createDepartment({
        input: {
          name: departmentName.trim(),
          divisionId: divisionId,
          headUserId: departmentManager || undefined,
        },
        employeeIds: departmentMembers,
      });

      // Reset form
      setDepartmentName("");
      setDepartmentManager("");
      setDepartmentMembers([]);
      setIsAddDepartmentOpen(false);

      // Refresh departments list
      refetchDepartments();
    } catch (error) {
      console.error("Failed to create department:", error);
    }
  };

  // Error state
  if (divisionError) {
    return (
      <div className="flex flex-col gap-6 px-2 md:px-6 py-8">
        <div className="p-8 text-center">
          <p className="text-red-600">
            Error loading division: {String(divisionError)}
          </p>
          <Button onClick={() => router.back()} className="mt-4">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-2 md:px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <button
          onClick={() => router.push("/dashboard/divisions")}
          className="hover:text-gray-900"
        >
          Divisions
        </button>
        <span>&gt;</span>
        <span className="text-gray-900">Division Details</span>
      </div>

      {/* Header and Back Button */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-4xl text-[#3F3F46] dark:text-gray-100 font-bold tracking-tight">
                {divisionName}
              </h1>
              {!isMyDivision && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                  Read-Only View
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Division Management, Quotas & Department Allocation
            </p>
          </div>
        </div>
        {activeMainTab === "departments" && isMyDivision && (
          <Button onClick={handleAddDepartment} disabled={loading}>
            <Plus width={16} height={16} />
            Add Department
          </Button>
        )}
      </div>

      {/* Main View Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 space-x-6">
        <button
          type="button"
          onClick={() => setActiveMainTab("departments")}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeMainTab === "departments"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          <Building2 className="w-4 h-4" />
          Departments
        </button>
        <button
          type="button"
          onClick={() => setActiveMainTab("holding-pool")}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeMainTab === "holding-pool"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          <Layers className="w-4 h-4" />
          Holding Pool
        </button>
      </div>

      {/* Tab Content */}
      {activeMainTab === "departments" ? (
        <>
          {/* Table */}
          <div className="dark:bg-muted rounded-lg border overflow-x-auto custom-scrollbar">
            <DivisionDetailsTable
              departments={departments}
              loading={loading}
              error={divisionError ? String(divisionError) : undefined}
              managers={managers.map((m) => ({
                employeeId: m.employeeId,
                fullName: m.fullName,
              }))}
              divisions={[{ divisionId: divisionId, name: divisionName }]}
              allMembers={allEmployees.map((e) => ({
                employeeId: e.employeeId,
                fullName: e.fullName,
              }))}
              onEditSuccess={() => refetchDepartments()}
              onDeleteSuccess={() => refetchDepartments()}
              onDepartManager={() => setActiveMainTab("holding-pool")}
              readOnly={!isMyDivision}
            />
          </div>

          {/* Pagination */}
          <DivisionPagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={handlePageChange}
            loading={loading}
          />
        </>
      ) : (
        <DivisionHoldingPoolManager
          divisionId={divisionId}
          divisionName={divisionName}
          departments={departments}
          readOnly={!isMyDivision}
        />
      )}

      {/* Add Department Dialog */}
      <AddDepartmentDialog
        open={isAddDepartmentOpen}
        onOpenChange={setIsAddDepartmentOpen}
        departmentName={departmentName}
        setDepartmentName={setDepartmentName}
        departmentManager={departmentManager}
        setDepartmentManager={setDepartmentManager}
        selectedDivision={divisionId}
        setSelectedDivision={() => { }} // Not needed for this context
        departmentMembers={departmentMembers}
        setDepartmentMembers={setDepartmentMembers}
        managers={managers.map((m) => ({
          employeeId: m.employeeId,
          fullName: m.fullName,
        }))}
        divisions={[{ divisionId: divisionId, name: divisionName }]}
        allMembers={allEmployees.map((e) => ({
          employeeId: e.employeeId,
          fullName: e.fullName,
        }))}
        onSubmit={handleSubmitDepartment}
        loading={mutationLoading.create}
      />
    </div>
  );
};

export default DivisionDetailsPage;
