// AI 局部修改（patch）的编辑操作定义：一种操作的一切定义收敛在本文件。
// 纯前端概念，后端无感知（故不放在 src/shared）。
//
// 新增操作类型只需三步：加一个 Op 接口 → 加入 ArtifactEditOp 联合 → 在 EDIT_OP_DEFS 加一项 def；
// 入参校验（parsePatch）、顺序应用（applyPatch）、diff 预览标签、模型 prompt 的操作清单全部自动跟随

// ---------- 操作类型 ----------

export interface ReplaceTextOp {
  op: 'replace-text'
  find: string // 要替换的原文，必须在文段中恰好出现一次
  content: string // 新文本
}

export interface InsertAfterOp {
  op: 'insert-after'
  find: string // 定位原文，必须在文段中恰好出现一次
  content: string // 插入到其后的文本
}

export interface DeleteTextOp {
  op: 'delete-text'
  find: string // 要删除的原文，必须在文段中恰好出现一次
}

export interface AppendOp {
  op: 'append'
  content: string // 追加到文末的文本
}

export type ArtifactEditOp =
  | ReplaceTextOp
  | InsertAfterOp
  | DeleteTextOp
  | AppendOp

export interface ArtifactPatch {
  operations: ArtifactEditOp[]
}

// ---------- 操作定义模式 ----------

// 一种操作的统一定义：UI 标签、模型 prompt 示例、入参校验、具体执行
export interface EditOpDef<O extends ArtifactEditOp = ArtifactEditOp> {
  /** UI 中文名（diff 预览与结果摘要共用） */
  label: string
  /** 模型 prompt 中的 JSON 示例行（buildPatchTask 据此生成操作清单） */
  promptHint: string
  /** 入参校验：模型输出的原始 JSON → 类型化操作，不合法抛错（where 为「第 N 个操作」） */
  validate: (raw: any, where: string) => O
  /** 具体执行：应用到文段内容（find 的唯一性由 applyEditOp 统一保证，此处直接替换） */
  apply: (content: string, op: O) => string
}

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0

// 带 find 的操作共用的入参校验：find 非空 + content 为字符串
const validateFindContent = (
  raw: any,
  where: string,
): { find: string; content: string } => {
  if (!isNonEmptyString(raw.find)) {
    throw new Error(`${where}（${raw.op}）缺少有效的 find`)
  }
  if (typeof raw.content !== 'string') {
    throw new Error(`${where}（${raw.op}）缺少 content`)
  }
  return { find: raw.find, content: raw.content }
}

const validateFind = (raw: any, where: string): { find: string } => {
  if (!isNonEmptyString(raw.find)) {
    throw new Error(`${where}（${raw.op}）缺少有效的 find`)
  }
  return { find: raw.find }
}

// 操作注册表：key 即 op 名
export const EDIT_OP_DEFS: {
  [O in ArtifactEditOp as O['op']]: EditOpDef<O>
} = {
  'replace-text': {
    label: '替换',
    promptHint:
      '{"op": "replace-text", "find": "要替换的原文", "content": "新文本"}',
    validate: (raw, where) => ({
      op: 'replace-text',
      ...validateFindContent(raw, where),
    }),
    apply: (content, op) => content.replace(op.find, op.content),
  },
  'insert-after': {
    label: '插入',
    promptHint:
      '{"op": "insert-after", "find": "定位原文", "content": "插入到其后的文本"}',
    validate: (raw, where) => ({
      op: 'insert-after',
      ...validateFindContent(raw, where),
    }),
    apply: (content, op) => content.replace(op.find, op.find + op.content),
  },
  'delete-text': {
    label: '删除',
    promptHint: '{"op": "delete-text", "find": "要删除的原文"}',
    validate: (raw, where) => ({
      op: 'delete-text',
      ...validateFind(raw, where),
    }),
    apply: (content, op) => content.replace(op.find, ''),
  },
  append: {
    label: '文末追加',
    promptHint: '{"op": "append", "content": "追加到文末的文本"}',
    validate: (raw, where) => {
      if (!isNonEmptyString(raw.content)) {
        throw new Error(`${where}（append）缺少有效的 content`)
      }
      return { op: 'append', content: raw.content }
    },
    apply: (content, op) => content + op.content,
  },
}

// ---------- 统一入口（parsePatch / applyPatch 调用） ----------

// 校验一个原始操作：op 名查注册表，再交给对应 def 校验入参
export const validateEditOp = (raw: any, index: number): ArtifactEditOp => {
  const where = `第 ${index + 1} 个操作`
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${where}不是对象`)
  }
  const def = (EDIT_OP_DEFS as Record<string, EditOpDef | undefined>)[raw.op]
  if (!def) {
    throw new Error(`${where}的 op 无法识别：${String(raw.op)}`)
  }
  return def.validate(raw, where)
}

// 统计子串出现次数（非重叠）
const countOccurrences = (haystack: string, needle: string): number => {
  if (!needle) return 0
  let count = 0
  let i = 0
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    count++
    i += needle.length
  }
  return count
}

// 应用一个操作：带 find 的操作统一做唯一性校验（安全原则：不唯一即抛错，
// 绝不允许静默错误应用），再交给对应 def 执行
export const applyEditOp = (
  content: string,
  op: ArtifactEditOp,
  index: number,
): string => {
  const where = `第 ${index + 1} 个操作（${op.op}）`
  if ('find' in op) {
    const count = countOccurrences(content, op.find)
    if (count === 0) {
      throw new Error(
        `${where}的 find 未在文段中出现：「${op.find.slice(0, 30)}…」`,
      )
    }
    if (count > 1) {
      throw new Error(
        `${where}的 find 在文段中出现 ${count} 次，必须恰好一次：「${op.find.slice(0, 30)}…」`,
      )
    }
  }
  return (EDIT_OP_DEFS[op.op] as EditOpDef).apply(content, op)
}
