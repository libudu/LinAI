import {
  VISION_ENDPOINT_PRESET_INFOS,
  resolveVisionApiKey,
} from '@/shared/vision/endpoints'
import { z } from 'zod'
import {
  asLegacyRecord,
  settingsRegistry,
} from '../../common/settings/registry'
import { dataPath } from '../../common/storage/data-path'
import { visionSettingsSchema, type VisionSettings } from '../vision/settings'

// Eagle 图片管理模块设置：注册式存储，落盘 data/eagle/config.json
export const eagleSettingsSchema = z.object({
  /** Eagle 资源库（.library 目录）的绝对路径 */
  libraryPath: z.string().nullable(),
})

export type EagleSettings = z.infer<typeof eagleSettingsSchema>

const DEFAULT_EAGLE_SETTINGS: EagleSettings = {
  libraryPath: null,
}

// 旧版扁平 config.json（无信封）→ value
const migrateLegacy = (raw: unknown): EagleSettings =>
  asLegacyRecord(raw) as EagleSettings

settingsRegistry.register<EagleSettings>('eagle', {
  file: dataPath('eagle', 'config.json'),
  defaults: DEFAULT_EAGLE_SETTINGS,
  schema: eagleSettingsSchema,
  migrateLegacy,
})

/** 服务端内部读取（合并默认值） */
export const getEagleSettings = async (): Promise<EagleSettings> =>
  (await settingsRegistry.get<EagleSettings>('eagle')).value

// Eagle 目录树展开状态：前端消费的 UI 偏好，借注册式设置落盘到后端，data/eagle/folder-tree.json
export const eagleFolderTreeSchema = z.object({
  /** 展开的文件夹 id 列表；null 表示从未记录（首次进入默认全展开） */
  expandedFolderIds: z.array(z.string()).nullable(),
})

export type EagleFolderTreeSettings = z.infer<typeof eagleFolderTreeSchema>

settingsRegistry.register<EagleFolderTreeSettings>('eagle-folder-tree', {
  file: dataPath('eagle', 'folder-tree.json'),
  defaults: { expandedFolderIds: null },
  schema: eagleFolderTreeSchema,
})

// Eagle 手动选择文件夹记录：前端在整理步骤手动选择文件夹的记录与计数，data/eagle/manual-folders.json
export const eagleManualFolderItemSchema = z.object({
  folderId: z.string(),
  folderPath: z.string(),
  count: z.number().int().nonnegative(),
})

export const eagleManualFoldersSchema = z.object({
  folders: z.array(eagleManualFolderItemSchema),
})

export type EagleManualFolderItem = z.infer<typeof eagleManualFolderItemSchema>
export type EagleManualFoldersSettings = z.infer<
  typeof eagleManualFoldersSchema
>

settingsRegistry.register<EagleManualFoldersSettings>('eagle-manual-folders', {
  file: dataPath('eagle', 'manual-folders.json'),
  defaults: { folders: [] },
  schema: eagleManualFoldersSchema,
})

// Eagle 视觉接入点设置：与图片生成的 vision 配置互相独立，落盘 data/eagle/vision.json
export type EagleVisionSettings = VisionSettings

const DEFAULT_EAGLE_VISION_ENDPOINT = VISION_ENDPOINT_PRESET_INFOS[0]

const DEFAULT_EAGLE_VISION_SETTINGS: EagleVisionSettings = {
  visionBaseUrl: DEFAULT_EAGLE_VISION_ENDPOINT.baseUrl,
  visionModelId: DEFAULT_EAGLE_VISION_ENDPOINT.modelId,
  visionCustomEndpoints: [],
  visionPresetApiKeys: {},
}

settingsRegistry.register<EagleVisionSettings>('eagle-vision', {
  file: dataPath('eagle', 'vision.json'),
  defaults: DEFAULT_EAGLE_VISION_SETTINGS,
  schema: visionSettingsSchema,
})

/** 服务端内部读取（合并默认值） */
export const getEagleVisionSettings = async (): Promise<EagleVisionSettings> =>
  (await settingsRegistry.get<EagleVisionSettings>('eagle-vision')).value

/** 服务端内部读取当前生效的视觉接入点（镜像 vision/settings 的 getVisionEndpoint） */
export const getEagleVisionEndpoint = async () => {
  const settings = await getEagleVisionSettings()
  const preset = VISION_ENDPOINT_PRESET_INFOS.find(
    (item) =>
      item.baseUrl === settings.visionBaseUrl &&
      item.modelId === settings.visionModelId,
  )
  const custom = settings.visionCustomEndpoints.find(
    (item) =>
      item.baseUrl === settings.visionBaseUrl &&
      item.modelId === settings.visionModelId &&
      Boolean(item.title?.trim()),
  )
  const baseUrl = preset
    ? preset.baseUrl
    : custom
      ? custom.baseUrl
      : DEFAULT_EAGLE_VISION_ENDPOINT.baseUrl
  const modelId = preset
    ? preset.modelId
    : custom
      ? custom.modelId
      : DEFAULT_EAGLE_VISION_ENDPOINT.modelId
  return {
    baseUrl,
    modelId,
    apiKey: resolveVisionApiKey(settings),
  }
}
