import { zValidator } from '@hono/zod-validator'
import fs from 'fs-extra'
import { Hono } from 'hono'
import path from 'path'
import { z } from 'zod'
import {
  QWEN_TTS_OUTPUT_DIR,
  generateAndSaveAudioQwen,
  projectManager,
} from '../module/tts/index'

const ttsApi = new Hono()
  .post(
    '/generate',
    zValidator(
      'json',
      z.object({
        prompt: z.string(),
        voiceName: z.string(),
        isTrial: z.boolean().optional(),
      }),
    ),
    async (c) => {
      try {
        const { prompt, voiceName, isTrial } = c.req.valid('json')
        const filename = await generateAndSaveAudioQwen({
          prompt,
          voiceName,
          isTrial,
        })
        return c.json({
          success: true,
          url: `/api/tts/output/${filename}?t=${Date.now()}`,
        })
      } catch (error: any) {
        return c.json({ success: false, error: error.message }, 500)
      }
    },
  )
  .get('/output/trial', async (c) => {
    try {
      const trialDir = path.join(QWEN_TTS_OUTPUT_DIR, 'trial')
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
      const filepath = path.join(QWEN_TTS_OUTPUT_DIR, 'trial', filename)

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
  .get(
    '/output/:filename',
    zValidator('param', z.object({ filename: z.string() })),
    async (c) => {
      const { filename } = c.req.valid('param')
      const filepath = path.join(QWEN_TTS_OUTPUT_DIR, filename)

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
  .get('/projects', async (c) => {
    try {
      const projects = await projectManager.getProjects()
      return c.json({ success: true, data: projects })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  .post(
    '/projects',
    zValidator(
      'json',
      z.object({
        name: z.string(),
        backgroundPrompt: z.string().optional().default(''),
      }),
    ),
    async (c) => {
      try {
        const data = c.req.valid('json')
        const project = await projectManager.createProject(data)
        return c.json({ success: true, data: project })
      } catch (error: any) {
        return c.json({ success: false, error: error.message }, 500)
      }
    },
  )
  .get(
    '/projects/:id',
    zValidator('param', z.object({ id: z.string() })),
    async (c) => {
      try {
        const { id } = c.req.valid('param')
        const project = await projectManager.getProjectById(id)
        if (!project) {
          return c.json({ success: false, error: 'Project not found' }, 404)
        }
        return c.json({ success: true, data: project })
      } catch (error: any) {
        return c.json({ success: false, error: error.message }, 500)
      }
    },
  )
  .put(
    '/projects/:id',
    zValidator('param', z.object({ id: z.string() })),
    zValidator('json', z.any()), // Assuming we accept partial project updates
    async (c) => {
      try {
        const { id } = c.req.valid('param')
        const data = c.req.valid('json')
        const project = await projectManager.updateProject(id, data)
        if (!project) {
          return c.json({ success: false, error: 'Project not found' }, 404)
        }
        return c.json({ success: true, data: project })
      } catch (error: any) {
        return c.json({ success: false, error: error.message }, 500)
      }
    },
  )
  .delete(
    '/projects/:id',
    zValidator('param', z.object({ id: z.string() })),
    async (c) => {
      try {
        const { id } = c.req.valid('param')
        const success = await projectManager.deleteProject(id)
        if (!success) {
          return c.json({ success: false, error: 'Project not found' }, 404)
        }
        return c.json({ success: true })
      } catch (error: any) {
        return c.json({ success: false, error: error.message }, 500)
      }
    },
  )

export default ttsApi
