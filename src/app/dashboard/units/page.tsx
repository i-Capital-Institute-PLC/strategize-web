"use client";

import { useState } from "react";
import { useUnits } from "@/hooks/units/useUnits";
import UnitsTable from "@/components/units/UnitsTable";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
import { useQuery } from "@apollo/client";
import { GET_DEPARTMENTS } from "@/lib/graphql/queries/departments";
import { GET_DIVISIONS } from "@/lib/graphql/queries/divisions";

export default function UnitsPage() {
  const [search, setSearch] = useState("");
  const [divisionFilter, setDivisionFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: divsData } = useQuery(GET_DIVISIONS, {
    variables: { page: 1, limit: 100 },
  });
  const divisions = divsData?.divisions?.items || [];

  const { data: deptsData } = useQuery(GET_DEPARTMENTS, {
    variables: { page: 1, limit: 100 },
  });
  const allDepartments = deptsData?.departments?.items || [];

  const filteredDepartments =
    divisionFilter !== "all"
      ? allDepartments.filter(
          (dept: any) => dept.division?.divisionId === divisionFilter,
        )
      : allDepartments;

  const { units: allUnits, loading } = useUnits({
    page: 1,
    limit: 100,
    search: search || undefined,
    divisionId: divisionFilter !== "all" ? divisionFilter : undefined,
    departmentId: departmentFilter !== "all" ? departmentFilter : undefined,
  });

  // Filter by status client-side
  const units =
    statusFilter === "all"
      ? allUnits
      : allUnits.filter((unit) =>
          statusFilter === "active" ? unit.isActive : !unit.isActive,
        );

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Search and Filters */}
      <div className="flex flex-col gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search organizational units..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Division Filter */}
          <Select
            value={divisionFilter}
            onValueChange={(val) => {
              setDivisionFilter(val);
              if (val !== "all") {
                const currentDept = allDepartments.find(
                  (d: any) => d.departmentId === departmentFilter,
                );
                if (currentDept && currentDept.division?.divisionId !== val) {
                  setDepartmentFilter("all");
                }
              }
            }}
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filter by division" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Divisions</SelectItem>
              {divisions.map((div: any) => (
                <SelectItem key={div.divisionId} value={div.divisionId}>
                  {div.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Department Filter */}
          <Select
            value={departmentFilter}
            onValueChange={setDepartmentFilter}
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filter by department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {filteredDepartments.map((dept: any) => (
                <SelectItem key={dept.departmentId} value={dept.departmentId}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <UnitsTable units={units} loading={loading} />
    </div>
  );
}

