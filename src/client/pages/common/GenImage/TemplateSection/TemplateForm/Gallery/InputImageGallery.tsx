import { GalleryImageGrid } from './GalleryImageGrid'
import { InputImageFolder } from './InputImageFolder'
import type { InputFolderView } from './useGalleryImages'

interface InputImageGalleryProps {
  folders: InputFolderView[]
  rootImageUrls: string[]
  selectedFolder: string | null
  selectedUrls: string[]
  unreferencedUrls: ReadonlySet<string>
  onSelectFolder: (folder: string | null) => void
  onSelectImage: (url: string) => void
}

export function InputImageGallery({
  folders,
  rootImageUrls,
  selectedFolder,
  selectedUrls,
  unreferencedUrls,
  onSelectFolder,
  onSelectImage,
}: InputImageGalleryProps) {
  const selectedFolderView = folders.find(
    (folder) => folder.folder === selectedFolder,
  )

  if (selectedFolder && selectedFolderView) {
    return (
      <div>
        <div className="mb-3 flex items-center gap-2 px-2">
          <button
            type="button"
            className="cursor-pointer text-sm text-slate-500 transition-colors hover:text-blue-600"
            onClick={() => onSelectFolder(null)}
          >
            输入图片
          </button>
          <span className="text-slate-300">/</span>
          <span className="min-w-0 truncate text-sm font-medium text-slate-700">
            {selectedFolderView.folder} ({selectedFolderView.urls.length})
          </span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          <GalleryImageGrid
            urls={selectedFolderView.urls}
            selectedUrls={selectedUrls}
            unreferencedUrls={unreferencedUrls}
            onSelect={onSelectImage}
          />
        </div>
      </div>
    )
  }

  if (folders.length === 0 && rootImageUrls.length === 0) {
    return <div className="p-8 text-center text-slate-400">暂无输入图片</div>
  }

  return (
    <div className="max-h-[60vh] overflow-y-auto">
      {folders.length > 0 && (
        <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {folders.map((folder) => (
            <InputImageFolder
              key={folder.folder}
              folder={folder.folder}
              count={folder.urls.length}
              onClick={() => onSelectFolder(folder.folder)}
            />
          ))}
        </div>
      )}
      {rootImageUrls.length > 0 && (
        <GalleryImageGrid
          urls={rootImageUrls}
          selectedUrls={selectedUrls}
          unreferencedUrls={unreferencedUrls}
          onSelect={onSelectImage}
        />
      )}
    </div>
  )
}
