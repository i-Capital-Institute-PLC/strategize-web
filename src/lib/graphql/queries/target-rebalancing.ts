import { gql } from '@apollo/client';

export const GET_DEPARTMENT_HOLDING_POOL = gql`
  query GetDepartmentHoldingPool(
    $departmentId: String!
    $annualStrategicPeriodId: String!
  ) {
    departmentHoldingPool(
      departmentId: $departmentId
      annualStrategicPeriodId: $annualStrategicPeriodId
    ) {
      kpiId
      kpiName
      unitType
      measurementUnit
      annualDepartmentTarget
      quarters {
        quarterNumber
        departmentTarget
        assignedActiveTarget
        poolBalance
        totalHarvested
        totalDistributed
      }
    }
  }
`;

export const GET_TARGET_ADJUSTMENT_LEDGER = gql`
  query GetTargetAdjustmentLedger(
    $departmentId: String!
    $annualStrategicPeriodId: String!
  ) {
    targetAdjustmentLedger(
      departmentId: $departmentId
      annualStrategicPeriodId: $annualStrategicPeriodId
    ) {
      targetAdjustmentLedgerId
      quarterNumber
      transactionType
      amount
      reason
      prorationRatio
      prorationDays
      totalQuarterDays
      createdAt
      sourceEmployee {
        employeeId
        fullName
      }
      destinationEmployee {
        employeeId
        fullName
      }
      approvedBy {
        employeeId
        fullName
      }
      kpi {
        kpiId
        name
      }
    }
  }
`;

export const GET_DIVISION_HOLDING_POOL = gql`
  query GetDivisionHoldingPool(
    $divisionId: String!
    $annualStrategicPeriodId: String!
  ) {
    divisionHoldingPool(
      divisionId: $divisionId
      annualStrategicPeriodId: $annualStrategicPeriodId
    ) {
      kpiId
      kpiName
      unitType
      measurementUnit
      annualDivisionTarget
      quarters {
        quarterNumber
        divisionTarget
        assignedDepartmentsTarget
        poolBalance
        totalHarvested
        totalDistributed
      }
    }
  }
`;

export const GET_DIVISION_ADJUSTMENT_LEDGER = gql`
  query GetDivisionAdjustmentLedger(
    $divisionId: String!
    $annualStrategicPeriodId: String!
  ) {
    divisionAdjustmentLedger(
      divisionId: $divisionId
      annualStrategicPeriodId: $annualStrategicPeriodId
    ) {
      targetAdjustmentLedgerId
      quarterNumber
      transactionType
      amount
      reason
      createdAt
      kpi {
        kpiId
        name
      }
      department {
        departmentId
        name
      }
      destinationDepartment {
        departmentId
        name
      }
      approvedBy {
        employeeId
        fullName
      }
    }
  }
`;

export const GET_DEPARTURE_CLEARANCE_REQUESTS = gql`
  query GetDepartureClearanceRequests(
    $departmentId: String
    $status: DepartureClearanceStatus
  ) {
    departureClearanceRequests(
      departmentId: $departmentId
      status: $status
    ) {
      departureClearanceRequestId
      organizationId
      departmentId
      employeeId
      annualStrategicPeriodId
      requestedById
      effectiveDate
      reason
      status
      reviewedById
      reviewedAt
      rejectionReason
      sweptAmount
      createdAt
      updatedAt
      employee {
        employeeId
        fullName
        title
        email
      }
      department {
        departmentId
        name
      }
      requestedBy {
        employeeId
        fullName
        email
      }
      reviewedBy {
        employeeId
        fullName
        email
      }
    }
  }
`;

