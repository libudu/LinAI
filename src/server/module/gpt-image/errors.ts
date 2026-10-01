/** 提交前可预期的业务错误；意外异常由全局 onError 映射为 500。 */
export class ImageSubmissionError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message)
  }
}
