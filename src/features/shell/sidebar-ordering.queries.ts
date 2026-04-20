import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import { rpcAdapter } from '../../platform/data/rpc-adapter'
import type { SidebarOrderEntry } from './sidebar-ordering'

type SidebarItemOrderRow = {
  out_item_id: string
  out_item_type: string
  out_position: number
}

function sidebarOrderQueryKey(workspaceId: string) {
  return ['sidebar-item-order', workspaceId] as const
}

export function sidebarOrderQueryOptions(workspaceId: string) {
  return queryOptions({
    enabled: !!workspaceId,
    gcTime: Infinity,
    queryFn: async (): Promise<SidebarOrderEntry[]> => {
      const rows = await rpcAdapter.call<SidebarItemOrderRow[]>(
        'get_workspace_sidebar_item_orders',
        { target_workspace_id: workspaceId },
      )
      return (rows ?? []).map((row) => ({
        type: row.out_item_type as SidebarOrderEntry['type'],
        id: row.out_item_id,
      }))
    },
    queryKey: sidebarOrderQueryKey(workspaceId),
    staleTime: 60_000,
  })
}

export function useReorderSidebarItemsMutation(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (orderedItems: SidebarOrderEntry[]) =>
      rpcAdapter.call('reorder_workspace_sidebar_items', {
        target_workspace_id: workspaceId,
        ordered_items: orderedItems,
      }),
    onMutate: (orderedItems) => {
      const previousOrder = queryClient.getQueryData<SidebarOrderEntry[]>(
        sidebarOrderQueryKey(workspaceId),
      )
      queryClient.setQueryData(sidebarOrderQueryKey(workspaceId), orderedItems)
      return { previousOrder }
    },
    onError: (_error, _orderedItems, context) => {
      if (context?.previousOrder) {
        queryClient.setQueryData(
          sidebarOrderQueryKey(workspaceId),
          context.previousOrder,
        )
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: sidebarOrderQueryKey(workspaceId),
      })
    },
  })
}
