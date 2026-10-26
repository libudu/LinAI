/** 提取 chat/completions 的正文，兼容字符串和文本分段数组。 */
export const extractChatCompletionText = (data: unknown): string => {
  const content = (
    data as {
      choices?: Array<{ message?: { content?: unknown } }>
    } | null
  )?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .filter(
      (item): item is { type: 'text'; text: string } =>
        typeof item === 'object' &&
        item !== null &&
        (item as { type?: unknown }).type === 'text' &&
        typeof (item as { text?: unknown }).text === 'string',
    )
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join('\n')
}
