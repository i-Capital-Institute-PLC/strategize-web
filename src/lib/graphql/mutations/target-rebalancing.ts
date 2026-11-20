import { gql } from '@apollo/client';

export const SWEEP_DEPARTURE_QUOTA = gql`
  mutation SweepDepartureQuota($input: SweepDepartureInput!) {
    sweepDepartureQuota(input: $input) {
      success
      message
      sweptAmount
      transactionsCount
    }
  }
`;

export const DISTRIBUTE_HOLDING_POOL_QUOTA = gql`
  mutation DistributeHoldingPoolQuota($input: DistributeHoldingPoolQuotaInput!) {
    distributeHoldingPoolQuota(input: $input) {
      success
      message
      distributedAmount
      transactionsCount
    }
  }
`;

export const PROCESS_INTERNAL_TRANSFER = gql`
  mutation ProcessInternalTransfer($input: ProcessInternalTransferInput!) {
    processInternalTransfer(input: $input) {
      success
      message
      sweptAmount
      transactionsCount
    }
  }
`;

export const PROCESS_ROLE_TRANSITION = gql`
  mutation ProcessRoleTransition($input: ProcessRoleTransitionInput!) {
    processRoleTransition(input: $input) {
      success
      message
      sweptAmount
      distributedAmount
      transactionsCount
    }
  }
`;

export const SET_DIVISION_CASCADE_RESERVE = gql`
  mutation SetDivisionCascadeReserve($input: ReserveDivisionPoolInput!) {
    setDivisionCascadeReserve(input: $input) {
      success
      message
      sweptAmount
      transactionsCount
    }
  }
`;

export const SURRENDER_DEPT_TO_DIVISION = gql`
  mutation SurrenderDepartmentPoolToDivision($input: SurrenderDeptToDivisionInput!) {
    surrenderDepartmentPoolToDivision(input: $input) {
      success
      message
      sweptAmount
      transactionsCount
    }
  }
`;

export const REALLOCATE_DIVISION_POOL_TO_DEPT = gql`
  mutation ReallocateDivisionPoolToDepartment($input: ReallocateDivisionPoolInput!) {
    reallocateDivisionPoolToDepartment(input: $input) {
      success
      message
      distributedAmount
      transactionsCount
    }
  }
`;

export const REQUEST_DEPARTURE_CLEARANCE = gql`
  mutation RequestDepartureClearance($input: RequestDepartureClearanceInput!) {
    requestDepartureClearance(input: $input) {
      departureClearanceRequestId
      organizationId
      departmentId
      employeeId
      annualStrategicPeriodId
      requestedById
      effectiveDate
      reason
      status
      sweptAmount
      createdAt
    }
  }
`;

export const APPROVE_DEPARTURE_CLEARANCE = gql`
  mutation ApproveDepartureClearance($input: ApproveDepartureClearanceInput!) {
    approveDepartureClearance(input: $input) {
      success
      message
      sweptAmount
      transactionsCount
    }
  }
`;

export const REJECT_DEPARTURE_CLEARANCE = gql`
  mutation RejectDepartureClearance($input: RejectDepartureClearanceInput!) {
    rejectDepartureClearance(input: $input) {
      departureClearanceRequestId
      status
      rejectionReason
      reviewedAt
    }
  }
`;

