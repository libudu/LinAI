// 图片模板：前端拥有的业务数据，后端通用存储不理解这些字段

/** 模板业务字段（StoredItem.value 的内容） */
export interface TemplateValue {
  title?: string
  images: string[]
  prompt: string
  aspectRatio?: string
  folder?: string
  n?: number
}

/**
 * 旧版扁平结构：任务快照（task.rawTemplate）与兼容接口（/api/template）仍在使用。
 * 新增代码应使用 TemplateValue + StoredItem 信封。
 */
export interface TaskTemplate extends TemplateValue {
  id: string
  createdAt: number
}

/** 试生成任务使用的占位模板标题 */
export const TRIAL_TEMPLATE_TITLE = 'Trial Template'
