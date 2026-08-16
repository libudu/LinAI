import { logger } from '../../common/logger'

// PNG 文件签名
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

// CRC32 查找表（PNG 规范使用的多项式 0xEDB88320）
const CRC_TABLE = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  CRC_TABLE[n] = c
}

function crc32(buf: Buffer): number {
  let crc = -1
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ -1) >>> 0
}

// 构造一个 PNG chunk：长度(4) + 类型(4) + 数据 + CRC32(4)
function buildChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii')
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  typeBuf.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 8 + data.length)
  return chunk
}

// 构造未压缩的 iTXt chunk（支持 UTF-8，prompt 中的中文不会乱码）
function buildITxtChunk(keyword: string, text: string): Buffer {
  const data = Buffer.concat([
    Buffer.from(keyword, 'latin1'),
    Buffer.from([0, 0, 0]), // \0 + compression_flag=0 + compression_method=0
    Buffer.from([0]), // 空 language tag
    Buffer.from([0]), // 空 translated keyword
    Buffer.from(text, 'utf8'),
  ])
  return buildChunk('iTXt', data)
}

export interface PngGenerationInfo {
  model: string
  prompt: string
  size: string
  quality: string
  baseUrl: string
  generatedAt: string
}

/**
 * 将生成参数以 iTXt 文本块写入 PNG，插入在 IEND 之前。
 * 使用 PNG 规范注册的通用关键字 Description，大部分看图软件可直接识别显示。
 * 失败时返回原始 buffer，不影响图片保存。
 */
export function writePngGenerationInfo(
  buffer: Buffer,
  info: PngGenerationInfo,
): Buffer {
  try {
    if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
      logger.warn('生成的图片不是 PNG 格式，跳过写入元数据')
      return buffer
    }

    // 顺序遍历 chunk，定位 IEND 的位置
    let offset = 8
    while (offset + 8 <= buffer.length) {
      const length = buffer.readUInt32BE(offset)
      const type = buffer.toString('ascii', offset + 4, offset + 8)
      if (type === 'IEND') break
      offset += 12 + length
    }
    if (offset + 8 > buffer.length) {
      logger.warn('未找到 PNG IEND 块，跳过写入元数据')
      return buffer
    }

    const text = [
      `model: ${info.model}`,
      `prompt: ${info.prompt}`,
      `size: ${info.size}`,
      `quality: ${info.quality}`,
      `baseUrl: ${info.baseUrl}`,
      `generatedAt: ${info.generatedAt}`,
    ].join('\n')
    const chunk = buildITxtChunk('Description', text)
    return Buffer.concat([
      buffer.subarray(0, offset),
      chunk,
      buffer.subarray(offset),
    ])
  } catch (error: any) {
    logger.warn('写入 PNG 元数据失败，保存原始图片', error?.message)
    return buffer
  }
}
