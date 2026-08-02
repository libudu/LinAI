import type { AppType } from '@/server'
import { hc } from 'hono/client'
import type { MediaImageItem, MediaWorkspaceSnapshot } from './types'

const client = hc<AppType>('/')

type ApiResponse<T> =
  | {
      success: true
      data: T
    }
  | {
      success: false
      error?: string
    }

const unwrapResponse = async <T>(response: Response) => {
  const json = (await response.json()) as ApiResponse<T>
  if (!json.success) {
    throw new Error(json.error || '请求失败')
  }

  return json.data
}

export const getMediaWorkspace = async () =>
  unwrapResponse<MediaWorkspaceSnapshot>(
    await client.api['media-classifier'].workspace.$get(),
  )

export const saveMediaWorkspace = async (
  sourceDir: string,
  resultDir: string,
) =>
  unwrapResponse<MediaWorkspaceSnapshot>(
    await client.api['media-classifier'].workspace.$post({
      json: {
        sourceDir,
        resultDir,
      },
    }),
  )

export const getAllMediaImages = async () =>
  unwrapResponse<MediaImageItem[]>(
    await client.api['media-classifier'].images.all.$get(),
  )

export const deleteMediaImagePermanently = async (relativePath: string) =>
  unwrapResponse<MediaWorkspaceSnapshot>(
    await client.api['media-classifier'].trash.delete.$post({
      json: {
        relativePath,
      },
    }),
  )
