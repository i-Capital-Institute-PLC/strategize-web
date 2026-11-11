export type LogbookReviewDepartment = {
  departmentId?: string;
  headUserId?: string | null;
  head?: { employeeId?: string | null } | null;
  division?: {
    divisionId?: string;
    headUserId?: string | null;
    head?: { employeeId?: string | null } | null;
  } | null;
};

export type LogbookReviewUser = {
  managerId?: string | null;
  employeeId?: string;
  role?: string | null;
  departments?: LogbookReviewDepartment[] | null;
};

const MANAGEMENT_ROLES = new Set([
  "MANAGER",
  "DIRECTOR",
  "ADMIN",
  "SUPER_ADMIN",
]);

export function canReviewLogbookOwner(
  owner: LogbookReviewUser | null | undefined,
  currentUser: LogbookReviewUser | null | undefined,
  departments: LogbookReviewDepartment[] = [],
): boolean {
  if (!owner || !currentUser || owner.employeeId === currentUser.employeeId) {
    return false;
  }

  const currentUserRole = String(currentUser.role || "").toUpperCase();
  const ownerRole = String(owner.role || "").toUpperCase();

  if (currentUserRole === 'CEO') {
    return (
      (owner.managerId === currentUser.employeeId && (
        ownerRole === 'DIRECTOR' || departments.some(
          (department) => department.head?.employeeId === owner.employeeId,
        )
      )) ||
      (!owner.managerId && (
        ownerRole === 'DIRECTOR' || departments.some(
          (department) =>
            department.head?.employeeId === owner.employeeId &&
            !department.division,
        )
      ))
    );
  }

  if (["SUPER_ADMIN", "ADMIN"].includes(currentUserRole)) {
    if (ownerRole === "DIRECTOR") return true;
    return (
      ownerRole === "MANAGER" &&
      departments.some(
        (department) =>
          department.head?.employeeId === owner.employeeId &&
          !department.division,
      )
    );
  }

  if (currentUserRole === "DIRECTOR") {
    return (
      ownerRole === "MANAGER" &&
      departments.some((department) => {
        const deptHeadId = department.head?.employeeId || department.headUserId;
        const divHeadId = department.division?.head?.employeeId || department.division?.headUserId;
        return (
          deptHeadId === owner.employeeId &&
          divHeadId === currentUser.employeeId
        );
      })
    );
  }

  if (currentUserRole === "MANAGER") {
    return (
      !MANAGEMENT_ROLES.has(ownerRole) &&
      Boolean(
        owner.departments?.some(
          (department) =>
            department.head?.employeeId === currentUser.employeeId,
        ),
      )
    );
  }

  return false;
}
