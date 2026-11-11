import { gql } from '@apollo/client';

/**
 * Unit Mutations
 */
export const CREATE_UNIT = gql`
  mutation CreateUnit($createUnitInput: CreateUnitInput!) {
    createUnit(createUnitInput: $createUnitInput) {
      unitId
      name
      description
      isActive
      division {
        divisionId
        name
      }
      department {
        departmentId
        name
      }
      unitLead {
        employeeId
        fullName
      }
      members {
        employeeId
        fullName
      }
      createdAt
    }
  }
`;

export const UPDATE_UNIT = gql`
  mutation UpdateUnit($updateUnitInput: UpdateUnitInput!) {
    updateUnit(updateUnitInput: $updateUnitInput) {
      unitId
      name
      description
      isActive
      division {
        divisionId
        name
      }
      department {
        departmentId
        name
      }
      unitLead {
        employeeId
        fullName
      }
      members {
        employeeId
        fullName
      }
      updatedAt
    }
  }
`;

export const REMOVE_UNIT = gql`
  mutation RemoveUnit($unitId: ID!) {
    removeUnit(unitId: $unitId) {
      unitId
      name
    }
  }
`;

