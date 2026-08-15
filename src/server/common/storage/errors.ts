// 存储层结构化错误：读取失败、解析失败、不存在和版本冲突必须是不同的错误状态，
// 禁止底层捕获后返回空数组/空对象
export type StorageErrorCode =
  | 'NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'CORRUPT'
  | 'READ_FAILED'
  | 'WRITE_FAILED'
  | 'INVALID_RESOURCE'
  | 'PAYLOAD_TOO_LARGE'

export class StorageError extends Error {
  readonly code: StorageErrorCode
  /** 附加信息，如版本冲突时携带 currentRevision */
  readonly details?: Record<string, unknown>

  constructor(
    code: StorageErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'StorageError'
    this.code = code
    this.details = details
  }
}
