import type { VisionSettings } from '@/server/module/vision/settings'
import { resolveVisionApiKey } from '@/shared/vision/endpoints'
import { create } from 'zustand'
import { RefreshQueue } from './refresh-queue'
import { settingsClient } from './settings'
import { subscribeStorageEvent } from './storage-events'

export type VisionConfigPatch = Partial<VisionSettings>

interface VisionSettingsState extends VisionSettings {
  visionApiKey: string | null
  revision: number
  loaded: boolean
  error: Error | null
  fetchConfig: () => Promise<void>
  saveConfig: (patch: VisionConfigPatch) => Promise<void>
}

/** 两个独立视觉配置共用同步机制，字段类型来自它们共用的服务端 schema。 */
export function createVisionSettingsStore(resource: 'vision' | 'eagle-vision') {
  const client = settingsClient<VisionSettings>(resource)
  return create<VisionSettingsState>()((set, get) => {
    const apply = (value: VisionSettings, revision: number) => {
      if (revision < get().revision) return
      if (get().loaded && revision === get().revision) {
        set({ error: null })
        return
      }
      set({
        ...value,
        revision,
        loaded: true,
        error: null,
        visionApiKey: resolveVisionApiKey(value),
      })
    }
    const queue = new RefreshQueue(async () => {
      try {
        const result = await client.get()
        apply(result.value, result.revision)
      } catch (reason) {
        const error =
          reason instanceof Error ? reason : new Error(String(reason))
        set({ error })
        throw error
      }
    })
    let subscribed = false
    const fetchConfig = () => {
      if (!subscribed) {
        subscribed = true
        subscribeStorageEvent(`settings.${resource}`, () => {
          void queue.request().catch(() => undefined)
        })
      }
      return queue.request()
    }
    return {
      visionBaseUrl: '',
      visionModelId: '',
      visionCustomEndpoints: [],
      visionPresetApiKeys: {},
      visionApiKey: null,
      revision: 0,
      loaded: false,
      error: null,
      fetchConfig,
      saveConfig: async (patch) => {
        if (!get().loaded) await fetchConfig()
        const state = get()
        const next: VisionSettings = {
          visionBaseUrl: state.visionBaseUrl,
          visionModelId: state.visionModelId,
          visionCustomEndpoints: state.visionCustomEndpoints,
          visionPresetApiKeys: state.visionPresetApiKeys,
          ...patch,
        }
        try {
          const result = await client.put(next, state.revision)
          apply(result.value, result.revision)
        } catch (error) {
          // 冲突后拉取实际值，不重放旧表单覆盖其他设备的修改。
          void queue.request().catch(() => undefined)
          throw error
        }
      },
    }
  })
}
