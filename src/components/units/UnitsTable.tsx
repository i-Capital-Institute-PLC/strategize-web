"use client";

import { useMemo, useState } from "react";
import React from "react";
import { getOrganizationId } from "@/lib/constants/organization";
import { type Unit, useUnitMutations } from "@/hooks/units/useUnits";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery } from "@apollo/client";
import { GET_DIVISIONS } from "@/lib/graphql/queries/divisions";
import { GET_DEPARTMENTS } from "@/lib/graphql/queries/departments";
import { GET_EMPLOYEES } from "@/lib/graphql/queries/employees";
import { MoreHorizontal, Pencil, Trash2, Eye, Users, Plus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import UserAvatar from "@/components/UserAvatar";
import { useAuthStore } from "@/stores";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { MultiSelect } from "@/components/ui/multi-select";
import { SortableFilterableHeader } from "@/components/ui/sortable-filterable-header";
import { useTableColumnControls } from "@/hooks/table/useTableColumnControls";

interface UnitsTableProps {
  units: Unit[];
  loading: boolean;
  title?: string;
  description?: string;
}

export default function UnitsTable({
  units,
  loading,
  title = "Units",
  description = "Manage organizational units, specialized task forces, and assign unit leads and members",
}: UnitsTableProps) {
  const router = useRouter();
  const { createUnit, updateUnit, removeUnit, loading: mutLoading } = useUnitMutations();

  const [showCreate, setShowCreate] = useState(false);
  const [editUnit, setEditUnit] = useState<Unit | null>(null);
  const [deleteUnit, setDeleteUnit] = useState<Unit | null>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    divisionId: "none",
    departmentId: "none",
    unitLeadUserId: "none",
    memberIds: [] as string[],
  });

  // Fetch divisions and departments for dropdowns
  const { data: divsData } = useQuery(GET_DIVISIONS, {
    variables: { page: 1, limit: 100 },
  });
  const divisions = divsData?.divisions?.items || [];

  const { data: deptsData } = useQuery(GET_DEPARTMENTS, {
    variables: { page: 1, limit: 100 },
  });
  const departments = deptsData?.departments?.items || [];

  // Fetch employees for unit lead and members dropdown
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const { data: empsData } = useQuery(GET_EMPLOYEES, {
    variables: { 
      page: 1, 
      limit: 200,
      ...(isAdmin ? {} : { departmentId: user?.department?.departmentId })
    },
  });
  const employees = empsData?.employees?.items || [];

  const resetForm = () =>
    setForm({
      name: "",
      description: "",
      divisionId: "none",
      departmentId: "none",
      unitLeadUserId: "none",
      memberIds: [],
    });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    try {
      const isDivision = form.divisionId && form.divisionId !== "none";
      const isDepartment = form.departmentId && form.departmentId !== "none";
      await createUnit({
        name: form.name,
        description: form.description || undefined,
        organizationId: getOrganizationId(),
        divisionId: isDivision && !isDepartment ? form.divisionId : undefined,
        departmentId: isDepartment && !isDivision ? form.departmentId : undefined,
        unitLeadUserId: form.unitLeadUserId && form.unitLeadUserId !== "none" ? form.unitLeadUserId : undefined,
        memberIds: form.memberIds.length > 0 ? form.memberIds : undefined,
      });
      resetForm();
      setShowCreate(false);
    } catch {
      /* handled */
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUnit || !form.name) return;
    try {
      const isDivision = form.divisionId && form.divisionId !== "none";
      const isDepartment = form.departmentId && form.departmentId !== "none";
      await updateUnit({
        unitId: editUnit.unitId,
        name: form.name,
        description: form.description || undefined,
        divisionId: isDivision && !isDepartment ? form.divisionId : undefined,
        departmentId: isDepartment && !isDivision ? form.departmentId : undefined,
        unitLeadUserId: form.unitLeadUserId && form.unitLeadUserId !== "none" ? form.unitLeadUserId : undefined,
        memberIds: form.memberIds,
        organizationId: getOrganizationId(),
      });
      resetForm();
      setEditUnit(null);
    } catch {
      /* handled */
    }
  };

  const handleDelete = async () => {
    if (!deleteUnit) return;
    try {
      await removeUnit(deleteUnit.unitId);
      setDeleteUnit(null);
    } catch {
      /* handled */
    }
  };

  const openEdit = (unit: Unit) => {
    const hasDept = Boolean(unit.department?.departmentId);
    const hasDiv = Boolean(unit.division?.divisionId);
    const isDivisionUnit = hasDiv && !hasDept;

    setForm({
      name: unit.name,
      description: unit.description || "",
      divisionId: isDivisionUnit ? (unit.division?.divisionId || "none") : "none",
      departmentId: !isDivisionUnit ? (unit.department?.departmentId || "none") : "none",
      unitLeadUserId: unit.unitLead?.employeeId || "none",
      memberIds: unit.members?.map((m) => m.employeeId) || [],
    });
    setEditUnit(unit);
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const columns = useMemo(
    () => [
      { id: "name", accessor: (unit: Unit) => unit.name },
      {
        id: "department",
        accessor: (unit: Unit) =>
          unit.department?.name
            ? unit.department.name
            : unit.division?.name
            ? `Direct to ${unit.division.name}`
            : "",
      },
      {
        id: "unitLead",
        accessor: (unit: Unit) => unit.unitLead?.fullName ?? "",
      },
      {
        id: "members",
        accessor: (unit: Unit) => unit.members?.length ?? 0,
      },
      {
        id: "status",
        accessor: (unit: Unit) => (unit.isActive ? "Active" : "Inactive"),
        filterFn: (unit: Unit, value: string) =>
          (unit.isActive ? "Active" : "Inactive") === value,
      },
      {
        id: "createdAt",
        accessor: (unit: Unit) => unit.createdAt,
        compare: (a: Unit, b: Unit) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      },
    ],
    [],
  );

  const { processedRows, getHeaderProps } = useTableColumnControls({
    rows: units,
    columns,
  });

  const UnitForm = ({
    onSubmit,
    submitLabel,
    isLoading,
    onCancel,
  }: {
    onSubmit: (e: React.FormEvent) => void;
    submitLabel: string;
    isLoading: boolean;
    onCancel: () => void;
  }) => {
    const [localForm, setLocalForm] = React.useState(form);
    const [hierarchyType, setHierarchyType] = React.useState<"department" | "division">(() => {
      if (
        form.divisionId &&
        form.divisionId !== "none" &&
        (!form.departmentId || form.departmentId === "none")
      ) {
        return "division";
      }
      return "department";
    });

    React.useEffect(() => {
      setLocalForm(form);
      if (
        form.divisionId &&
        form.divisionId !== "none" &&
        (!form.departmentId || form.departmentId === "none")
      ) {
        setHierarchyType("division");
      } else {
        setHierarchyType("department");
      }
    }, []);

    const handleLocalSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const finalForm = {
        ...localForm,
        divisionId: hierarchyType === "division" && localForm.divisionId !== "none" ? localForm.divisionId : "none",
        departmentId: hierarchyType === "department" && localForm.departmentId !== "none" ? localForm.departmentId : "none",
      };
      setForm(finalForm);
      setTimeout(() => onSubmit(e), 0);
    };

    return (
      <form onSubmit={handleLocalSubmit} className="space-y-4 mt-2">
        <div className="space-y-2">
          <Label>Unit Name *</Label>
          <Input
            placeholder="e.g. Core Banking Unit, AI Strategy Task Force"
            value={localForm.name}
            onChange={(e) => setLocalForm({ ...localForm, name: e.target.value })}
            required
            autoFocus
          />
        </div>

        {/* Mutually Exclusive Hierarchy Placement */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Hierarchy Placement (Reports To) *</Label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setHierarchyType("department");
                setLocalForm((prev) => ({ ...prev, divisionId: "none" }));
              }}
              className={`flex flex-col items-center justify-center py-2 px-3 rounded-md text-xs sm:text-sm font-medium transition-all ${
                hierarchyType === "department"
                  ? "bg-white dark:bg-gray-900 text-primary shadow-sm font-semibold"
                  : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              }`}
            >
              <span>Department</span>
              <span className="text-[11px] opacity-75 font-normal">Departmental Unit</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setHierarchyType("division");
                setLocalForm((prev) => ({ ...prev, departmentId: "none" }));
              }}
              className={`flex flex-col items-center justify-center py-2 px-3 rounded-md text-xs sm:text-sm font-medium transition-all ${
                hierarchyType === "division"
                  ? "bg-white dark:bg-gray-900 text-primary shadow-sm font-semibold"
                  : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              }`}
            >
              <span>Division</span>
              <span className="text-[11px] opacity-75 font-normal">Direct Task Force / Unit</span>
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {hierarchyType === "department"
              ? "This unit reports to a Department. Division selection is excluded."
              : "This unit reports directly to a Division as a specialized task force. Department selection is excluded."}
          </p>
        </div>

        {hierarchyType === "department" ? (
          <div className="space-y-2">
            <Label>Department *</Label>
            <SearchableSelect
              value={localForm.departmentId === "none" ? "" : localForm.departmentId}
              onValueChange={(v) => {
                setLocalForm({
                  ...localForm,
                  departmentId: v || "none",
                  divisionId: "none",
                });
              }}
              placeholder="Select department"
              searchPlaceholder="Search departments..."
              emptyMessage={departments.length === 0 && !isAdmin ? "No departments available. Contact an admin to create one." : "No departments found"}
              options={departments.map((dept: any) => ({
                value: dept.departmentId,
                label: dept.division?.name ? `${dept.name} (${dept.division.name})` : dept.name,
              }))}
              clearable
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Division *</Label>
            <SearchableSelect
              value={localForm.divisionId === "none" ? "" : localForm.divisionId}
              onValueChange={(v) => {
                setLocalForm({
                  ...localForm,
                  divisionId: v || "none",
                  departmentId: "none",
                });
              }}
              placeholder="Select division (direct task force)"
              searchPlaceholder="Search divisions..."
              emptyMessage="No divisions found"
              options={divisions.map((div: any) => ({
                value: div.divisionId,
                label: div.name,
              }))}
              clearable
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>Unit Lead</Label>
          <SearchableSelect
            value={localForm.unitLeadUserId === "none" ? "" : localForm.unitLeadUserId}
            onValueChange={(v) => setLocalForm({ ...localForm, unitLeadUserId: v || "none" })}
            placeholder="Select unit lead (optional)"
            searchPlaceholder="Search employees..."
            emptyMessage={employees.length === 0 && !isAdmin ? "No employees available." : "No employees found"}
            options={employees.map((emp: any) => ({
              value: emp.employeeId,
              label: emp.fullName,
              description: emp.title || undefined,
            }))}
            clearable
          />
        </div>

        <div className="space-y-2">
          <Label>Unit Members</Label>
          <MultiSelect
            value={localForm.memberIds}
            onValueChange={(v) => setLocalForm({ ...localForm, memberIds: v })}
            placeholder="Select unit members (optional)"
            searchPlaceholder="Search employees..."
            emptyMessage={employees.length === 0 && !isAdmin ? "No employees available." : "No employees found"}
            options={employees
              .filter((emp: any) => emp.employeeId !== localForm.unitLeadUserId || localForm.unitLeadUserId === "none")
              .map((emp: any) => ({
                value: emp.employeeId,
                label: emp.fullName,
                description: emp.title || undefined,
              }))}
          />
          <p className="text-xs text-muted-foreground">
            Unit lead is automatically excluded from members list
          </p>
        </div>

        <div className="space-y-2">
          <Label>Description (Optional)</Label>
          <Textarea
            placeholder="Brief description of this unit's scope or purpose"
            value={localForm.description}
            onChange={(e) => setLocalForm({ ...localForm, description: e.target.value })}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || !localForm.name}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    );
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-[#18181b] rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="animate-pulse p-6 space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            {title}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {description}
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setShowCreate(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" /> Add Unit
        </Button>
      </div>

      {!units.length ? (
        <div className="bg-white dark:bg-[#18181b] rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            No units yet
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-6">
            Create your first unit under a division or department to organize goals and track performance.
          </p>
          <Button
            onClick={() => {
              resetForm();
              setShowCreate(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Create Unit
          </Button>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#18181b] rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <Table stickyFirstColumn>
            <TableHeader>
              <TableRow className="bg-gray-50 dark:bg-gray-900/50">
                <TableHead className="font-semibold">
                  <SortableFilterableHeader label="Unit Name" {...getHeaderProps("name")} />
                </TableHead>
                <TableHead className="font-semibold">
                  <SortableFilterableHeader
                    label="Hierarchy Placement"
                    {...getHeaderProps("department")}
                  />
                </TableHead>
                <TableHead className="font-semibold">
                  <SortableFilterableHeader
                    label="Unit Lead"
                    {...getHeaderProps("unitLead")}
                  />
                </TableHead>
                <TableHead className="font-semibold">
                  <SortableFilterableHeader
                    label="Members"
                    filterable={false}
                    {...getHeaderProps("members")}
                  />
                </TableHead>
                <TableHead className="font-semibold">
                  <SortableFilterableHeader
                    label="Status"
                    filterType="select"
                    filterOptions={[
                      { value: "Active", label: "Active" },
                      { value: "Inactive", label: "Inactive" },
                    ]}
                    {...getHeaderProps("status")}
                  />
                </TableHead>
                <TableHead className="font-semibold">
                  <SortableFilterableHeader
                    label="Created"
                    filterable={false}
                    {...getHeaderProps("createdAt")}
                  />
                </TableHead>
                <TableHead className="font-semibold w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {processedRows.map((unit) => (
                <TableRow
                  key={unit.unitId}
                  className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors"
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                        <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {unit.name}
                        </p>
                        {unit.description && (
                          <p className="text-xs text-gray-500 line-clamp-1">
                            {unit.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      {unit.department ? (
                        <>
                          <span className="text-sm text-gray-900 dark:text-gray-100 font-medium">
                            {unit.department.name}
                          </span>
                          {unit.department.division?.name && (
                            <span className="text-xs text-gray-500">
                              Division: {unit.department.division.name}
                            </span>
                          )}
                        </>
                      ) : unit.division ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 w-fit">
                          Direct to {unit.division.name}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {unit.unitLead ? (
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          src={unit.unitLead.picture}
                          alt={unit.unitLead.fullName}
                          fallbackText={unit.unitLead.fullName}
                          size="sm"
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {unit.unitLead.fullName}
                          </span>
                          {unit.unitLead.title && (
                            <span className="text-xs text-gray-500">{unit.unitLead.title}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">No lead assigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                        {unit.members?.length || 0} {(unit.members?.length === 1 ? 'member' : 'members')}
                      </span>
                      {unit.members && unit.members.length > 0 && (
                        <div className="flex -space-x-1.5 overflow-hidden">
                          {unit.members.slice(0, 3).map((m) => (
                            <UserAvatar
                              key={m.employeeId}
                              src={m.picture}
                              alt={m.fullName}
                              fallbackText={m.fullName}
                              size="sm"
                              className="border-2 border-white dark:border-gray-900"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        unit.isActive
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {unit.isActive ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {formatDate(unit.createdAt)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(unit);
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" /> Edit Unit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteUnit(unit);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete Unit
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Unit</DialogTitle>
            <DialogDescription>
              Add a new organizational unit, assign its parent hierarchy, unit lead, and team members.
            </DialogDescription>
          </DialogHeader>
          <UnitForm
            onSubmit={handleCreate}
            submitLabel="Create Unit"
            isLoading={mutLoading.create}
            onCancel={() => setShowCreate(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={Boolean(editUnit)} onOpenChange={(open) => !open && setEditUnit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Unit</DialogTitle>
            <DialogDescription>
              Update unit name, hierarchy placement, leadership, and members.
            </DialogDescription>
          </DialogHeader>
          <UnitForm
            onSubmit={handleEdit}
            submitLabel="Save Changes"
            isLoading={mutLoading.update}
            onCancel={() => setEditUnit(null)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={Boolean(deleteUnit)}
        onOpenChange={(open) => !open && setDeleteUnit(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Unit</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete unit &quot;{deleteUnit?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

