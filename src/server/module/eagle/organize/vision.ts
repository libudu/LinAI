import type { OrganizeFolderStandard } from '@/shared/eagle/organize'
import {
  ORGANIZE_VISION_USER_TEXT,
  buildOrganizeVisionSystemPrompt,
} from '@/shared/eagle/organize'
import fs from 'fs-extra'
import sharp from 'sharp'
import { z } from 'zod'
import { requestRegistry } from '../../../common/relay'
import { getItemEntry, getItemFilePath } from '../library'
import {
  EAGLE_VISION_IMAGE_MAX_DIMENSION,
  EAGLE_VISION_IMAGE_QUALITY,
} from './constants'

/**
 * 单图视觉判定：压缩（内存中，不落盘）→ 组装 prompt → 经 eagle.vision 中继调用
 * → 严格 JSON 解析（zod）+ folderPaths 匹配校验。
 * 任何一步失败都抛 Error，由执行器记为 failed（含失败原因）。
 */

export interface VisionJudgeOutcome {
  title: string
  folderPaths: string[]
  lowQuality: boolean
}

const judgeResponseSchema = z.object({
  title: z.string().min(1).max(200),
  folderPaths: z.array(z.string().min(1)).max(3),
  lowQuality: z.boolean(),
})

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
}

/** 读取图片并转为 data URL；勾选压缩时在内存中缩放转 webp（不落盘） */
const loadImageDataUrl = async (
  filePath: string,
  ext: string,
  compress: boolean,
): Promise<string> => {
  if (compress) {
    const buffer = await sharp(filePath)
      .resize(
        EAGLE_VISION_IMAGE_MAX_DIMENSION,
        EAGLE_VISION_IMAGE_MAX_DIMENSION,
        {
          fit: 'inside',
          withoutEnlargement: true,
        },
      )
      .webp({ quality: EAGLE_VISION_IMAGE_QUALITY })
      .toBuffer()
    return `data:image/webp;base64,${buffer.toString('base64')}`
  }
  const buffer = await fs.readFile(filePath)
  const mime = MIME_BY_EXT[ext.toLowerCase()] ?? 'application/octet-stream'
  return `data:${mime};base64,${buffer.toString('base64')}`
}

/** 提取 chat/completions 返回的正文文本（content 为字符串或分段数组） */
const extractContentText = (data: unknown): string => {
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

/** 模型可能无视要求包一层 ```json 代码块，剥掉后再按严格 JSON 解析 */
const stripCodeFence = (text: string): string => {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return trimmed
  return trimmed
    .replace(/^```[a-zA-Z]*\s*/, '')
    .replace(/```\s*$/, '')
    .trim()
}

export const judgeItem = async (
  itemId: string,
  options: {
    compress: boolean
    standards: OrganizeFolderStandard[]
    /** 强制清空任务时中断上游请求 */
    signal?: AbortSignal
  },
): Promise<VisionJudgeOutcome> => {
  const entry = await getItemEntry(itemId)
  if (!entry) throw new Error('条目不存在或已从库中删除')
  const filePath = await getItemFilePath(itemId)
  if (!filePath || !(await fs.pathExists(filePath))) {
    throw new Error('条目原文件不存在')
  }

  const dataUrl = await loadImageDataUrl(filePath, entry.ext, options.compress)

  const response = await requestRegistry.execute(
    'eagle.vision',
    {
      path: '/chat/completions',
      body: {
        messages: [
          {
            role: 'system',
            content: buildOrganizeVisionSystemPrompt(options.standards),
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: ORGANIZE_VISION_USER_TEXT },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        stream: false,
      },
    },
    options.signal,
  )

  const responseText = await response.text()
  if (!response.ok) {
    let detail = responseText.slice(0, 300)
    try {
      const json = JSON.parse(responseText)
      detail = json?.error?.message || json?.message || detail
    } catch {
      /* 非 JSON 错误体直接用原文 */
    }
    throw new Error(
      `视觉服务返回 HTTP ${response.status}：${detail || '无错误详情'}`,
    )
  }

  let payload: unknown
  try {
    payload = JSON.parse(responseText)
  } catch {
    throw new Error('视觉服务返回内容不是 JSON')
  }
  const content = extractContentText(payload)
  if (!content) throw new Error('视觉服务返回内容为空')

  let parsed: unknown
  try {
    parsed = JSON.parse(stripCodeFence(content))
  } catch {
    throw new Error('视觉返回的内容不是合法 JSON')
  }
  const validated = judgeResponseSchema.safeParse(parsed)
  if (!validated.success) {
    throw new Error('视觉返回的 JSON 结构不符合要求')
  }
  if (
    new Set(validated.data.folderPaths).size !==
    validated.data.folderPaths.length
  ) {
    throw new Error('判定的候选文件夹存在重复项')
  }
  const unknownPath = validated.data.folderPaths.find(
    (folderPath) =>
      !options.standards.some((standard) => standard.folderPath === folderPath),
  )
  if (unknownPath) {
    throw new Error(
      `判定的文件夹不在分类标准中：${unknownPath}`,
    )
  }
  return validated.data
}
