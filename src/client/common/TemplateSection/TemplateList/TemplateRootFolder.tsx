import { Card } from 'antd'

interface TemplateFolderProps {
  wanCount: number
  geminiCount: number
  onSelect: (source: 'video' | 'image') => void
}

export function TemplateFolder({
  wanCount,
  geminiCount,
  onSelect
}: TemplateFolderProps) {
  return (
    <div className="mt-2 grid h-full grid-cols-2 content-start gap-4">
      <Card
        hoverable
        onClick={() => onSelect('image')}
        className="cursor-pointer border-blue-100 text-center transition-colors hover:border-blue-300"
      >
        <div className="mb-2 text-xl font-bold text-blue-600">图片</div>
        <div className="text-slate-500">{geminiCount} 个模板</div>
      </Card>
      <Card
        hoverable
        onClick={() => onSelect('video')}
        className="cursor-pointer border-emerald-100 text-center transition-colors hover:border-emerald-300"
      >
        <div className="mb-2 text-xl font-bold text-emerald-600">视频</div>
        <div className="text-slate-500">{wanCount} 个模板</div>
      </Card>
    </div>
  )
}
