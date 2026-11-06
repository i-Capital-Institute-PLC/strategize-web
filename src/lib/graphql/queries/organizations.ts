import { gql } from "@apollo/client";

export const GET_ORGANIZATION = gql`
  query GetOrganization($organizationId: ID!) {
    organization(organizationId: $organizationId) {
      organizationId
      name
      description
    }
  }
`;

export const GET_ORGANIZATIONS = gql`
  query GetOrganizations($search: String, $page: Int, $limit: Int) {
    organizations(search: $search, page: $page, limit: $limit) {
      items {
        organizationId
        name
        description
      }
      meta {
        totalItems
        totalPages
        currentPage
      }
    }
  }
`;
