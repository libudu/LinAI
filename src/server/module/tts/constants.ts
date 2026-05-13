import path from 'path'

const TTS_DIR = path.resolve(process.cwd(), 'data/tts')
export const GEMINI_TTS_OUTPUT_DIR = path.join(TTS_DIR, 'gemini-output')
export const QWEN_TTS_OUTPUT_DIR = path.join(TTS_DIR, 'qwen-output')
export const PROJECTS_FILE = path.join(TTS_DIR, 'projects.json')
