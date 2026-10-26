import { settingsClient } from '@/client/service/settings'
import type {
  EagleFolderSharingSettings,
  EagleSharingSettings,
} from '@/server/module/eagle/settings'
import { resolveSharedFolderIds } from '@/shared/eagle/sharing'
import { create } from 'zustand'
import { collectFolderKeys, findFolder } from '../folders'
import { useEagleConfig } from '../settings/useEagleConfig'
import { useEagleStore } from '../store'
import { ensureEagleOwnerSession } from './access'

export type FolderSharingView = 'hidden' | 'everyone' | 'user'
const VIEW_KEY = 'eagle_folder_sharing_view'
const client = settingsClient<EagleFolderSharingSettings>(
  'eagle-folder-sharing',
)
const usersClient = settingsClient<EagleSharingSettings>('eagle-sharing')
const initialView = (): FolderSharingView => {
  try {
    const value = localStorage.getItem(VIEW_KEY)
    if (value === 'everyone' || value === 'user') return value
  } catch {
    // 展示偏好不可用时默认隐藏，不影响服务端权限。
  }
  return 'hidden'
}

interface FolderSharingState {
  view: FolderSharingView
  selectedCode: string
  users: EagleSharingSettings['users']
  value: EagleFolderSharingSettings
  revision: number
  loaded: boolean
  loading: boolean
  saving: boolean
  error: string
  setView: (view: FolderSharingView) => void
  selectUser: (code: string) => void
  load: () => Promise<void>
  setFolderShared: (folderId: string, shared: boolean) => Promise<void>
}

let pendingLoad: Promise<void> | undefined

export const useFolderSharing = create<FolderSharingState>()((set, get) => ({
  view: initialView(),
  selectedCode: '',
  users: [],
  value: { libraries: [] },
  revision: 0,
  loaded: false,
  loading: false,
  saving: false,
  error: '',
  setView: (view) => {
    set({ view })
    try {
      localStorage.setItem(VIEW_KEY, view)
    } catch {
      // 当前页面仍保留选择。
    }
  },
  selectUser: (selectedCode) => set({ selectedCode }),
  load: () => {
    if (pendingLoad) return pendingLoad
    set({ loading: true, error: '' })
    pendingLoad = (async () => {
      try {
        await ensureEagleOwnerSession()
        const [permissions, sharing] = await Promise.all([
          client.get(),
          usersClient.get(),
        ])
        set({
          ...(permissions.revision >= get().revision
            ? { value: permissions.value, revision: permissions.revision }
            : {}),
          users: sharing.value.users,
          selectedCode: sharing.value.users.some(
            (user) => user.invitationCode === get().selectedCode,
          )
            ? get().selectedCode
            : '',
          loaded: true,
        })
      } catch (error) {
        set({
          loaded: false,
          error: error instanceof Error ? error.message : '加载共享权限失败',
        })
      } finally {
        pendingLoad = undefined
        set({ loading: false })
      }
    })()
    return pendingLoad
  },
  setFolderShared: async (folderId, shared) => {
    const state = get()
    const { libraryPath, libraryMode } = useEagleConfig.getState()
    if (
      !state.loaded ||
      state.loading ||
      state.saving ||
      !libraryPath ||
      libraryMode !== 'local'
    )
      return
    if (state.view === 'hidden') return
    if (
      state.view === 'user' &&
      !state.users.some((user) => user.invitationCode === state.selectedCode)
    )
      return
    const { folders, foldersLoading } = useEagleStore.getState()
    const folder = findFolder(folders, folderId)
    if (foldersLoading || !folder) return
    const libraries = structuredClone(state.value.libraries)
    let library = libraries.find((entry) => entry.libraryPath === libraryPath)
    if (!library) {
      library = { libraryPath, selectionVersion: 2, everyone: [], users: {} }
      libraries.push(library)
    }
    if (library.selectionVersion !== 2) {
      // 同时展开所有人的旧规则，避免修改当前用户时改变其他用户的授权范围。
      library.everyone = [
        ...resolveSharedFolderIds(folders, library.everyone, 1),
      ]
      library.users = Object.fromEntries(
        Object.entries(library.users).map(([code, ids]) => [
          code,
          [...resolveSharedFolderIds(folders, ids, 1)],
        ]),
      )
      library.selectionVersion = 2
    }
    const ids = new Set(
      state.view === 'everyone'
        ? library.everyone
        : (library.users[state.selectedCode] ?? []),
    )
    for (const id of collectFolderKeys([folder])) {
      if (shared) ids.add(id)
      else ids.delete(id)
    }
    const resolved = [...resolveSharedFolderIds(folders, [...ids])]
    if (state.view === 'everyone') library.everyone = resolved
    else library.users[state.selectedCode] = resolved
    set({ saving: true, error: '' })
    try {
      await ensureEagleOwnerSession()
      const result = await client.put({ libraries }, state.revision)
      if (result.revision >= get().revision)
        set({ value: result.value, revision: result.revision })
    } catch (error) {
      // 冲突或写盘失败不显示未落盘的开关状态，重新读取后再修改。
      await get().load()
      const text = error instanceof Error ? error.message : '保存共享权限失败'
      set({ error: text })
      throw error
    } finally {
      set({ saving: false })
    }
  },
}))
