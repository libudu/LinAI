import path from 'path'

export const GEMINI_TTS_DIR = path.resolve(process.cwd(), 'data/gemini-tts')
export const GEMINI_TTS_OUTPUT_DIR = path.join(GEMINI_TTS_DIR, 'output')
export const PROJECTS_FILE = path.join(GEMINI_TTS_DIR, 'projects.json')
