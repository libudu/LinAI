/**
 * 资源级串行队列：原子替换只能防止半文件，不能解决两个读改写请求互相覆盖。
 * 同一资源 key 的修改进入同一个 Promise 队列，依次执行。
 */
export class ResourceLock {
  private readonly tails = new Map<string, Promise<unknown>>()

  readonly run = <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const tail = this.tails.get(key) ?? Promise.resolve()
    const result = tail.then(task)
    // 队尾使用已捕获失败的 Promise，避免一次失败阻塞后续任务
    this.tails.set(
      key,
      result.catch(() => undefined),
    )
    return result
  }
}

export const resourceLock = new ResourceLock()
