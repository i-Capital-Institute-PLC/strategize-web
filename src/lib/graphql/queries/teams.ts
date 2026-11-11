import { gql } from '@apollo/client';

/**
 * Team Queries
 */
export const GET_TEAMS = gql`
  query GetTeams(
    $page: Int!
    $limit: Int!
    $search: String
    $departmentId: ID
    $divisionId: ID
  ) {
    teams(
      page: $page
      limit: $limit
      search: $search
      departmentId: $departmentId
      divisionId: $divisionId
    ) {
      items {
        teamId
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
        teamLead {
          employeeId
          fullName
          email
          picture
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

export const GET_TEAM = gql`
  query GetTeam($teamId: ID!) {
    team(teamId: $teamId) {
      teamId
      name
      description
      isActive
      isDeleted
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
      teamLead {
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
