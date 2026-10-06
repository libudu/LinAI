import {
  Alert,
  Button,
  Empty,
  Image,
  Pagination,
  Progress,
  Spin,
  Tabs,
} from 'antd'
import { useState } from 'react'
import { eaglePreviewUrl, eagleThumbnailUrl } from '../api'
import { useFormatConversion } from './hooks/useFormatConversion'

export function StepFormatConversion({
  open,
  onConverted,
}: {
  open: boolean
  onConverted: () => void
}) {
  const conversion = useFormatConversion(open, onConverted)
  const [view, setView] = useState<'candidates' | 'failed'>('candidates')
  const [failedPage, setFailedPage] = useState(1)
  const { data, failures, running, progress, pageSize } = conversion
  const failedItems = Object.values(failures)
  const retryableCount = failedItems.length
  const total = view === 'failed' ? failedItems.length : (data?.total ?? 0)
  const page =
    view === 'failed'
      ? Math.min(failedPage, Math.max(1, Math.ceil(total / pageSize)))
      : conversion.page
  const items =
    view === 'failed'
      ? failedItems.slice((page - 1) * pageSize, page * pageSize)
      : (data?.items ?? [])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="text-xs leading-5 text-slate-500">
        全库 HEIC/HEIF（不含回收站），不受当前文件夹影响。转换为原分辨率
        WebP，质量 90，并替换原文件。 WebP 为有损格式，不保留全部 EXIF/HDR
        信息；不支持的多图或序列会保留源图。转换后可到「01
        待添加」自行加入分类。
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="primary"
          disabled={running || conversion.loading || !data?.total}
          onClick={() => void conversion.run('all')}
        >
          转换全部（{data?.total ?? 0}）
        </Button>
        <Button
          disabled={running || retryableCount === 0}
          onClick={() => void conversion.run('failed')}
        >
          重试全部失败项（{retryableCount}）
        </Button>
        {running ? (
          <Button
            danger
            disabled={conversion.stopping}
            onClick={conversion.stop}
          >
            {conversion.stopping ? '正在停止…' : '停止'}
          </Button>
        ) : (
          <Button
            loading={conversion.loading}
            onClick={() => void conversion.reload()}
          >
            刷新
          </Button>
        )}
      </div>
      {progress.total > 0 && (
        <div className="text-xs text-slate-500">
          <Progress
            percent={Math.round((progress.completed / progress.total) * 100)}
            size="small"
            status={
              running ? 'active' : progress.failed > 0 ? 'exception' : 'normal'
            }
          />
          已处理 {progress.completed}/{progress.total}，成功{' '}
          {progress.succeeded}，失败或源图保留 {progress.failed}
          {conversion.stopping && '；当前请求完成后停止'}
        </div>
      )}
      {conversion.queryError && (
        <Alert type="error" title={conversion.queryError} showIcon />
      )}
      <Tabs
        activeKey={view}
        onChange={(value) => setView(value as typeof view)}
        className="shrink-0 [&_.ant-tabs-nav]:mb-0"
        items={[
          { label: `待转换（${data?.total ?? 0}）`, key: 'candidates' },
          {
            label: `失败 / 源图保留（${failedItems.length}）`,
            key: 'failed',
          },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200 p-3">
        {conversion.loading && !data ? (
          <div className="flex justify-center py-6">
            <Spin />
          </div>
        ) : items.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              view === 'failed'
                ? '暂无失败项'
                : '全库暂无需要转换的 HEIC/HEIF 图片'
            }
          />
        ) : (
          <Image.PreviewGroup>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              {items.map((item) => {
                const failure = failures[item.id]
                const folderText =
                  item.folderPaths.length > 0
                    ? item.folderPaths.join('、')
                    : '未分类'
                return (
                  <div
                    key={item.id}
                    className="flex min-w-0 flex-wrap items-center gap-3 border-b border-slate-100 py-2"
                  >
                    <Image
                      src={eagleThumbnailUrl(item.id, item.contentVersion)}
                      preview={{
                        src: eaglePreviewUrl(item.id, item.contentVersion),
                      }}
                      alt={`${item.name}.${item.ext}`}
                      loading="lazy"
                      width={48}
                      height={48}
                      classNames={{
                        root: 'shrink-0',
                        image: 'h-full rounded object-cover',
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate text-sm"
                        title={`${item.name}.${item.ext}`}
                      >
                        {item.name}.{item.ext}
                      </div>
                      <div
                        className="truncate text-xs text-slate-400"
                        title={folderText}
                      >
                        目录：{folderText}
                      </div>
                      {failure && (
                        <div className="mt-1 text-xs break-words text-red-500">
                          {failure.error}
                        </div>
                      )}
                    </div>
                    <Button
                      size="small"
                      type="primary"
                      loading={conversion.currentId === item.id}
                      disabled={running}
                      onClick={() => void conversion.run(item)}
                    >
                      {failure?.committed
                        ? '重试删除源图'
                        : failure
                          ? '重试'
                          : '转换'}
                    </Button>
                  </div>
                )
              })}
            </div>
          </Image.PreviewGroup>
        )}
      </div>
      <Pagination
        current={page}
        pageSize={pageSize}
        total={total}
        showSizeChanger={false}
        disabled={running}
        onChange={view === 'failed' ? setFailedPage : conversion.setPage}
        size="small"
      />
    </div>
  )
}
