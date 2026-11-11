"use client";

import { useMemo, useState } from "react";
import React from "react";
import { getOrganizationId } from "@/lib/constants/organization";
import { type Team, useTeamMutations } from "@/hooks/teams/useTeams";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

interface TeamsTableProps {
  teams: Team[];
  loading: boolean;
  title?: string;
  description?: string;
  entityName?: string;
}

export default function TeamsTable({
  teams,
  loading,
  title = "Units",
  description = "Manage organizational units, specialized task forces, and assign unit leads",
  entityName = "Unit",
}: TeamsTableProps) {
  const router = useRouter();
  const { createTeam, updateTeam, removeTeam, loading: mutLoading } = useTeamMutations();

  const [showCreate, setShowCreate] = useState(false);
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [deleteTeam, setDeleteTeam] = useState<Team | null>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    divisionId: "none",
    departmentId: "none",
    teamLeadUserId: "none",
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

  // Fetch employees for team lead dropdown
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
    setForm({ name: "", description: "", divisionId: "none", departmentId: "none", teamLeadUserId: "none", memberIds: [] });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    try {
      const isDivision = form.divisionId && form.divisionId !== "none";
      const isDepartment = form.departmentId && form.departmentId !== "none";
      await createTeam({
        name: form.name,
        description: form.description || undefined,
        organizationId: getOrganizationId(),
        divisionId: isDivision && !isDepartment ? form.divisionId : undefined,
        departmentId: isDepartment && !isDivision ? form.departmentId : undefined,
        teamLeadUserId: form.teamLeadUserId && form.teamLeadUserId !== "none" ? form.teamLeadUserId : undefined,
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
    if (!editTeam || !form.name) return;
    try {
      const isDivision = form.divisionId && form.divisionId !== "none";
      const isDepartment = form.departmentId && form.departmentId !== "none";
      await updateTeam({
        teamId: editTeam.teamId,
        name: form.name,
        description: form.description || undefined,
        divisionId: isDivision && !isDepartment ? form.divisionId : undefined,
        departmentId: isDepartment && !isDivision ? form.departmentId : undefined,
        teamLeadUserId: form.teamLeadUserId && form.teamLeadUserId !== "none" ? form.teamLeadUserId : undefined,
        memberIds: form.memberIds.length > 0 ? form.memberIds : undefined,
        organizationId: getOrganizationId(),
      });
      resetForm();
      setEditTeam(null);
    } catch {
      /* handled */
    }
  };

  const handleDelete = async () => {
    if (!deleteTeam) return;
    try {
      await removeTeam(deleteTeam.teamId);
      setDeleteTeam(null);
    } catch {
      /* handled */
    }
  };

  const openEdit = (team: any) => {
    const hasDept = Boolean(team.department?.departmentId || team.departmentId);
    const hasDiv = Boolean(team.division?.divisionId || team.divisionId);
    const isDivisionUnit = hasDiv && !hasDept;

    setForm({
      name: team.name,
      description: team.description || "",
      divisionId: isDivisionUnit ? (team.division?.divisionId || team.divisionId || "none") : "none",
      departmentId: !isDivisionUnit ? (team.department?.departmentId || team.departmentId || "none") : "none",
      teamLeadUserId: team.teamLead?.employeeId || "none",
      memberIds: team.members?.map((m: any) => m.employee?.employeeId || m.employeeId) || [],
    });
    setEditTeam(team);
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const columns = useMemo(
    () => [
      { id: "name", accessor: (team: Team) => team.name },
      {
        id: "department",
        accessor: (team: Team) =>
          team.department?.name
            ? team.department.name
            : (team as any).division?.name
            ? `Direct: ${(team as any).division.name}`
            : "",
      },
      {
        id: "teamLead",
        accessor: (team: Team) => team.teamLead?.fullName ?? "",
      },
      {
        id: "members",
        accessor: (team: Team) => team.members?.length ?? 0,
      },
      {
        id: "status",
        accessor: (team: Team) => (team.isActive ? "Active" : "Inactive"),
        filterFn: (team: Team, value: string) =>
          (team.isActive ? "Active" : "Inactive") === value,
      },
      {
        id: "createdAt",
        accessor: (team: Team) => team.createdAt,
        compare: (a: Team, b: Team) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      },
    ],
    [],
  );

  const { processedRows, getHeaderProps } = useTableColumnControls({
    rows: teams,
    columns,
  });

  const TeamForm = ({
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
    // Local state to prevent re-renders from parent
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

    // Sync with parent form when dialog opens
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
      // Ensure strict mutual exclusivity: only the selected hierarchy parent is preserved
      const finalForm = {
        ...localForm,
        divisionId: hierarchyType === "division" && localForm.divisionId !== "none" ? localForm.divisionId : "none",
        departmentId: hierarchyType === "department" && localForm.departmentId !== "none" ? localForm.departmentId : "none",
      };
      setForm(finalForm);
      // Use setTimeout to ensure state is updated
      setTimeout(() => onSubmit(e), 0);
    };

    return (
      <form onSubmit={handleLocalSubmit} className="space-y-4 mt-2">
        <div className="space-y-2">
          <Label>{entityName} Name *</Label>
          <Input
            placeholder={`e.g. Specialized Task Force, ${entityName} Alpha`}
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
              customContent={
                departments.length === 0 && isAdmin ? (
                  <div className="px-2 py-1.5 pointer-events-auto">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-primary hover:text-primary hover:bg-primary/10 pointer-events-auto"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        router.push("/dashboard/structure?tab=departments&action=add");
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      New Department
                    </Button>
                  </div>
                ) : undefined
              }
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
          <Label>{entityName} Lead</Label>
          <SearchableSelect
            value={localForm.teamLeadUserId === "none" ? "" : localForm.teamLeadUserId}
            onValueChange={(v) => setLocalForm({ ...localForm, teamLeadUserId: v || "none" })}
            placeholder={`Select ${entityName.toLowerCase()} lead (optional)`}
            searchPlaceholder="Search employees..."
            emptyMessage={employees.length === 0 && !isAdmin ? "No employees available. Contact an admin to add employees." : "No employees found"}
            options={employees.map((emp: any) => ({
              value: emp.employeeId,
              label: emp.fullName,
              description: emp.title || undefined,
            }))}
            clearable
            customContent={
              employees.length === 0 && isAdmin ? (
                <div className="px-2 py-1.5 pointer-events-auto">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-primary hover:text-primary hover:bg-primary/10 pointer-events-auto"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      router.push("/dashboard/employees?action=add");
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    New Employee
                  </Button>
                </div>
              ) : undefined
            }
          />
        </div>

        <div className="space-y-2">
          <Label>{entityName} Members</Label>
          <MultiSelect
            value={localForm.memberIds}
            onValueChange={(v) => setLocalForm({ ...localForm, memberIds: v })}
            placeholder={`Select ${entityName.toLowerCase()} members (optional)`}
            searchPlaceholder="Search employees..."
            emptyMessage={employees.length === 0 && !isAdmin ? "No employees available. Contact an admin to add employees." : "No employees found"}
            options={employees
              .filter((emp: any) => emp.employeeId !== localForm.teamLeadUserId || localForm.teamLeadUserId === "none")
              .map((emp: any) => ({
                value: emp.employeeId,
                label: emp.fullName,
                description: emp.title || undefined,
              }))}
          />
          <p className="text-xs text-muted-foreground">
            {entityName} lead is automatically excluded from members
          </p>
        </div>

        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea
            placeholder="Describe the team's purpose and responsibilities..."
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
          <Plus className="mr-1.5 h-4 w-4" /> Add {entityName}
        </Button>
      </div>

      {!teams.length ? (
        <div className="bg-white dark:bg-[#18181b] rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            No {title.toLowerCase()} yet
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-6">
            Create your first {entityName.toLowerCase()} under a division or department to organize goals and track performance.
          </p>
          <Button
            onClick={() => {
              resetForm();
              setShowCreate(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Create {entityName}
          </Button>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#18181b] rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <Table stickyFirstColumn>
            <TableHeader>
              <TableRow className="bg-gray-50 dark:bg-gray-900/50">
                <TableHead className="font-semibold">
                  <SortableFilterableHeader label={`${entityName} Name`} {...getHeaderProps("name")} />
                </TableHead>
                <TableHead className="font-semibold">
                  <SortableFilterableHeader
                    label="Hierarchy / Department"
                    {...getHeaderProps("department")}
                  />
                </TableHead>
                <TableHead className="font-semibold">
                  <SortableFilterableHeader
                    label={`${entityName} Lead`}
                    {...getHeaderProps("teamLead")}
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
              {processedRows.map((team) => (
                <TableRow
                  key={team.teamId}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors"
                  onClick={() => router.push(`/dashboard/teams/${team.teamId}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                        <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {team.name}
                        </p>
                        {team.description && (
                          <p className="text-xs text-gray-500 line-clamp-1">
                            {team.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      {team.department ? (
                        <span className="text-sm text-gray-900 dark:text-gray-100 font-medium">
                          {team.department.name}
                        </span>
                      ) : (team as any).division ? (
                        <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                          Direct to {(team as any).division.name}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                      {team.department?.division?.name && (
                        <span className="text-xs text-gray-500">
                          Division: {team.department.division.name}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {team.teamLead ? (
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          src={team.teamLead.picture}
                          alt={team.teamLead.fullName}
                          fallbackText={team.teamLead.fullName}
                          size="sm"
                        />
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {team.teamLead.fullName}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400">No lead assigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {team.members?.length || 0} {team.members?.length === 1 ? 'member' : 'members'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        team.isActive
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {team.isActive ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {formatDate(team.createdAt)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-9 w-9 min-h-9 min-w-9 touch-manipulation">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/teams/${team.teamId}`);
                          }}
                        >
                          <Eye className="mr-2 h-4 w-4" /> View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(team);
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTeam(team);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
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

      {/* Create Unit Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-xl">Create {entityName}</DialogTitle>
            <DialogDescription>
              Add a new {entityName.toLowerCase()} directly under a division or department.
            </DialogDescription>
          </DialogHeader>
          <TeamForm
            onSubmit={handleCreate}
            submitLabel={`Create ${entityName}`}
            isLoading={mutLoading.create}
            onCancel={() => {
              resetForm();
              setShowCreate(false);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Unit Dialog */}
      <Dialog
        open={!!editTeam}
        onOpenChange={(open) => {
          if (!open) {
            resetForm();
            setEditTeam(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-xl">Edit {entityName}</DialogTitle>
            <DialogDescription>Update {entityName.toLowerCase()} details.</DialogDescription>
          </DialogHeader>
          <TeamForm
            onSubmit={handleEdit}
            submitLabel="Save Changes"
            isLoading={mutLoading.update}
            onCancel={() => {
              resetForm();
              setEditTeam(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Unit Dialog */}
      <AlertDialog
        open={!!deleteTeam}
        onOpenChange={(open) => !open && setDeleteTeam(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {entityName}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>&quot;{deleteTeam?.name}&quot;</strong>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={mutLoading.remove}
            >
              {mutLoading.remove && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
