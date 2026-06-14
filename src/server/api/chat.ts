import { zValidator } from '@hono/zod-validator'
import fs from 'fs-extra'
import { Hono } from 'hono'
import path from 'path'
import { z } from 'zod'
import { getYunwuApiKey } from '../common/config'
import { INPUT_IMAGES_DIR } from '../common/static'
import { INPUT_IMAGES_API_PATH } from '../common/static/enum'
import { createChatCompletion } from '../module/chat'

const chatContentPartSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('text'),
      text: z.string().min(1, 'Text content is required'),
    })
    .loose(),
  z
    .object({
      type: z.literal('image_url'),
      image_url: z.object({
        url: z.string().min(1, 'Image URL is required'),
      }),
    })
    .loose(),
])

const chatMessageSchema = z
  .object({
    role: z.string().min(1, 'Role is required'),
    content: z.union([
      z.string().min(1, 'Content is required'),
      z.array(chatContentPartSchema).min(1, 'Content is required'),
    ]),
  })
  .loose()

const chatCompletionSchema = z
  .object({
    model: z.string().min(1, 'Model is required'),
    messages: z.array(chatMessageSchema).min(1, 'Messages are required'),
    stream: z.boolean().optional(),
  })
  .loose()

function getLocalInputImageFilename(rawUrl: string) {
  const url = rawUrl.trim()

  if (!url) {
    return null
  }

  if (url.startsWith('data:image/')) {
    return null
  }

  let pathname = url

  if (/^https?:\/\//i.test(url)) {
    try {
      const parsedUrl = new URL(url)
      const isLocalHost = ['localhost', '127.0.0.1'].includes(
        parsedUrl.hostname,
      )
      if (!isLocalHost) {
        return null
      }
      pathname = parsedUrl.pathname
    } catch (error) {
      throw new Error('Image URL is invalid')
    }
  }

  if (!pathname.startsWith('/')) {
    throw new Error('Only uploaded local images are supported')
  }

  if (!pathname.startsWith(INPUT_IMAGES_API_PATH)) {
    throw new Error('Only uploaded local images are supported')
  }

  const filename = pathname.slice(INPUT_IMAGES_API_PATH.length + 1)
  if (!filename || filename !== path.basename(filename)) {
    throw new Error('Image path is invalid')
  }

  return filename
}

async function resolveImageUrl(rawUrl: string) {
  const localFilename = getLocalInputImageFilename(rawUrl)
  if (!localFilename) {
    return rawUrl
  }

  const filePath = path.join(INPUT_IMAGES_DIR, localFilename)
  if (!filePath.startsWith(INPUT_IMAGES_DIR)) {
    throw new Error('Image path is invalid')
  }

  if (!(await fs.pathExists(filePath))) {
    throw new Error('Image does not exist')
  }

  const buffer = await fs.readFile(filePath)
  const ext = path.extname(localFilename).slice(1).toLowerCase()
  const mimeType = ext === 'jpg' ? 'jpeg' : ext || 'webp'

  return `data:image/${mimeType};base64,${buffer.toString('base64')}`
}

async function resolveMessageContent(
  content: string | z.infer<typeof chatContentPartSchema>[],
) {
  if (typeof content === 'string') {
    return content
  }

  return await Promise.all(
    content.map(async (part) => {
      if (part.type !== 'image_url') {
        return part
      }

      return {
        ...part,
        image_url: {
          ...part.image_url,
          url: await resolveImageUrl(part.image_url.url),
        },
      }
    }),
  )
}

const chatApi = new Hono().post(
  '/completions',
  zValidator('json', chatCompletionSchema),
  async (c) => {
    const apiKey = getYunwuApiKey()
    if (!apiKey) {
      return c.json(
        { success: false as const, error: 'API Key is not configured' },
        400,
      )
    }

    const body = c.req.valid('json')
    const normalizedBody = {
      ...body,
      messages: await Promise.all(
        body.messages.map(async (message) => ({
          ...message,
          content: await resolveMessageContent(message.content),
        })),
      ),
    }
    const result = await createChatCompletion({
      apiKey,
      body: normalizedBody,
    })

    return c.json(result.data as any, result.status as any)
  },
)

export default chatApi
