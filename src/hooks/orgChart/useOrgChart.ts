import { useQuery } from '@apollo/client';
import { GET_ORG_CHART } from '@/lib/graphql/queries/orgChart';
import { useAuthStore } from '@/stores';

export interface OrgChartEmployee {
  employeeId: string;
  fullName: string;
  title?: string;
  picture?: string;
}

export interface OrgChartNode {
  id: string;
  legacyId?: string | null;
  name: string;
  subtitle?: string | null;
  color?: string | null;
  level: number;
  parentId?: string | null;
  nodeTypeId?: string | null;
  nodeType?: { nodeTypeId: string; name: string; icon?: string; color?: string } | null;
  employees: OrgChartEmployee[];
  children: OrgChartNode[];
}

export function useOrgChart() {
  const user = useAuthStore((s) => s.user);
  const organizationId = user?.organizationId;

  const { data, loading, error, refetch } = useQuery(GET_ORG_CHART, {
    variables: { organizationId },
    skip: !organizationId,
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
  });

  // API returns an array of root trees. Prioritize the Level 0 corporate root,
  // and attach any disconnected/orphan root nodes so nothing is ever omitted.
  const nodes: OrgChartNode[] = data?.getOrgChart ?? [];
  let root: OrgChartNode | null = null;
  if (nodes.length > 0) {
    const corporateRoot = nodes.find((n) => n.level === 0) ?? nodes[0];
    const otherRoots = nodes.filter((n) => n.id !== corporateRoot.id);
    if (otherRoots.length > 0) {
      root = {
        ...corporateRoot,
        children: [...corporateRoot.children, ...otherRoots],
      };
    } else {
      root = corporateRoot;
    }
  }

  return { root, nodes, loading, error, refetch };
}
