import { gql } from "@apollo/client";

export const GET_ORGANIZATION = gql`
  query GetOrganization($organizationId: ID!) {
    organization(organizationId: $organizationId) {
      organizationId
      name
      shortName
    }
  }
`;

export const GET_ORGANIZATIONS = gql`
  query GetOrganizations($search: String, $page: Int, $limit: Int) {
    organizations(search: $search, page: $page, limit: $limit) {
      items {
        organizationId
        name
        shortName
      }
      meta {
        totalItems
        totalPages
        currentPage
      }
    }
  }
`;

