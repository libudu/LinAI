import { performance } from 'node:perf_hooks'

export const indexNow = () => performance.now()

export const indexElapsed = (startedAt: number) =>
  `${Math.round(indexNow() - startedAt)} ms`
