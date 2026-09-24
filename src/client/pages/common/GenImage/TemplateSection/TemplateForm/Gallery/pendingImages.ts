import {
  StorageApiError,
  collectionClient,
  type CollectionListResult,
} from '@/client/service/storage'
import { INPUT_IMAGES_API_PATH } from '@/server/common/static/enum'
import type { CollectionBatchOperation } from '@/shared/storage/types'
import { create } from 'zustand'

type PendingImage = { url: string }

const RESOURCE = 'image.pending'
const client = collectionClient<PendingImage>(RESOURCE)

const isInputUrl = (url: string) =>
  url.startsWith(`${INPUT_IMAGES_API_PATH}/`)

const imageId = (url: string) => `pending-${url.slice(url.lastIndexOf('/') + 1)}`

// 多设备写入时以集合 revision 检测冲突并重试；单次批量最多 500 条。
const mutatePending = async (
  build: (
    snapshot: CollectionListResult<PendingImage>,
  ) => CollectionBatchOperation<PendingImage>[],
): Promise<CollectionListResult<PendingImage>> => {
  let conflicts = 0
  while (true) {
    const snapshot = await client.list()
    const operations = build(snapshot).slice(0, 500)
    if (operations.length === 0) return snapshot
    try {
      await client.batch(operations, snapshot.revision)
      conflicts = 0
    } catch (error) {
      if (
        error instanceof StorageApiError &&
        error.code === 'REVISION_CONFLICT' &&
        conflicts++ < 5
      ) {
        continue
      }
      throw error
    }
  }
}

let operationQueue = Promise.resolve()
const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
  const result = operationQueue.then(operation, operation)
  operationQueue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

interface PendingImagesState {
  urls: string[]
  loaded: boolean
  load: () => Promise<void>
  add: (url: string) => Promise<void>
  remove: (urls: string[]) => Promise<void>
}

export const usePendingImages = create<PendingImagesState>()((set) => {
  const apply = (snapshot: CollectionListResult<PendingImage>) => {
    const urls = [
      ...new Set(
        snapshot.items
          .map((item) => item.value.url)
          .filter((url) => typeof url === 'string' && isInputUrl(url)),
      ),
    ]
    set((state) =>
      state.loaded &&
      state.urls.length === urls.length &&
      state.urls.every((url, index) => url === urls[index])
        ? state
        : { urls, loaded: true },
    )
  }

  return {
    urls: [],
    loaded: false,
    load: () =>
      enqueue(async () => {
        apply(await client.list())
      }),
    add: (url) =>
      enqueue(async () => {
        if (!isInputUrl(url)) throw new Error('无效的输入图片地址')
        const snapshot = await mutatePending(({ items }) =>
          items.some((item) => item.value.url === url)
            ? []
            : [{ type: 'create', id: imageId(url), value: { url } }],
        )
        apply(snapshot)
      }),
    remove: (urls) =>
      enqueue(async () => {
        if (urls.length === 0) return
        const target = new Set(urls)
        const snapshot = await mutatePending(({ items }) =>
          items
            .filter((item) => target.has(item.value.url))
            .map((item) => ({ type: 'delete' as const, id: item.id })),
        )
        apply(snapshot)
      }),
  }
})
