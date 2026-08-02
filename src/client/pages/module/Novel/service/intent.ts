// 欢迎页提交后的首发生成意图判断：由模型将用户要求分类为 设定 / 大纲 / 正文
import { chatOnce } from './llm'

export type FirstIntent = 'setting' | 'outline' | 'content'

// 分类失败（无网络/上游报错等）时回退为 setting——模块的标准第一步
export const classifyFirstIntent = async (
  instruction: string,
): Promise<FirstIntent> => {
  try {
    const res = await chatOnce({
      messages: [
        {
          role: 'system',
          content:
            '你是意图分类器。判断用户接下来想直接得到哪类产出，只回答一个英文单词：' +
            'setting（世界观/角色/背景等小说设定）、' +
            'outline（章节大纲/剧情大纲）、' +
            'content（直接创作小说正文）。' +
            '不要输出任何其他内容。',
        },
        { role: 'user', content: instruction },
      ],
      temperature: 0,
    })
    if (res.includes('content')) return 'content'
    if (res.includes('outline')) return 'outline'
    return 'setting'
  } catch {
    return 'setting'
  }
}
