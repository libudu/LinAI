import { Card, Empty, Image, Pagination, Spin, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import type { MediaImageItem, MediaImageListResult } from '../types'

const PAGE_SIZE = 18

const formatFileSize = (size: number) => {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

interface ScreenedImageTabProps {
  images: MediaImageItem[]
  loading: boolean
  refreshKey: number
}

export function ScreenedImageTab({
  images,
  loading,
  refreshKey,
}: ScreenedImageTabProps) {
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [refreshKey])

  useEffect(() => {
    const maxPage = Math.max(Math.ceil(images.length / PAGE_SIZE), 1)
    setPage((currentPage) => Math.min(currentPage, maxPage))
  }, [images.length])

  const data = useMemo<MediaImageListResult | null>(() => {
    if (images.length === 0) {
      return null
    }

    const start = (page - 1) * PAGE_SIZE
    const end = start + PAGE_SIZE
    return {
      items: images.slice(start, end),
      total: images.length,
      page,
      pageSize: PAGE_SIZE,
      hasMore: end < images.length,
    }
  }, [images, page])

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Spin />
      </div>
    )
  }

  if (!data || data.items.length === 0) {
    return (
      <Card className="border-slate-200 shadow-sm">
        <Empty description="还没有被保留的图片" />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card
        className="border-slate-200 shadow-sm"
        classNames={{ body: 'p-4! md:p-5!' }}
      >
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <Typography.Title level={5} className="mb-1!">
              筛选后的图片
            </Typography.Title>
            <Typography.Text type="secondary">
              这里展示当前浏览器本地标记为保留的图片。
            </Typography.Text>
          </div>
          <Tag color="success">本地保留标记</Tag>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((item) => (
            <Card
              key={item.relativePath}
              size="small"
              className="overflow-hidden border-slate-200"
              classNames={{ body: 'p-3!' }}
            >
              <div className="space-y-3">
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                  <Image
                    src={item.previewUrl}
                    alt={item.name}
                    classNames={{
                      root: 'block w-full',
                      image: 'h-52 w-full object-cover',
                    }}
                  />
                </div>
                <div>
                  <Typography.Text strong className="block truncate">
                    {item.name}
                  </Typography.Text>
                  <Typography.Text type="secondary" className="text-xs">
                    {item.relativePath}
                  </Typography.Text>
                </div>
                <div className="text-xs text-slate-500">
                  {formatFileSize(item.size)} ·{' '}
                  {dayjs(item.mtimeMs).format('YYYY-MM-DD HH:mm')}
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <Pagination
            current={page}
            pageSize={data.pageSize}
            total={data.total}
            showSizeChanger={false}
            onChange={setPage}
          />
        </div>
      </Card>
    </div>
  )
}
