import { zValidator } from '@hono/zod-validator'
import fs from 'fs-extra'
import { Hono } from 'hono'
import path from 'path'
import { z } from 'zod'
import {
  TTS_INWORLD_OUTPUT_DIR,
  copyRenpyFiles,
  getRenpySyncStatus,
  validateRenpyWorkDir,
} from '../../module/tts/index'

// TTS 项目数据已由前端通过通用实体接口（/api/storage/entities/tts.projects）整体读写，
// 后端不再保留项目 CRUD；本文件只剩音频输出与 Ren'Py 同步（最小参数，§7.5）

// Ren'Py 同步只依赖对白的这几个字段
const renpyDialogueSchema = z.object({
  id: z.string(),
  audioUrl: z.string().optional(),
  data: z.object({ renpyId: z.string() }).optional(),
})

const ttsApi = new Hono()
  .get('/output/trial', async (c) => {
    try {
      const trialDir = path.join(TTS_INWORLD_OUTPUT_DIR, 'trial')
      if (!(await fs.pathExists(trialDir))) {
        return c.json({ success: true, data: [] })
      }
      const files = await fs.readdir(trialDir)
      const audioFiles = files.filter((f) => f.endsWith('.wav'))
      return c.json({ success: true, data: audioFiles })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  .get(
    '/output/trial/:filename',
    zValidator('param', z.object({ filename: z.string() })),
    async (c) => {
      const { filename } = c.req.valid('param')
      const filepath = path.join(TTS_INWORLD_OUTPUT_DIR, 'trial', filename)

      if (await fs.pathExists(filepath)) {
        const fileBuffer = await fs.readFile(filepath)
        const fileSize = fileBuffer.length
        const range = c.req.header('range')

        c.header('Accept-Ranges', 'bytes')
        c.header('Content-Type', 'audio/mpeg')

        if (range) {
          const parts = range.replace(/bytes=/, '').split('-')
          const start = parseInt(parts[0], 10)
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
          const chunksize = end - start + 1

          c.status(206)
          c.header('Content-Range', `bytes ${start}-${end}/${fileSize}`)
          c.header('Content-Length', chunksize.toString())
          return c.body(fileBuffer.subarray(start, end + 1))
        } else {
          c.header('Content-Length', fileSize.toString())
          return c.body(fileBuffer)
        }
      }
      return c.notFound()
    },
  )
  .get(
    '/output/:filename',
    zValidator('param', z.object({ filename: z.string() })),
    async (c) => {
      const { filename } = c.req.valid('param')
      const filepath = path.join(TTS_INWORLD_OUTPUT_DIR, filename)

      if (await fs.pathExists(filepath)) {
        const fileBuffer = await fs.readFile(filepath)
        const fileSize = fileBuffer.length
        const range = c.req.header('range')

        c.header('Accept-Ranges', 'bytes')
        c.header('Content-Type', 'audio/wav')

        if (range) {
          const parts = range.replace(/bytes=/, '').split('-')
          const start = parseInt(parts[0], 10)
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
          const chunksize = end - start + 1

          c.status(206)
          c.header('Content-Range', `bytes ${start}-${end}/${fileSize}`)
          c.header('Content-Length', chunksize.toString())
          return c.body(fileBuffer.subarray(start, end + 1))
        } else {
          c.header('Content-Length', fileSize.toString())
          return c.body(fileBuffer)
        }
      }
      return c.notFound()
    },
  )
  // 校验 Ren'Py 工作目录（存在、为目录、可读写），前端校验通过后再写入项目
  .post(
    '/renpy-sync/validate-dir',
    zValidator('json', z.object({ workDir: z.string() })),
    async (c) => {
      try {
        const workDir = await validateRenpyWorkDir(c.req.valid('json').workDir)
        return c.json({ success: true as const, data: { workDir } })
      } catch (error: any) {
        return c.json({ success: false as const, error: error.message }, 500)
      }
    },
  )
  // 同步状态：workDir 与对白列表均由前端随请求提交
  .post(
    '/renpy-sync/status',
    zValidator(
      'json',
      z.object({
        workDir: z.string().nullish(),
        dialogues: z.array(renpyDialogueSchema).max(5000),
      }),
    ),
    async (c) => {
      try {
        const { workDir, dialogues } = c.req.valid('json')
        return c.json({
          success: true as const,
          data: await getRenpySyncStatus({ workDir, dialogues }),
        })
      } catch (error: any) {
        return c.json({ success: false as const, error: error.message }, 500)
      }
    },
  )
  // 执行同步：把有效音频覆盖复制到 Ren'Py 工作目录
  .post(
    '/renpy-sync/run',
    zValidator(
      'json',
      z.object({
        workDir: z.string(),
        dialogues: z.array(renpyDialogueSchema).max(5000),
      }),
    ),
    async (c) => {
      try {
        const { workDir, dialogues } = c.req.valid('json')
        return c.json({
          success: true as const,
          data: await copyRenpyFiles({ workDir, dialogues }),
        })
      } catch (error: any) {
        return c.json({ success: false as const, error: error.message }, 500)
      }
    },
  )

export default ttsApi
