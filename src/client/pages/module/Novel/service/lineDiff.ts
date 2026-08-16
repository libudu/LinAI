// 行级文本对比（LCS）：自实现，不引入 diff 库。
// 用于版本面板的「两版本对比」；小说文段按行拆分后规模有限（几百行），O(n×m) 可接受，
// 行数乘积过大时退化为整段替换（极端长文保底）

export interface DiffLine {
  type: 'same' | 'add' | 'del'
  text: string
}

export const diffLines = (a: string, b: string): DiffLine[] => {
  const al = a.split('\n')
  const bl = b.split('\n')
  const n = al.length
  const m = bl.length
  if (n * m > 4_000_000) {
    return [
      ...al.map((text) => ({ type: 'del' as const, text })),
      ...bl.map((text) => ({ type: 'add' as const, text })),
    ]
  }

  // LCS 长度表（扁平 Uint32Array，回溯需要完整表）
  const w = m + 1
  const dp = new Uint32Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] =
        al[i] === bl[j]
          ? dp[(i + 1) * w + j + 1] + 1
          : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (al[i] === bl[j]) {
      out.push({ type: 'same', text: al[i] })
      i++
      j++
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
      out.push({ type: 'del', text: al[i] })
      i++
    } else {
      out.push({ type: 'add', text: bl[j] })
      j++
    }
  }
  while (i < n) out.push({ type: 'del', text: al[i++] })
  while (j < m) out.push({ type: 'add', text: bl[j++] })
  return out
}

// 展示用条目：过长的相同段折叠为一条「相同 N 行」，变化处前后各保留 context 行
export type DiffDisplayItem = DiffLine | { type: 'collapse'; count: number }

export const collapseSameRuns = (
  lines: DiffLine[],
  context = 2,
  maxRun = 6,
): DiffDisplayItem[] => {
  const out: DiffDisplayItem[] = []
  let i = 0
  while (i < lines.length) {
    if (lines[i].type !== 'same') {
      out.push(lines[i])
      i++
      continue
    }
    let j = i
    while (j < lines.length && lines[j].type === 'same') j++
    const run = lines.slice(i, j)
    if (run.length <= maxRun) {
      out.push(...run)
    } else {
      out.push(...run.slice(0, context))
      out.push({ type: 'collapse', count: run.length - context * 2 })
      out.push(...run.slice(run.length - context))
    }
    i = j
  }
  return out
}
