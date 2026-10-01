/** Eagle 业务错误，由全局接口错误处理映射为统一信封。 */
export class EagleError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 404 | 409 | 500,
    message: string,
  ) {
    super(message)
    this.name = 'EagleError'
  }
}
