import type { OrganizeResultListItem } from '@/shared/eagle/organize'
import { eagleThumbnailUrl } from '../../api'

interface ThumbnailBarProps {
  results: OrganizeResultListItem[]
  selectedId: string | null
  onSelect: (itemId: string) => void
}

export function ThumbnailBar({
  results,
  selectedId,
  onSelect,
}: ThumbnailBarProps) {
  return (
    <div className="flex shrink-0 gap-2 overflow-x-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
      {results.map((result) => (
        <button
          key={result.itemId}
          type="button"
          onClick={() => onSelect(result.itemId)}
          className={`relative h-24 w-24 shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
            result.itemId === selectedId
              ? 'border-blue-500'
              : 'border-transparent hover:border-slate-300 dark:hover:border-slate-600'
          }`}
        >
          <img
            src={eagleThumbnailUrl(result.itemId)}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </button>
      ))}
    </div>
  )
}
