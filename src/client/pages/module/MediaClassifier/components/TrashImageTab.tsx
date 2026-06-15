import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Card, Empty, Modal, Spin, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import {
  deleteMediaImagePermanently,
  getMediaImages,
  restoreMediaImage,
} from '../api'
import type { MediaImageItem } from '../types'

const TRASH_PAGE_SIZE = 20

interface TrashImageTabProps {
  refreshKey: number
  onMutated: () => Promise<void> | void
}

const formatFileSize = (size: number) => {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function TrashPanel({
  items,
  total,
  hasMore,
  loading,
  loadingMore,
  actionKey,
  onLoadMore,
  onRestore,
  onDelete,
}: {
  items: MediaImageItem[]
  total: number
  hasMore: boolean
  loading: boolean
  loadingMore: boolean
  actionKey: string | null
  onLoadMore: () => Promise<void>
  onRestore: (relativePath: string) => Promise<void>
  onDelete: (relativePath: string) => Promise<void>
}) {
  const handleScroll = async (
    event: React.UIEvent<HTMLDivElement, UIEvent>,
  ) => {
    const target = event.currentTarget
    const reachedBottom =
      target.scrollTop + target.clientHeight >= target.scrollHeight - 64

    if (reachedBottom && hasMore && !loadingMore) {
      await onLoadMore()
    }
  }

  return (
    <Card
      className="border-slate-200 shadow-sm"
      title={`回收站（${total}）`}
      extra={
        <Typography.Text type="secondary">
          滚动到底部自动继续加载
        </Typography.Text>
      }
    >
      {loading ? (
        <div className="flex min-h-[180px] items-center justify-center">
          <Spin />
        </div>
      ) : items.length === 0 ? (
        <Empty description="回收站里还没有图片" />
      ) : (
        <div
          className="max-h-[480px] space-y-3 overflow-y-auto pr-1"
          onScroll={(event) => void handleScroll(event)}
        >
          {items.map((item) => (
            <div
              key={item.relativePath}
              className="flex gap-3 rounded-xl border border-slate-200 p-3"
            >
              <img
                src={item.thumbUrl}
                alt={item.name}
                className="h-24 w-24 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <Typography.Text
                    strong
                    className="truncate"
                    title={item.name}
                  >
                    {item.name}
                  </Typography.Text>
                </div>
                <div className="space-y-1 text-xs text-slate-500">
                  <div className="truncate">{item.relativePath}</div>
                  <div>
                    {formatFileSize(item.size)} ·{' '}
                    {dayjs(item.mtimeMs).format('YYYY-MM-DD HH:mm')}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    loading={actionKey === `${item.relativePath}:restore`}
                    onClick={() => void onRestore(item.relativePath)}
                  >
                    还原
                  </Button>
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    loading={
                      actionKey === `${item.relativePath}:permanent-delete`
                    }
                    onClick={() => void onDelete(item.relativePath)}
                  >
                    彻底删除
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {loadingMore && (
            <div className="flex justify-center py-2">
              <Spin size="small" />
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

export function TrashImageTab({ refreshKey, onMutated }: TrashImageTabProps) {
  const [trashItems, setTrashItems] = useState<MediaImageItem[]>([])
  const [trashTotal, setTrashTotal] = useState(0)
  const [trashPage, setTrashPage] = useState(1)
  const [trashHasMore, setTrashHasMore] = useState(false)
  const [trashLoading, setTrashLoading] = useState(false)
  const [trashLoadingMore, setTrashLoadingMore] = useState(false)
  const [actionKey, setActionKey] = useState<string | null>(null)

  const loadTrash = async (reset = false) => {
    const nextPage = reset ? 1 : trashPage + 1

    if (reset) {
      setTrashLoading(true)
    } else {
      setTrashLoadingMore(true)
    }

    try {
      const data = await getMediaImages('trash', nextPage, TRASH_PAGE_SIZE)
      setTrashItems((currentItems) =>
        reset ? data.items : [...currentItems, ...data.items],
      )
      setTrashTotal(data.total)
      setTrashPage(nextPage)
      setTrashHasMore(data.hasMore)
    } catch (error: any) {
      message.error(error.message || '获取回收站失败')
    } finally {
      setTrashLoading(false)
      setTrashLoadingMore(false)
    }
  }

  useEffect(() => {
    void loadTrash(true)
  }, [refreshKey])

  const handleRestore = async (relativePath: string) => {
    setActionKey(`${relativePath}:restore`)
    try {
      await restoreMediaImage(relativePath)
      await loadTrash(true)
      await onMutated()
      message.success('图片已还原')
    } catch (error: any) {
      message.error(error.message || '还原失败')
    } finally {
      setActionKey(null)
    }
  }

  const handlePermanentDelete = async (relativePath: string) => {
    Modal.confirm({
      title: '彻底删除图片',
      content: '该操作会直接删除源目录中的图片文件，且不可恢复，确定继续吗？',
      okButtonProps: { danger: true },
      onOk: async () => {
        setActionKey(`${relativePath}:permanent-delete`)
        try {
          await deleteMediaImagePermanently(relativePath)
          await loadTrash(true)
          await onMutated()
          message.success('图片已彻底删除')
        } catch (error: any) {
          message.error(error.message || '删除失败')
        } finally {
          setActionKey(null)
        }
      },
    })
  }

  return (
    <TrashPanel
      items={trashItems}
      total={trashTotal}
      hasMore={trashHasMore}
      loading={trashLoading}
      loadingMore={trashLoadingMore}
      actionKey={actionKey}
      onLoadMore={() => loadTrash(false)}
      onRestore={handleRestore}
      onDelete={handlePermanentDelete}
    />
  )
}
