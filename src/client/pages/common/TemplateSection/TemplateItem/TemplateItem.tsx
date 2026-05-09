import { Card, Tooltip, message } from 'antd'
import copy from 'copy-to-clipboard'
import dayjs from 'dayjs'
import { TaskTemplate } from '../../../../../server/common/template-manager'
import { ImageGroup } from '../../../../pages/common/components/ImageGroup'
import {
  TemplateItemGenerateButtons,
  TemplateItemHeader,
} from './TemplateItemHeader'

interface TemplateItemProps {
  template: TaskTemplate
  draggable?: boolean
}

export function TemplateItem({
  template,
  draggable = false,
}: TemplateItemProps) {
  return (
    <Card
      size="small"
      className="shadow-sm transition-shadow hover:shadow-md"
      classNames={{
        body: 'p-[10px]! hover:bg-gray-100 transition-colors duration-100',
      }}
    >
      <div className="flex gap-2">
        <ImageGroup images={template.images || []} width={80} height={100} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <TemplateItemHeader template={template} draggable={draggable} />
          <div className="flex items-center gap-2">
            {template.title && (
              <div
                className="truncate font-bold text-slate-800"
                title={template.title}
              >
                {template.title}
              </div>
            )}
            <div className="shrink-0 text-xs text-slate-400">
              {dayjs(template.createdAt).format('YY/MM/DD HH:mm')}
            </div>
          </div>
          <Tooltip title={template.prompt} placement="bottom">
            <p
              className="m-0 line-clamp-2 cursor-pointer text-sm text-slate-600 transition-colors hover:text-blue-500"
              onClick={() => {
                if (template.prompt) {
                  copy(template.prompt)
                  message.success('提示词已复制')
                }
              }}
            >
              {template.prompt}
            </p>
          </Tooltip>
          <div className="ml-2 flex justify-end gap-2 sm:hidden">
            <TemplateItemGenerateButtons template={template} />
          </div>
        </div>
      </div>
    </Card>
  )
}
