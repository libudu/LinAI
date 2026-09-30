import type { OrganizeStatus } from '@/shared/eagle/organize'
import { useEffect } from 'react'
import { create } from 'zustand'
import {
  changeOptimisticItems,
  deriveStatus,
  isEqualStatus,
  reconcileOptimisticItems,
  type OptimisticItem,
  type OptimisticItems,
} from './statusModel'
import { OrganizeStatusRefresh } from './statusRefresh'

interface OrganizeState {
  serverStatus: OrganizeStatus | null
  status: OrganizeStatus | null
  optimisticItems: OptimisticItems
  loaded: boolean
  /** 每次有效校准递增，结果数量不变时也能刷新列表。 */
  revision: number
}

const useOrganizeStore = create<OrganizeState>(() => ({
  serverStatus: null,
  status: null,
  optimisticItems: {},
  loaded: false,
  revision: 0,
}))

const statusRefresh = new OrganizeStatusRefresh({
  getItems: () => useOrganizeStore.getState().optimisticItems,
  applyStatus: (serverStatus, settledIds) => {
    useOrganizeStore.setState((state) => {
      const optimisticItems = reconcileOptimisticItems(
        state.optimisticItems,
        settledIds,
        serverStatus?.createdAt,
      )
      const stableServer = isEqualStatus(state.serverStatus, serverStatus)
        ? state.serverStatus
        : serverStatus
      return {
        serverStatus: stableServer,
        status: deriveStatus(stableServer, optimisticItems),
        optimisticItems,
        loaded: true,
        revision: state.revision + 1,
      }
    })
  },
  onError: () => useOrganizeStore.setState({ loaded: true }),
})

export const refreshOrganizeStatus = statusRefresh.refresh

export function useOrganizeStatus() {
  const status = useOrganizeStore((s) => s.status)
  const serverStatus = useOrganizeStore((s) => s.serverStatus)
  const loaded = useOrganizeStore((s) => s.loaded)
  const revision = useOrganizeStore((s) => s.revision)
  useEffect(() => statusRefresh.subscribe(), [])
  return { status, serverStatus, loaded, revision }
}

const updateOptimisticItems = (
  ids: string[],
  taskCreatedAt: number,
  nextState: OptimisticItem['state'] | null,
) => {
  useOrganizeStore.setState((state) => {
    const optimisticItems = changeOptimisticItems(
      state.optimisticItems,
      ids,
      taskCreatedAt,
      nextState,
    )
    return {
      optimisticItems,
      status: deriveStatus(state.serverStatus, optimisticItems),
    }
  })
}

/** 同一 ID 同时只能有一个本地操作；卸载后的提交仍持有记录直到校准完成。 */
export const beginOptimisticItem = (
  itemId: string,
  taskCreatedAt: number,
): boolean => {
  const state = useOrganizeStore.getState()
  if (
    taskCreatedAt !== state.serverStatus?.createdAt ||
    state.optimisticItems[itemId]
  )
    return false
  const optimisticItems = {
    ...state.optimisticItems,
    [itemId]: { taskCreatedAt, state: 'queued' as const },
  }
  useOrganizeStore.setState({
    optimisticItems,
    status: deriveStatus(state.serverStatus, optimisticItems),
  })
  return true
}

export const getOptimisticItemIds = () =>
  new Set(Object.keys(useOrganizeStore.getState().optimisticItems))

export const isCurrentOrganizeTask = (createdAt: number) =>
  useOrganizeStore.getState().serverStatus?.createdAt === createdAt

export const markOptimisticItemsSubmitting = (
  ids: string[],
  taskCreatedAt: number,
) => {
  statusRefresh.invalidate()
  updateOptimisticItems(ids, taskCreatedAt, 'submitting')
}

/** 失败直接删除乐观操作即可回补，无需反向修改服务端计数。 */
export const cancelOptimisticItems = (ids: string[], taskCreatedAt: number) => {
  if (ids.length === 0) return
  statusRefresh.invalidate()
  updateOptimisticItems(ids, taskCreatedAt, null)
}

export const settleOptimisticItems = async (
  ids: string[],
  taskCreatedAt: number,
) => {
  statusRefresh.invalidate()
  updateOptimisticItems(ids, taskCreatedAt, 'settled')
  await refreshOrganizeStatus()
}
