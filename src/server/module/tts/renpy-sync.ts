import { constants } from 'fs'
import fs from 'fs-extra'
import path from 'path'
import { TTS_INWORLD_OUTPUT_DIR } from './server-const'

// Ren'Py 同步只依赖对白的这几个字段，接口入参按此最小化（§7.5），
// 后端不再回读完整 TTS 项目存储
export interface RenpySyncDialogue {
  id: string
  audioUrl?: string
  data?: {
    renpyId: string
  }
}

const sanitizeFilename = (name: string) => {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim()
}

const resolveDialogueAudioPath = (audioUrl?: string) => {
  if (!audioUrl) {
    return null
  }

  try {
    const url = new URL(audioUrl, 'http://localhost')
    const pathname = decodeURIComponent(url.pathname)
    const outputPrefix = '/api/tts/output/'
    if (!pathname.startsWith(outputPrefix)) {
      return null
    }

    const fileName = path.basename(pathname.slice(outputPrefix.length))
    if (!fileName) {
      return null
    }

    return path.join(TTS_INWORLD_OUTPUT_DIR, fileName)
  } catch {
    return null
  }
}

const createRenpySyncEntries = async (
  dialogues: RenpySyncDialogue[],
  workDir?: string,
) => {
  const nameCountMap: Record<string, number> = {}
  const entries: Array<{
    dialogueId: string
    renpyId: string
    sourcePath: string
    targetPath: string | null
  }> = []

  for (const dialogue of dialogues) {
    const renpyId = sanitizeFilename(dialogue.data?.renpyId || '').substring(
      0,
      100,
    )
    const sourcePath = resolveDialogueAudioPath(dialogue.audioUrl)

    if (!renpyId || !sourcePath) {
      continue
    }

    if (!(await fs.pathExists(sourcePath))) {
      continue
    }

    let resolvedName = renpyId
    if (nameCountMap[renpyId] !== undefined) {
      nameCountMap[renpyId] += 1
      resolvedName = `${renpyId}（${nameCountMap[renpyId]}）`
    } else {
      nameCountMap[renpyId] = 0
    }

    entries.push({
      dialogueId: dialogue.id,
      renpyId: dialogue.data?.renpyId || '',
      sourcePath,
      targetPath: workDir
        ? path.join(
            workDir,
            `${resolvedName}${path.extname(sourcePath) || '.mp3'}`,
          )
        : null,
    })
  }

  return entries
}

const isSameFileContent = async (sourcePath: string, targetPath: string) => {
  if (!(await fs.pathExists(targetPath))) {
    return false
  }

  const [sourceStat, targetStat] = await Promise.all([
    fs.stat(sourcePath),
    fs.stat(targetPath),
  ])

  if (sourceStat.size !== targetStat.size) {
    return false
  }

  const [sourceBuffer, targetBuffer] = await Promise.all([
    fs.readFile(sourcePath),
    fs.readFile(targetPath),
  ])

  return sourceBuffer.equals(targetBuffer)
}

export const validateRenpyWorkDir = async (inputPath: string) => {
  const workDir = path.normalize(inputPath.trim())

  if (!workDir) {
    throw new Error('请输入 RenPy 导出目录')
  }

  if (!path.isAbsolute(workDir)) {
    throw new Error('请输入绝对路径')
  }

  if (!(await fs.pathExists(workDir))) {
    throw new Error('目录不存在')
  }

  const stat = await fs.stat(workDir)
  if (!stat.isDirectory()) {
    throw new Error('输入路径不是目录')
  }

  await fs.access(workDir, constants.R_OK | constants.W_OK)

  return workDir
}

export const getRenpySyncStatus = async (input: {
  workDir?: string | null
  dialogues: RenpySyncDialogue[]
}) => {
  const workDir =
    input.workDir && input.workDir.trim() ? input.workDir.trim() : null
  const entries = await createRenpySyncEntries(
    input.dialogues,
    workDir || undefined,
  )

  let syncedCount = 0
  if (workDir) {
    for (const entry of entries) {
      if (
        entry.targetPath &&
        (await isSameFileContent(entry.sourcePath, entry.targetPath))
      ) {
        syncedCount += 1
      }
    }
  }

  return {
    workDir,
    syncedCount,
    totalCount: entries.length,
  }
}

export const copyRenpyFiles = async (input: {
  workDir: string
  dialogues: RenpySyncDialogue[]
}) => {
  const workDir = await validateRenpyWorkDir(input.workDir)
  const entries = await createRenpySyncEntries(input.dialogues, workDir)

  for (const entry of entries) {
    if (!entry.targetPath) {
      continue
    }
    await fs.copy(entry.sourcePath, entry.targetPath, { overwrite: true })
  }

  return {
    syncedCount: entries.length,
    totalCount: entries.length,
  }
}
