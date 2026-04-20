import type {QueryClient, QueryKey} from '@tanstack/react-query'

export type QuerySnapshot<T = unknown> = [QueryKey, T | undefined]

export async function snapshotQueries<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
): Promise<QuerySnapshot<T>[]> {
  await queryClient.cancelQueries({queryKey})
  return queryClient.getQueriesData<T>({queryKey})
}

export function restoreQuerySnapshots<T>(
  queryClient: QueryClient,
  snapshots: QuerySnapshot<T>[],
) {
  for (const [queryKey, value] of snapshots) {
    queryClient.setQueryData(queryKey, value)
  }
}

export function runInBackground(task: Promise<unknown>) {
  void task
}
