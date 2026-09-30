/** 轻量并发工作池，控制最大并发量 */
export const runPool = async <T>(
  list: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) => {
  let cursor = 0
  const lanes = Array.from(
    { length: Math.min(concurrency, list.length) },
    async () => {
      while (cursor < list.length) {
        const item = list[cursor++]
        await worker(item)
      }
    },
  )
  const results = await Promise.allSettled(lanes)
  const failed = results.find((result) => result.status === 'rejected')
  if (failed?.status === 'rejected') throw failed.reason
}
