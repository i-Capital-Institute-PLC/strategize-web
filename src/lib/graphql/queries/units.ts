import { gql } from '@apollo/client';

/**
 * Unit Queries
 */
export const GET_UNITS = gql`
  query GetUnits(
    $page: Int!
    $limit: Int!
    $search: String
    $departmentId: ID
    $divisionId: ID
    $organizationId: ID
  ) {
    units(
      page: $page
      limit: $limit
      search: $search
      departmentId: $departmentId
      divisionId: $divisionId
      organizationId: $organizationId
    ) {
      items {
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
          division {
            divisionId
            name
          }
        }
        unitLead {
          employeeId
          fullName
          email
          picture
          title
        }
        members {
          employeeId
          fullName
          email
          picture
          title
        }
        createdAt
        updatedAt
      }
      meta {
        totalItems
        totalPages
        currentPage
        itemsPerPage
        itemCount
      }
    }
  }
`;

export const GET_UNIT = gql`
  query GetUnit($unitId: ID!) {
    unit(unitId: $unitId) {
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
        division {
          divisionId
          name
        }
      }
      unitLead {
        employeeId
        fullName
        email
        picture
        title
      }
      members {
        employeeId
        fullName
        email
        picture
        title
      }
      createdAt
      updatedAt
    }
  }
`;

