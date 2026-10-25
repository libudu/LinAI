import type { OrganizeStatus } from '@/shared/eagle/organize'
import type { EagleMediaType } from '@/shared/eagle/types'
import { useEffect } from 'react'
import { create } from 'zustand'
import { useOrganizeMedia } from './media'
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

const createOrganizeSession = (mediaType: EagleMediaType) => {
  const useOrganizeStore = create<OrganizeState>(() => ({
    serverStatus: null,
    status: null,
    optimisticItems: {},
    loaded: false,
    revision: 0,
  }))

  const statusRefresh = new OrganizeStatusRefresh(mediaType, {
    getItems: () => useOrganizeStore.getState().optimisticItems,
    applyStatus: (serverStatus, settledIds) => {
      useOrganizeStore.setState((state) => {
        const optimisticItems = reconcileOptimisticItems(
          state.optimisticItems,
          settledIds,
          serverStatus?.taskId,
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

  const refreshOrganizeStatus = statusRefresh.refresh

  const updateOptimisticItems = (
    ids: string[],
    taskId: string,
    nextState: OptimisticItem['state'] | null,
  ) => {
    useOrganizeStore.setState((state) => {
      const optimisticItems = changeOptimisticItems(
        state.optimisticItems,
        ids,
        taskId,
        nextState,
      )
      return {
        optimisticItems,
        status: deriveStatus(state.serverStatus, optimisticItems),
      }
    })
  }

  /** 同一 ID 同时只能有一个本地操作；卸载后的提交仍持有记录直到校准完成。 */
  const beginOptimisticItem = (itemId: string, taskId: string): boolean => {
    const state = useOrganizeStore.getState()
    if (taskId !== state.serverStatus?.taskId || state.optimisticItems[itemId])
      return false
    const optimisticItems = {
      ...state.optimisticItems,
      [itemId]: { taskId, state: 'queued' as const },
    }
    useOrganizeStore.setState({
      optimisticItems,
      status: deriveStatus(state.serverStatus, optimisticItems),
    })
    return true
  }

  const getOptimisticItemIds = () =>
    new Set(Object.keys(useOrganizeStore.getState().optimisticItems))

  const isCurrentOrganizeTask = (taskId: string) =>
    useOrganizeStore.getState().serverStatus?.taskId === taskId

  const markOptimisticItemsSubmitting = (ids: string[], taskId: string) => {
    statusRefresh.invalidate()
    updateOptimisticItems(ids, taskId, 'submitting')
  }

  /** 失败直接删除乐观操作即可回补，无需反向修改服务端计数。 */
  const cancelOptimisticItems = (ids: string[], taskId: string) => {
    if (ids.length === 0) return
    statusRefresh.invalidate()
    updateOptimisticItems(ids, taskId, null)
  }

  const settleOptimisticItems = async (ids: string[], taskId: string) => {
    statusRefresh.invalidate()
    updateOptimisticItems(ids, taskId, 'settled')
    await refreshOrganizeStatus()
  }

  return {
    useStore: useOrganizeStore,
    subscribe: statusRefresh.subscribe,
    actions: {
      refreshOrganizeStatus,
      beginOptimisticItem,
      getOptimisticItemIds,
      isCurrentOrganizeTask,
      markOptimisticItemsSubmitting,
      cancelOptimisticItems,
      settleOptimisticItems,
    },
  }
}

const sessions = {
  image: createOrganizeSession('image'),
  video: createOrganizeSession('video'),
}

/** 每类媒体独立缓存、乐观操作、订阅和刷新版本。 */
export function useOrganizeStatus(mediaType?: EagleMediaType) {
  const context = useOrganizeMedia()
  const session = sessions[mediaType ?? context.mediaType]
  const status = session.useStore((state) => state.status)
  const serverStatus = session.useStore((state) => state.serverStatus)
  const loaded = session.useStore((state) => state.loaded)
  const revision = session.useStore((state) => state.revision)
  useEffect(() => session.subscribe(), [session])
  return { status, serverStatus, loaded, revision }
}

export const useOrganizeActions = () =>
  sessions[useOrganizeMedia().mediaType].actions
