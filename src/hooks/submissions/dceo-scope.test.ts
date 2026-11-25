import { describe, expect, it } from "vitest";
import {
  filterSubmissionsByHierarchy,
} from "./utils";
import { inboundLevelsForApprover } from "./submissionQueryVariables";
import { canReviewLogbookOwner } from "@/lib/logbook/review-hierarchy";
import type { MinimalSubmission } from "./types";

describe("DCEO CEO-Office approval scope (frontend)", () => {
  it("fetches DIVISION, DEPARTMENT, and PERSONNEL levels for DCEO", () => {
    expect(inboundLevelsForApprover("CORPORATE", false)).toEqual([
      "DIVISION",
      "DEPARTMENT",
    ]);
    expect(inboundLevelsForApprover("CORPORATE", true)).toEqual([
      "DIVISION",
      "DEPARTMENT",
      "PERSONNEL",
    ]);
  });

  it("filters submissions for DCEO to division heads, standalone departments, and CEO-Office direct personnel", () => {
    const standaloneDepts = new Set(["dept-ssu"]);
    const baseSub = (
      id: string,
      level: MinimalSubmission["level"],
      submittedBy: MinimalSubmission["submittedBy"],
      objective?: MinimalSubmission["objective"],
    ): MinimalSubmission => ({
      submissionId: id,
      type: "OBJECTIVE",
      level,
      status: "PENDING" as never,
      submittedBy,
      objective: objective ?? null,
    });

    const submissions: MinimalSubmission[] = [
      baseSub("sub-div", "DIVISION", { fullName: "SBU Director" }),
      baseSub(
        "sub-ssu",
        "DEPARTMENT",
        { fullName: "SSU Head" },
        { objectiveId: "o1", assigneeType: "DEPARTMENT", assigneeId: "dept-ssu" },
      ),
      baseSub(
        "sub-sbu-dept",
        "DEPARTMENT",
        { fullName: "SBU Dept Head" },
        { objectiveId: "o2", assigneeType: "DEPARTMENT", assigneeId: "dept-sbu" },
      ),
      baseSub("sub-ceo-direct", "PERSONNEL", {
        employeeId: "emp-ceo-direct",
        fullName: "CEO Direct Report",
        managerId: "ceo-1",
        manager: { employeeId: "ceo-1", role: "CEO" },
      }),
      baseSub("sub-regular-emp", "PERSONNEL", {
        employeeId: "emp-regular",
        fullName: "Department Staff",
        managerId: "mgr-1",
        manager: { employeeId: "mgr-1", role: "MANAGER" },
      }),
    ];

    const dceoIds = filterSubmissionsByHierarchy(
      submissions,
      "CORPORATE",
      null,
      standaloneDepts,
      new Set(),
      null,
      { isDceo: true, currentUserId: "dceo-1" },
    ).map((s) => s.submissionId);

    expect(dceoIds).toEqual(["sub-div", "sub-ssu", "sub-ceo-direct"]);

    const adminIds = filterSubmissionsByHierarchy(
      submissions,
      "CORPORATE",
      null,
      standaloneDepts,
    ).map((s) => s.submissionId);

    expect(adminIds).toEqual(["sub-div", "sub-ssu"]);
  });

  it("evaluates canReviewLogbookOwner consistently for DCEO CEO-Office reports", () => {
    const dceoUser = { employeeId: "dceo-1", role: "DCEO" };
    const sbuDept = {
      departmentId: "dept-sbu",
      head: { employeeId: "sbu-mgr" },
      division: { divisionId: "div-1", head: { employeeId: "dir-1" } },
    };
    const ssuDept = {
      departmentId: "dept-ssu",
      head: { employeeId: "ssu-mgr" },
      division: null,
    };

    expect(
      canReviewLogbookOwner(
        {
          employeeId: "emp-1",
          role: "NORMAL",
          managerId: "ceo-1",
          manager: { employeeId: "ceo-1", role: "CEO" },
        },
        dceoUser,
        [sbuDept, ssuDept],
      ),
    ).toBe(true);

    expect(
      canReviewLogbookOwner(
        { employeeId: "dir-1", role: "DIRECTOR", managerId: null },
        dceoUser,
        [sbuDept, ssuDept],
      ),
    ).toBe(true);

    expect(
      canReviewLogbookOwner(
        { employeeId: "ssu-mgr", role: "MANAGER", managerId: null },
        dceoUser,
        [sbuDept, ssuDept],
      ),
    ).toBe(true);

    expect(
      canReviewLogbookOwner(
        { employeeId: "sbu-mgr", role: "MANAGER", managerId: null },
        dceoUser,
        [sbuDept, ssuDept],
      ),
    ).toBe(false);

    expect(
      canReviewLogbookOwner(
        {
          employeeId: "emp-2",
          role: "NORMAL",
          managerId: "sbu-mgr",
          manager: { employeeId: "sbu-mgr", role: "MANAGER" },
        },
        dceoUser,
        [sbuDept, ssuDept],
      ),
    ).toBe(false);
  });
});
