import type { GptImageQuality, GptImageSize } from '@/shared/image/params'
import type { TaskInputSnapshot } from '@/shared/image/template'

/** 云端生图返回并保存在任务中的 token 用量 */
export interface GptImageUsage {
  total_tokens: number
  input_tokens: number
  output_tokens: number
  input_tokens_details?: {
    text_tokens: number
    image_tokens: number
  }
  output_tokens_details?: {
    text_tokens: number
    image_tokens: number
  }
}

/** ComfyUI 执行信息；旧任务和云端任务可不包含这些字段 */
export interface ComfyTaskMetadata {
  /** 原接入点 ID，重试时仍使用该接入点当前引用的工作流 */
  comfyEndpointId?: string
  /** 本次执行使用的工作流 ID */
  comfyWorkflowId?: string
  /** 提交时的地址与 prompt_id，用于取消原任务 */
  comfyBaseUrl?: string
  comfyPromptId?: string
}

/**
 * 生成任务：后端拥有并流转状态的数据，前端只能读取与删除，
 * 不开放通用存储写接口（见 docs/文件系统简化改造方案.md §7.2）
 */
export interface Task extends ComfyTaskMetadata {
  id: string
  mode?: 'generate' | 'trial'
  /** 任务创建时的输入快照（不可变），不是对模板存储的引用 */
  inputSnapshot: TaskInputSnapshot
  source: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  error?: string
  finishedAt?: number
  duration?: number
  outputUrl?: string
  outputUrls?: string[]
  createdAt: number
  size?: GptImageSize
  quality?: GptImageQuality
  gptTokenUsage?: GptImageUsage
}

/** 存储层按信封保存：id/createdAt 在信封上，value 为其余字段 */
export type TaskRecord = Omit<Task, 'id' | 'createdAt'>

/** 任务变更在 change bus 上的资源 ID（后端专用，不注册到通用存储） */
export const TASKS_RESOURCE = 'image.tasks'
