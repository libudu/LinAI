import path from 'path'

const TTS_DIR = path.resolve(process.cwd(), 'data/tts')
export const TTS_ALI_OUTPUT_DIR = path.join(TTS_DIR, 'ali-output')
export const PROJECTS_FILE = path.join(TTS_DIR, 'projects.json')
