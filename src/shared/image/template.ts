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

/** 扁平化的模板：StoredItem 信封展平后的形状，供表单与展示使用 */
export interface FlatTemplate extends TemplateValue {
  id: string
  createdAt: number
}

/**
 * 任务输入快照：任务创建时冻结的生成参数，与模板存储无引用关系。
 * 形状与 FlatTemplate 相同，但 id/createdAt 只是快照记录，不指向任何模板
 */
export type TaskInputSnapshot = FlatTemplate

/** 试生成任务使用的占位模板标题 */
export const TRIAL_TEMPLATE_TITLE = 'Trial Template'
