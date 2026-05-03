import type { TaskTemplate } from '../../server/common/template-manager'

/**
 * 导出的模板数据接口（图片字段使用 base64 编码）
 */
export interface TaskTemplateForExport extends Omit<TaskTemplate, 'images'> {
  images: string[]
}

/**
 * 预设导出文件的数据结构
 */
export interface PresetExportData {
  /** 导出文件格式版本号 */
  version: string
  /** 导出时间的 ISO 时间戳 */
  exportDate: string
  /** 可选的作者信息 */
  author?: string
  /** 可选的附言 */
  message?: string
  /** 导出的模板列表 */
  templates: TaskTemplateForExport[]
}
