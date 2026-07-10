import { zValidator } from '@hono/zod-validator'
import fs from 'fs-extra'
import { Hono } from 'hono'
import path from 'path'
import { z } from 'zod'
import { getYunwuApiKey } from '../common/config'
import { INPUT_IMAGES_DIR } from '../common/static'
import { INPUT_IMAGES_API_PATH } from '../common/static/enum'
import { createChatCompletion } from '../module/chat'

const STYLE_ANALYZE_MODEL = 'gemini-3.1-flash-lite'

export interface StyleAnalysis {
  media_style: string
  camera_lens: string
  composition: string
  color_palette: string
  lighting: string
  texture_effects: string
  subject_main: string
  subject_detail: string
  environment: string
  ui_text: string
  atmosphere: string
  art_reference: string
}

const styleAnalyzeSchema = z.object({
  imageUrl: z.string().min(1, 'Image URL is required'),
})

const SYSTEM_PROMPT = `你是一个专业的图片风格分析助手。请仔细观察用户提供的图片，从以下12个维度分析其画风构成，并以 JSON 格式返回结果。

返回格式必须严格如下，不要添加任何说明文字，不要使用 markdown 代码块：

{
  "media_style": "整体媒介、艺术风格、载体形式，例如：数字绘画、赛博朋克、浮世绘、胶片摄影",
  "camera_lens": "拍摄视角、镜头类型、取景方式，例如：广角仰拍、长焦特写、鱼眼镜头",
  "composition": "画面布局、主体位置、画幅比例，例如：中心对称构图、三分法、对角线构图",
  "color_palette": "主色调、饱和度、冷暖倾向，例如：莫兰迪色系、高饱和冷暖对比、单色调",
  "lighting": "光源方向、光质、阴影特点，例如：侧逆光、柔光箱效果、伦勃朗光",
  "texture_effects": "噪点、颗粒、扫描线、暗角等后期效果，例如：胶片颗粒感、暗角效果、锐化边缘",
  "subject_main": "核心主体外貌、形态、动作、表情，例如：一名年轻女子，长发，微笑站立",
  "subject_detail": "穿戴、材质、妆容等细部刻画，例如：丝绸长裙、金属项链、淡妆",
  "environment": "场景、地点、物件、天气，例如：城市街道夜景、樱花树下、蒸汽朋克工坊",
  "ui_text": "画面中的文字、字幕、界面元素，例如：底部中文白色字幕、顶部游戏HUD、无",
  "atmosphere": "整体心理感受、情绪关键词，例如：宁静、孤独、热血澎湃、神秘",
  "art_reference": "关联的艺术家、作品、文化符号，例如：美树本晴彦风格、吉卜力色调、穆夏装饰纹样"
}

对于每个维度：
- 如果图片中能观察到相关内容，请提炼为紧凑的关键词描述（用中文顿号连接）。
- 如果图片中观察不到该维度相关内容，返回空字符串 ""。
- 描述要精炼，适合直接用于生图提示词。`

function getLocalImageFilename(rawUrl: string): string | null {
  const url = rawUrl.trim()

  if (!url || url.startsWith('data:image/')) {
    return null
  }

  let pathname = url

  if (/^https?:\/\//i.test(url)) {
    try {
      const parsedUrl = new URL(url)
      if (!['localhost', '127.0.0.1'].includes(parsedUrl.hostname)) {
        return null
      }
      pathname = parsedUrl.pathname
    } catch {
      throw new Error('[服务] Image URL is invalid')
    }
  }

  if (!pathname.startsWith('/') || !pathname.startsWith(INPUT_IMAGES_API_PATH)) {
    throw new Error('[服务] Only uploaded local images are supported')
  }

  const filename = pathname.slice(INPUT_IMAGES_API_PATH.length + 1)
  if (!filename || filename !== path.basename(filename)) {
    throw new Error('[服务] Image path is invalid')
  }

  return filename
}

async function resolveImageUrl(rawUrl: string): Promise<string> {
  const localFilename = getLocalImageFilename(rawUrl)
  if (!localFilename) {
    return rawUrl
  }

  const filePath = path.join(INPUT_IMAGES_DIR, localFilename)
  if (!filePath.startsWith(INPUT_IMAGES_DIR)) {
    throw new Error('[服务] Image path is invalid')
  }

  if (!(await fs.pathExists(filePath))) {
    throw new Error('[服务] Image does not exist')
  }

  const buffer = await fs.readFile(filePath)
  const ext = path.extname(localFilename).slice(1).toLowerCase()
  const mimeType = ext === 'jpg' ? 'jpeg' : ext || 'webp'

  return `data:image/${mimeType};base64,${buffer.toString('base64')}`
}

function isStyleAnalysis(value: unknown): value is StyleAnalysis {
  if (!value || typeof value !== 'object') return false
  const keys: (keyof StyleAnalysis)[] = [
    'media_style', 'camera_lens', 'composition', 'color_palette',
    'lighting', 'texture_effects', 'subject_main', 'subject_detail',
    'environment', 'ui_text', 'atmosphere', 'art_reference',
  ]
  const obj = value as Record<string, unknown>
  return keys.every((k) => typeof obj[k] === 'string')
}

function extractJsonFromResponse(content: unknown): unknown {
  if (typeof content !== 'string') return null

  const trimmed = content.trim()

  try { return JSON.parse(trimmed) } catch { /* continue */ }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()) } catch { /* continue */ }
  }

  const braceMatch = trimmed.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    const cleaned = braceMatch[0]
      .replace(/'/g, '"')
      .replace(/,\s*}/g, '}')
    try { return JSON.parse(cleaned) } catch { /* continue */ }
  }

  return null
}

const styleAnalyzeApi = new Hono().post(
  '/analyze',
  zValidator('json', styleAnalyzeSchema),
  async (c) => {
    const apiKey = getYunwuApiKey()
    if (!apiKey) {
      return c.json(
        { success: false as const, error: '[配置] API Key is not configured' },
        400,
      )
    }

    const { imageUrl } = c.req.valid('json')

    let resolvedUrl: string
    try {
      resolvedUrl = await resolveImageUrl(imageUrl)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '[服务] Invalid image URL'
      return c.json({ success: false as const, error: message }, 400)
    }

    const result = await createChatCompletion({
      apiKey,
      body: {
        model: STYLE_ANALYZE_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: resolvedUrl },
              },
              {
                type: 'text',
                text: SYSTEM_PROMPT,
              },
            ],
          },
        ],
      },
    })

    if (result.status !== 200) {
      const errorData = result.data as Record<string, unknown> | undefined
      const error = typeof errorData?.error === 'string'
        ? errorData.error
        : '[yunwu.ai] Style analysis failed'
      return c.json({ success: false as const, error }, 500)
    }

    const data = result.data as Record<string, unknown> | undefined
    const content: unknown = data?.choices !== undefined
      && Array.isArray(data.choices)
      && data.choices.length > 0
      ? (data.choices[0] as Record<string, unknown>)?.message !== undefined
        && typeof (data.choices[0] as Record<string, unknown>).message === 'object'
        ? ((data.choices[0] as Record<string, unknown>).message as Record<string, unknown>)?.content
        : undefined
      : undefined

    const parsed = extractJsonFromResponse(content)

    if (!parsed) {
      return c.json(
        { success: false as const, error: '[服务] Failed to parse style analysis result' },
        500,
      )
    }

    if (!isStyleAnalysis(parsed)) {
      return c.json(
        { success: false as const, error: '[服务] Style analysis result has invalid format' },
        500,
      )
    }

    return c.json({ success: true as const, data: parsed })
  },
)

export default styleAnalyzeApi
