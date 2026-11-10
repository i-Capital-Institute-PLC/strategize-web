import { useQuery, useMutation } from '@apollo/client';
import { toast } from 'sonner';
import { GET_UNITS, GET_UNIT } from '@/lib/graphql/queries/units';
import { CREATE_UNIT, UPDATE_UNIT, REMOVE_UNIT } from '@/lib/graphql/mutations/units';

// ===================== TYPES =====================

export interface UnitMember {
  employeeId: string;
  fullName: string;
  email?: string;
  picture?: string;
  title?: string;
}

export interface Unit {
  unitId: string;
  name: string;
  description?: string;
  isActive: boolean;
  division?: {
    divisionId: string;
    name: string;
  };
  department?: {
    departmentId: string;
    name: string;
    division?: {
      divisionId: string;
      name: string;
    };
  };
  unitLead?: {
    employeeId: string;
    fullName: string;
    email?: string;
    picture?: string;
    title?: string;
  };
  members?: UnitMember[];
  createdAt: string;
  updatedAt: string;
}

interface PaginationMeta {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  itemCount: number;
}

// ===================== QUERY HOOKS =====================

export const useUnits = (variables: {
  page?: number;
  limit?: number;
  search?: string;
  departmentId?: string;
  divisionId?: string;
  organizationId?: string;
} = {}) => {
  const { page = 1, limit = 20, ...rest } = variables;
  const { data, loading, error, refetch } = useQuery(GET_UNITS, {
    variables: { page, limit, ...rest },
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
  });

  return {
    units: (data?.units?.items || []) as Unit[],
    meta: data?.units?.meta as PaginationMeta | undefined,
    loading,
    error,
    refetch,
  };
};

export const useUnit = (unitId: string) => {
  const { data, loading, error, refetch } = useQuery(GET_UNIT, {
    variables: { unitId },
    skip: !unitId,
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
  });

  return {
    unit: data?.unit as Unit | undefined,
    loading,
    error,
    refetch,
  };
};

// ===================== MUTATION HOOKS =====================

export const useUnitMutations = () => {
  const [createUnitMutation, { loading: createLoading }] = useMutation(CREATE_UNIT, {
    onCompleted: (data) => {
      toast.success('Unit created successfully!', {
        description: `"${data.createUnit.name}" has been created.`,
      });
    },
    onError: (error) => {
      toast.error('Failed to create unit', { description: error.message });
    },
    refetchQueries: ['GetUnits'],
    awaitRefetchQueries: true,
  });

  const [updateUnitMutation, { loading: updateLoading }] = useMutation(UPDATE_UNIT, {
    onCompleted: (data) => {
      toast.success('Unit updated successfully!', {
        description: `"${data.updateUnit.name}" has been updated.`,
      });
    },
    onError: (error) => {
      toast.error('Failed to update unit', { description: error.message });
    },
    refetchQueries: ['GetUnits', 'GetUnit'],
    awaitRefetchQueries: true,
  });

  const [removeUnitMutation, { loading: removeLoading }] = useMutation(REMOVE_UNIT, {
    onCompleted: (data) => {
      toast.success('Unit deleted successfully!', {
        description: data?.removeUnit?.name ? `"${data.removeUnit.name}" has been removed.` : 'Unit has been removed.',
      });
    },
    onError: (error) => {
      toast.error('Failed to delete unit', { description: error.message });
    },
    refetchQueries: ['GetUnits'],
    awaitRefetchQueries: true,
  });

  return {
    createUnit: async (input: {
      name: string;
      organizationId: string;
      description?: string;
      departmentId?: string;
      divisionId?: string;
      unitLeadUserId?: string;
      memberIds?: string[];
    }) => {
      const result = await createUnitMutation({
        variables: { createUnitInput: input },
      });
      return result.data?.createUnit;
    },

    updateUnit: async (input: {
      unitId: string;
      name?: string;
      description?: string;
      departmentId?: string;
      divisionId?: string;
      unitLeadUserId?: string;
      memberIds?: string[];
      isActive?: boolean;
      organizationId?: string;
    }) => {
      const result = await updateUnitMutation({
        variables: { updateUnitInput: input },
      });
      return result.data?.updateUnit;
    },

    removeUnit: async (unitId: string) => {
      const result = await removeUnitMutation({
        variables: { unitId },
      });
      return result.data?.removeUnit;
    },

    loading: {
      create: createLoading,
      update: updateLoading,
      remove: removeLoading,
    },
  };
};

