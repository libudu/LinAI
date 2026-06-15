import { Empty, Pagination, Spin } from 'antd'
import type { MediaImageListResult } from '../../types'
import { MediaStatusImage } from './MediaStatusImage'

interface OriginalImageListProps {
  data: MediaImageListResult | null
  loading: boolean
  page: number
  onPageChange: (pageNumber: number) => void
}

export function OriginalImageList({
  data,
  loading,
  page,
  onPageChange,
}: OriginalImageListProps) {
  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Spin />
      </div>
    )
  }

  if (!data || data.items.length === 0) {
    return <Empty description="源目录里还没有可整理的图片" />
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6 lg:grid-cols-8">
        {data.items.map((item) => (
          <MediaStatusImage
            key={item.relativePath}
            item={item}
            rootClassName="aspect-3/4"
            imageClassName="object-cover"
          />
        ))}
      </div>

      <div className="flex justify-end">
        <Pagination
          current={page}
          pageSize={data.pageSize}
          total={data.total}
          showSizeChanger={false}
          onChange={onPageChange}
        />
      </div>
    </div>
  )
}
