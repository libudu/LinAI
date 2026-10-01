import { randomUUID } from 'crypto'
import fs from 'fs-extra'
import path from 'path'
import { GENERATED_IMAGES_DIR, THUMB_IMAGES_DIR } from '../../common/static'
import { GENERATED_IMAGES_API_PATH } from '../../common/static/enum'
import {
  activeGeneratedFiles,
  publishImageAssetsChange,
  withImageLifecycle,
} from '../../common/static/image-lifecycle'

/** 每次执行独占输出文件：状态落盘后提交，其他情况清理本次写入。 */
export class GeneratedImageBatch {
  private readonly files: string[] = []
  private committed = false

  async write(bytes: Buffer, extension: 'png' | 'jpg' | 'webp'): Promise<void> {
    const filename = `${randomUUID()}.${extension}`
    await withImageLifecycle(async () => {
      activeGeneratedFiles.add(filename)
      this.files.push(filename)
      await fs.writeFile(path.join(GENERATED_IMAGES_DIR, filename), bytes)
      publishImageAssetsChange()
    })
  }

  get urls(): string[] {
    return this.files.map((file) => `${GENERATED_IMAGES_API_PATH}/${file}`)
  }

  commit() {
    this.committed = true
    for (const file of this.files) activeGeneratedFiles.delete(file)
  }

  async dispose() {
    await withImageLifecycle(async () => {
      try {
        if (!this.committed) {
          // 单个文件失败不能跳过其他文件；将清理失败交给执行器记录。
          const results = await Promise.allSettled(
            this.files.flatMap((file) => [
              fs.remove(path.join(GENERATED_IMAGES_DIR, file)),
              fs.remove(
                path.join(
                  THUMB_IMAGES_DIR,
                  'generated',
                  `${path.parse(file).name}.webp`,
                ),
              ),
            ]),
          )
          const failure = results.find((result) => result.status === 'rejected')
          if (failure?.status === 'rejected') throw failure.reason
        }
      } finally {
        for (const file of this.files) activeGeneratedFiles.delete(file)
        if (!this.committed && this.files.length) publishImageAssetsChange()
      }
    })
  }
}
