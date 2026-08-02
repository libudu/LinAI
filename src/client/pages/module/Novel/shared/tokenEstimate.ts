// token 粗估（启发式，不引入 tiktoken）：tokens ≈ 中文字符数 × 0.8 + 英文单词数 × 1.3

export const estimateTokens = (text: string): number => {
  // 中日韩表意文字（含扩展 A 区）
  const cjkChars = (text.match(/[一-鿿㐀-䶿]/g) || []).length
  // 连续的字母/数字串按一个英文单词计
  const latinWords = (text.match(/[a-zA-Z0-9]+/g) || []).length
  return Math.ceil(cjkChars * 0.8 + latinWords * 1.3)
}

// 各模型上下文窗口（总 token 数），未列出的模型回退到默认值
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'deepseek-chat': 128_000,
  'deepseek-reasoner': 128_000,
}

export const DEFAULT_CONTEXT_WINDOW = 128_000

export const getContextWindow = (modelId?: string | null): number =>
  (modelId && MODEL_CONTEXT_WINDOWS[modelId]) || DEFAULT_CONTEXT_WINDOW

// 上下文占用告警阈值：超过 80% 黄色警告，超过 100% 红色并禁止提交
export const CONTEXT_WARN_RATIO = 0.8
