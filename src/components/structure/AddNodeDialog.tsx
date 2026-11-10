"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Building2,
  GitBranch,
  Layers,
  Search,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  User,
  Users,
  Briefcase,
  Sparkles,
} from "lucide-react";
import { useQuery } from "@apollo/client";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { MultiSelect } from "@/components/ui/multi-select";
import { GET_DIVISIONS } from "@/lib/graphql/queries/divisions";
import { GET_DEPARTMENTS } from "@/lib/graphql/queries/departments";
import { GET_EMPLOYEES } from "@/lib/graphql/queries/employees";
import { useUnits, useUnitMutations } from "@/hooks/units/useUnits";
import { useDivisionMutations } from "@/hooks/divisions/useDivisionMutations";
import { useDepartmentMutations } from "@/hooks/departments/useDepartmentMutations";
import { useOrganizationId } from "@/hooks/useOrganizationId";
import { toast } from "sonner";

export interface ParentNodeContext {
  id: string;
  name: string;
  subtitle?: string;
  level: number;
  legacyId?: string;
}

export interface AddNodeResult {
  name: string;
  subtitle: string;
  entityType: string;
  legacyId?: string;
  color?: string;
}

interface AddNodeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (result: AddNodeResult) => void;
  parentNode?: ParentNodeContext | null;
  existingNodeNames?: Set<string>;
}

interface EntityTypeOption {
  type: "Division" | "Department" | "Unit";
  label: string;
  badge: string;
  description: string;
  defaultSubtitle: string;
  color: string;
  placeholder: string;
  icon: typeof Building2;
}

export default function AddNodeDialog({
  isOpen,
  onClose,
  onAdd,
  parentNode,
  existingNodeNames,
}: AddNodeDialogProps) {
  const [mounted, setMounted] = useState(false);
  const organizationId = useOrganizationId();

  // Mode: "existing" (select from DB) or "new" (create brand new entity)
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selectedType, setSelectedType] = useState<"Division" | "Department" | "Unit">("Department");

  // Selection state for "existing" mode
  const [selectedEntityId, setSelectedEntityId] = useState<string>("");
  const [customSubtitle, setCustomSubtitle] = useState<string>("");

  // Form state for "new" mode
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newHeadUserId, setNewHeadUserId] = useState<string>("");
  const [newParentDivisionId, setNewParentDivisionId] = useState<string>("");
  const [newMemberIds, setNewMemberIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const newNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Compute allowed entity types based on parent level / context
  const allowedOptions: EntityTypeOption[] = useMemo(() => {
    const parentLevel = parentNode?.level ?? 0;

    if (parentLevel === 0) {
      // Under Corporate / CEO: can add Division or direct Department
      return [
        {
          type: "Division",
          label: "Division",
          badge: "Level 1",
          description: "Major business division or operational wing",
          defaultSubtitle: "Division",
          color: "#8B5CF6",
          placeholder: "e.g. Technology & Innovation Division",
          icon: Building2,
        },
        {
          type: "Department",
          label: "Department",
          badge: "Direct to CEO",
          description: "Corporate department reporting directly to CEO",
          defaultSubtitle: "Department",
          color: "#EC4899",
          placeholder: "e.g. Legal & Corporate Governance",
          icon: GitBranch,
        },
      ];
    }

    if (parentLevel === 1) {
      // Under Division: can add Department or specialized Unit (Task Force)
      return [
        {
          type: "Department",
          label: "Department",
          badge: "Level 2",
          description: "Department under this division",
          defaultSubtitle: "Department",
          color: "#EC4899",
          placeholder: "e.g. Software Development & Innovation",
          icon: GitBranch,
        },
        {
          type: "Unit",
          label: "Unit / Task Force",
          badge: "Division Unit",
          description: "Specialized unit or task force reporting directly to division",
          defaultSubtitle: "Unit",
          color: "#0D9488", // Distinct Teal
          placeholder: "e.g. AI Strategy Task Force",
          icon: Layers,
        },
      ];
    }

    // Under Department (level >= 2): can add Unit
    return [
      {
        type: "Unit",
        label: "Unit",
        badge: "Level 3",
        description: "Departmental unit or agile squad",
        defaultSubtitle: "Unit",
        color: "#0D9488", // Distinct Teal
        placeholder: "e.g. Quality Assurance & Delivery Unit",
        icon: Layers,
      },
    ];
  }, [parentNode?.level]);

  // Queries for existing entities
  const { data: divisionsData, loading: divisionsLoading } = useQuery(GET_DIVISIONS, {
    variables: { page: 1, limit: 100, organizationId },
    skip: !isOpen || !organizationId,
    fetchPolicy: "cache-and-network",
  });

  const { data: departmentsData, loading: departmentsLoading } = useQuery(GET_DEPARTMENTS, {
    variables: { page: 1, limit: 100, organizationId },
    skip: !isOpen || !organizationId,
    fetchPolicy: "cache-and-network",
  });

  const { units, loading: unitsLoading } = useUnits({
    limit: 100,
    organizationId,
  });

  const { data: employeesData } = useQuery(GET_EMPLOYEES, {
    variables: { page: 1, limit: 200 },
    skip: !isOpen,
    fetchPolicy: "cache-first",
  });

  // Mutations for "new" mode
  const { createDivision } = useDivisionMutations();
  const { createDepartment } = useDepartmentMutations();
  const { createUnit } = useUnitMutations();

  // Normalize queried lists
  const divisionsList = useMemo(() => {
    return (divisionsData?.divisions?.items || []) as Array<{
      divisionId: string;
      name: string;
      description?: string;
      head?: { employeeId: string; fullName: string };
      departments?: Array<{ departmentId: string; name: string }>;
    }>;
  }, [divisionsData]);

  const departmentsList = useMemo(() => {
    return (departmentsData?.departments?.items || []) as Array<{
      departmentId: string;
      name: string;
      description?: string;
      division?: { divisionId: string; name: string };
      manager?: { employeeId: string; fullName: string };
    }>;
  }, [departmentsData]);

  const unitsList = useMemo(() => {
    return units || [];
  }, [units]);

  const employeesList = useMemo(() => {
    return (employeesData?.employees?.items || []) as Array<{
      employeeId: string;
      fullName: string;
      title?: string;
      email?: string;
      picture?: string;
    }>;
  }, [employeesData]);

  // Resolve parent division / department from parentNode context
  const resolvedParentDivision = useMemo(() => {
    if (!parentNode) return null;
    if (parentNode.level === 1) {
      // Parent is a Division
      const byLegacy = parentNode.legacyId
        ? divisionsList.find((d) => d.divisionId === parentNode.legacyId)
        : null;
      if (byLegacy) return byLegacy;
      const byName = divisionsList.find(
        (d) => d.name.toLowerCase() === parentNode.name.toLowerCase()
      );
      if (byName) return byName;
      return { divisionId: parentNode.id, name: parentNode.name };
    }
    return null;
  }, [parentNode, divisionsList]);

  const resolvedParentDepartment = useMemo(() => {
    if (!parentNode) return null;
    if (parentNode.level >= 2) {
      // Parent is a Department
      const byLegacy = parentNode.legacyId
        ? departmentsList.find((d) => d.departmentId === parentNode.legacyId)
        : null;
      if (byLegacy) return byLegacy;
      const byName = departmentsList.find(
        (d) => d.name.toLowerCase() === parentNode.name.toLowerCase()
      );
      if (byName) return byName;
      return { departmentId: parentNode.id, name: parentNode.name };
    }
    return null;
  }, [parentNode, departmentsList]);

  // Reset dialog state when opened
  useEffect(() => {
    if (!isOpen) {
      setMode("existing");
      setSelectedEntityId("");
      setCustomSubtitle("");
      setNewName("");
      setNewDescription("");
      setNewHeadUserId("");
      setNewParentDivisionId("");
      setNewMemberIds([]);
      setIsSubmitting(false);
    } else {
      const firstOpt = allowedOptions[0];
      if (firstOpt) {
        setSelectedType(firstOpt.type);
        setCustomSubtitle(firstOpt.defaultSubtitle);
      }
      setSelectedEntityId("");
    }
  }, [isOpen, parentNode?.id, allowedOptions]);

  // Handle entity type selection
  const handleSelectType = (opt: EntityTypeOption) => {
    setSelectedType(opt.type);
    setSelectedEntityId("");
    setCustomSubtitle(opt.defaultSubtitle);
  };

  const currentOption = allowedOptions.find((o) => o.type === selectedType) || allowedOptions[0];

  // Options for "existing" mode dropdown
  const existingDropdownOptions = useMemo(() => {
    if (selectedType === "Division") {
      return divisionsList.map((d) => {
        const inTree = existingNodeNames?.has(d.name.toLowerCase());
        const head = d.head?.fullName ? `Head: ${d.head.fullName}` : "";
        const deptsCount = d.departments?.length ? `${d.departments.length} depts` : "";
        const details = [head, deptsCount].filter(Boolean).join(" • ");
        return {
          value: d.divisionId,
          label: d.name,
          description: inTree ? `${details ? details + " • " : ""}(Already in structure)` : details,
        };
      });
    }

    if (selectedType === "Department") {
      return departmentsList.map((dept) => {
        const inTree = existingNodeNames?.has(dept.name.toLowerCase());
        const divInfo = dept.division?.name ? `Division: ${dept.division.name}` : "Direct";
        const mgr = dept.manager?.fullName ? `Mgr: ${dept.manager.fullName}` : "";
        const details = [divInfo, mgr].filter(Boolean).join(" • ");
        return {
          value: dept.departmentId,
          label: dept.name,
          description: inTree ? `${details ? details + " • " : ""}(Already in structure)` : details,
        };
      });
    }

    // Unit
    return unitsList.map((unit) => {
      const inTree = existingNodeNames?.has(unit.name.toLowerCase());
      const parentName = unit.department?.name
        ? `Dept: ${unit.department.name}`
        : unit.division?.name
        ? `Div: ${unit.division.name}`
        : "";
      const lead = unit.unitLead?.fullName ? `Lead: ${unit.unitLead.fullName}` : "";
      const memberCount = unit.members?.length ? `${unit.members.length} members` : "";
      const details = [parentName, lead, memberCount].filter(Boolean).join(" • ");
      return {
        value: unit.unitId,
        label: unit.name,
        description: inTree ? `${details ? details + " • " : ""}(Already in structure)` : details,
      };
    });
  }, [selectedType, divisionsList, departmentsList, unitsList, existingNodeNames]);

  // Selected existing entity preview
  const selectedExistingEntity = useMemo(() => {
    if (!selectedEntityId) return null;
    if (selectedType === "Division") {
      return divisionsList.find((d) => d.divisionId === selectedEntityId);
    }
    if (selectedType === "Department") {
      return departmentsList.find((d) => d.departmentId === selectedEntityId);
    }
    return unitsList.find((u) => u.unitId === selectedEntityId);
  }, [selectedEntityId, selectedType, divisionsList, departmentsList, unitsList]);

  // Submission for "existing" mode
  const handleAddExisting = () => {
    if (!selectedExistingEntity) {
      toast.error("Please select an existing entity from the dropdown");
      return;
    }

    const legacyId =
      "divisionId" in selectedExistingEntity
        ? selectedExistingEntity.divisionId
        : "departmentId" in selectedExistingEntity
        ? selectedExistingEntity.departmentId
        : "unitId" in selectedExistingEntity
        ? selectedExistingEntity.unitId
        : undefined;

    onAdd({
      name: selectedExistingEntity.name,
      subtitle: customSubtitle.trim() || currentOption?.defaultSubtitle || "Unit",
      entityType: selectedType,
      legacyId,
      color: currentOption?.color,
    });
    onClose();
  };

  // Submission for "new" mode
  const handleCreateNew = async () => {
    if (!newName.trim()) {
      toast.error(`Please enter a ${selectedType.toLowerCase()} name`);
      newNameInputRef.current?.focus();
      return;
    }

    if (!organizationId) {
      toast.error("Organization context is missing. Please refresh.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (selectedType === "Division") {
        const created = await createDivision({
          input: {
            organizationId,
            name: newName.trim(),
            description: newDescription.trim() || undefined,
            headUserId: newHeadUserId && newHeadUserId !== "none" ? newHeadUserId : undefined,
          },
        });

        if (created) {
          onAdd({
            name: created.name,
            subtitle: customSubtitle.trim() || "Division",
            entityType: "Division",
            legacyId: created.divisionId,
            color: "#8B5CF6",
          });
          toast.success(`Division "${created.name}" created and added to structure`);
          onClose();
        }
      } else if (selectedType === "Department") {
        const divId =
          resolvedParentDivision?.divisionId ||
          (newParentDivisionId && newParentDivisionId !== "none" ? newParentDivisionId : undefined);

        const created = await createDepartment({
          input: {
            organizationId,
            name: newName.trim(),
            description: newDescription.trim() || undefined,
            divisionId: divId,
            headUserId: newHeadUserId && newHeadUserId !== "none" ? newHeadUserId : undefined,
          },
        });

        if (created) {
          onAdd({
            name: created.name,
            subtitle: customSubtitle.trim() || "Department",
            entityType: "Department",
            legacyId: created.departmentId,
            color: "#EC4899",
          });
          toast.success(`Department "${created.name}" created and added to structure`);
          onClose();
        }
      } else if (selectedType === "Unit") {
        // Enforce mutual exclusivity: either divisionId or departmentId
        const isDivisionParent = Boolean(resolvedParentDivision);
        const divId = isDivisionParent ? resolvedParentDivision?.divisionId : undefined;
        const deptId = !isDivisionParent ? resolvedParentDepartment?.departmentId : undefined;

        const created = await createUnit({
          organizationId,
          name: newName.trim(),
          description: newDescription.trim() || undefined,
          divisionId: divId,
          departmentId: deptId,
          unitLeadUserId: newHeadUserId && newHeadUserId !== "none" ? newHeadUserId : undefined,
          memberIds: newMemberIds.length > 0 ? newMemberIds : undefined,
        });

        if (created) {
          onAdd({
            name: created.name,
            subtitle: customSubtitle.trim() || "Unit",
            entityType: "Unit",
            legacyId: created.unitId,
            color: "#0D9488", // Distinct Teal
          });
          toast.success(`Unit "${created.name}" created and added to structure`);
          onClose();
        }
      }
    } catch (err: any) {
      console.error("Failed to create entity:", err);
      // Toast already surfaced by mutation hook
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative bg-white dark:bg-[#18181b] rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col z-10 border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: currentOption?.color || "#0D9488" }}
              />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Add Structure Node
              </h2>
            </div>
            {parentNode && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                <span>Adding child under:</span>
                <span className="font-semibold text-gray-800 dark:text-gray-200">
                  {parentNode.name}
                </span>
                {parentNode.subtitle ? (
                  <span className="text-gray-400">({parentNode.subtitle})</span>
                ) : null}
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg transition-colors"
            type="button"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="px-6 py-4 overflow-y-auto space-y-4 text-sm flex-1">
          {/* Mode Tabs: Select Existing vs Create New */}
          <div className="grid grid-cols-2 p-1 bg-gray-100 dark:bg-gray-800/80 rounded-xl">
            <button
              type="button"
              onClick={() => setMode("existing")}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                mode === "existing"
                  ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm font-semibold"
                  : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Select Existing</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("new");
                setTimeout(() => newNameInputRef.current?.focus(), 80);
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                mode === "new"
                  ? "bg-white dark:bg-gray-900 text-primary shadow-sm font-semibold"
                  : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Create Brand New</span>
            </button>
          </div>

          {/* Entity Type Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 block">
              Node Type to Add
            </label>
            <div className={`grid gap-2 ${allowedOptions.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {allowedOptions.map((opt) => {
                const Icon = opt.icon;
                const isSelected = selectedType === opt.type;
                return (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => handleSelectType(opt)}
                    className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 text-primary shadow-sm ring-1 ring-primary"
                        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <div className="flex items-center gap-2 font-semibold text-sm">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: opt.color }}
                        />
                        <Icon className="w-4 h-4" />
                        <span>{opt.label}</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-normal text-muted-foreground">
                        {opt.badge}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground line-clamp-1">
                      {opt.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ======================================================== */}
          {/* MODE 1: SELECT EXISTING ENTITY (SEARCHABLE DROPDOWN)      */}
          {/* ======================================================== */}
          {mode === "existing" && (
            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block">
                  Choose Existing {currentOption?.label} *
                </label>
                <SearchableSelect
                  value={selectedEntityId}
                  onValueChange={setSelectedEntityId}
                  placeholder={`Search & select established ${currentOption?.label.toLowerCase()}...`}
                  searchPlaceholder={`Type to search ${currentOption?.label.toLowerCase()}s...`}
                  emptyMessage={
                    selectedType === "Division" && divisionsLoading
                      ? "Loading divisions..."
                      : selectedType === "Department" && departmentsLoading
                      ? "Loading departments..."
                      : selectedType === "Unit" && unitsLoading
                      ? "Loading units..."
                      : `No ${currentOption?.label.toLowerCase()}s found in database.`
                  }
                  options={existingDropdownOptions}
                  clearable
                />
                <p className="text-[11px] text-muted-foreground">
                  Pick from established entities in your organization to place them directly into the structure.
                </p>
              </div>

              {/* Selected Entity Preview Card */}
              {selectedExistingEntity && (
                <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                      <span>{selectedExistingEntity.name}</span>
                    </div>
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: currentOption?.color }}
                    >
                      {currentOption?.label}
                    </span>
                  </div>

                  <div className="text-xs text-gray-600 dark:text-gray-300 space-y-0.5 pl-6">
                    {"head" in selectedExistingEntity && selectedExistingEntity.head?.fullName && (
                      <p>Division Head: <span className="font-medium">{selectedExistingEntity.head.fullName}</span></p>
                    )}
                    {"manager" in selectedExistingEntity && selectedExistingEntity.manager?.fullName && (
                      <p>Department Manager: <span className="font-medium">{selectedExistingEntity.manager.fullName}</span></p>
                    )}
                    {"division" in selectedExistingEntity && (selectedExistingEntity as any).division?.name && (
                      <p>Division: <span className="font-medium">{(selectedExistingEntity as any).division.name}</span></p>
                    )}
                    {"unitLead" in selectedExistingEntity && (selectedExistingEntity as any).unitLead?.fullName && (
                      <p>Unit Lead: <span className="font-medium">{(selectedExistingEntity as any).unitLead.fullName}</span></p>
                    )}
                    {"members" in selectedExistingEntity && Array.isArray((selectedExistingEntity as any).members) && (
                      <p>Assigned Members: <span className="font-medium">{(selectedExistingEntity as any).members.length} employees</span></p>
                    )}
                    {selectedExistingEntity.description && (
                      <p className="italic text-gray-500 text-[11px] line-clamp-2 mt-1">
                        "{selectedExistingEntity.description}"
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Custom Role / Subtitle Input */}
              <div className="space-y-1.5">
                <label
                  htmlFor="existingSubtitle"
                  className="text-xs font-semibold text-gray-700 dark:text-gray-300 block"
                >
                  Card Role / Subtitle
                </label>
                <input
                  id="existingSubtitle"
                  type="text"
                  placeholder="e.g. Division, Department, Unit, Manager"
                  value={customSubtitle}
                  onChange={(e) => setCustomSubtitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#09090b] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* MODE 2: CREATE BRAND NEW ENTITY                          */}
          {/* ======================================================== */}
          {mode === "new" && (
            <div className="space-y-3.5 pt-1">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Establishing a brand new {selectedType.toLowerCase()}</p>
                  <p className="opacity-90 mt-0.5">
                    This will register the new {selectedType.toLowerCase()} into PostgreSQL and immediately place it into the structure tree.
                  </p>
                </div>
              </div>

              {/* Name * */}
              <div className="space-y-1.5">
                <label
                  htmlFor="newName"
                  className="text-xs font-semibold text-gray-700 dark:text-gray-300 block"
                >
                  {selectedType} Name *
                </label>
                <input
                  ref={newNameInputRef}
                  id="newName"
                  type="text"
                  placeholder={currentOption?.placeholder}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#09090b] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              {/* Hierarchy Context Displays */}
              {selectedType === "Department" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block">
                    Parent Division
                  </label>
                  {resolvedParentDivision ? (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-xs">
                      <Building2 className="w-4 h-4 text-purple-600" />
                      <span className="text-gray-500">Assigned under Division:</span>
                      <span className="font-semibold text-gray-800 dark:text-gray-200">
                        {resolvedParentDivision.name}
                      </span>
                    </div>
                  ) : (
                    <SearchableSelect
                      value={newParentDivisionId}
                      onValueChange={setNewParentDivisionId}
                      placeholder="Select parent division (or leave empty for direct corporate)"
                      searchPlaceholder="Search divisions..."
                      options={[
                        { value: "none", label: "None (Direct corporate department)" },
                        ...divisionsList.map((d) => ({
                          value: d.divisionId,
                          label: d.name,
                        })),
                      ]}
                      clearable
                    />
                  )}
                </div>
              )}

              {selectedType === "Unit" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block">
                    Hierarchy Placement (Mutual Exclusivity)
                  </label>
                  {resolvedParentDivision ? (
                    <div className="p-2.5 rounded-lg border border-teal-200 dark:border-teal-800/50 bg-teal-50 dark:bg-teal-950/20 text-xs text-teal-900 dark:text-teal-200 flex items-start gap-2">
                      <Layers className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Specialized Division Task Force / Unit</p>
                        <p className="opacity-90 mt-0.5">
                          Reports directly to Division: <span className="font-bold">{resolvedParentDivision.name}</span>. Department link is excluded.
                        </p>
                      </div>
                    </div>
                  ) : resolvedParentDepartment ? (
                    <div className="p-2.5 rounded-lg border border-teal-200 dark:border-teal-800/50 bg-teal-50 dark:bg-teal-950/20 text-xs text-teal-900 dark:text-teal-200 flex items-start gap-2">
                      <Layers className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Departmental Unit</p>
                        <p className="opacity-90 mt-0.5">
                          Reports to Department: <span className="font-bold">{resolvedParentDepartment.name}</span>. Division link is excluded.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-600 dark:text-gray-300">
                      Adding under Corporate root as top-level task force.
                    </div>
                  )}
                </div>
              )}

              {/* Head / Manager / Lead Select */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block">
                  {selectedType === "Division"
                    ? "Division Head / Director (Optional)"
                    : selectedType === "Department"
                    ? "Department Head / Manager (Optional)"
                    : "Unit Lead (Optional)"}
                </label>
                <SearchableSelect
                  value={newHeadUserId}
                  onValueChange={setNewHeadUserId}
                  placeholder={`Select ${
                    selectedType === "Division"
                      ? "division head"
                      : selectedType === "Department"
                      ? "department manager"
                      : "unit lead"
                  }...`}
                  searchPlaceholder="Search employees by name or title..."
                  options={employeesList.map((emp) => ({
                    value: emp.employeeId,
                    label: emp.fullName,
                    description: emp.title || emp.email,
                  }))}
                  clearable
                />
              </div>

              {/* Unit Members Multi-Select (for Unit only) */}
              {selectedType === "Unit" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block">
                    Unit Team Members (Optional)
                  </label>
                  <MultiSelect
                    value={newMemberIds}
                    onValueChange={setNewMemberIds}
                    placeholder="Assign employees to this unit..."
                    searchPlaceholder="Search employees..."
                    options={employeesList.map((emp) => ({
                      value: emp.employeeId,
                      label: emp.fullName,
                      description: emp.title || emp.email,
                    }))}
                  />
                  {newMemberIds.length > 0 && (
                    <p className="text-[11px] text-teal-600 dark:text-teal-400 font-medium">
                      {newMemberIds.length} member{newMemberIds.length > 1 ? "s" : ""} selected for this unit.
                    </p>
                  )}
                </div>
              )}

              {/* Description */}
              <div className="space-y-1.5">
                <label
                  htmlFor="newDescription"
                  className="text-xs font-semibold text-gray-700 dark:text-gray-300 block"
                >
                  Description / Purpose (Optional)
                </label>
                <textarea
                  id="newDescription"
                  rows={2}
                  placeholder="State the core function or strategic mandate..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#09090b] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-gray-100 dark:border-gray-800 flex justify-end items-center gap-2 bg-gray-50/50 dark:bg-gray-900/50">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          {mode === "existing" ? (
            <button
              type="button"
              disabled={!selectedEntityId}
              onClick={handleAddExisting}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Add to Structure</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!newName.trim() || isSubmitting}
              onClick={handleCreateNew}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating & Adding...</span>
                </>
              ) : (
                <>
                  <PlusCircle className="w-4 h-4" />
                  <span>Create & Add to Structure</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
