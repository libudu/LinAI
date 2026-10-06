import decode from 'heic-decode'
import libheif from 'libheif-js/wasm-bundle'
import sharp from 'sharp'

/** 严格检查 ISO BMFF 顶层结构，序列即使带静态封面也不能转换后删除。 */
export const assertStaticHeif = (buffer: Buffer) => {
  let offset = 0
  let hasBrand = false
  let hasMeta = false
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) throw new Error('HEIC/HEIF 容器不完整')
    let size = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    let header = 8
    if (size === 1) {
      if (offset + 16 > buffer.length) throw new Error('HEIC/HEIF 容器不完整')
      const largeSize = buffer.readBigUInt64BE(offset + 8)
      if (largeSize > BigInt(Number.MAX_SAFE_INTEGER))
        throw new Error('HEIC/HEIF 容器长度无效')
      size = Number(largeSize)
      header = 16
    } else if (size === 0) size = buffer.length - offset
    if (size < header || offset + size > buffer.length)
      throw new Error('HEIC/HEIF 容器长度无效')
    if (type === 'moov')
      throw new Error('暂不支持 HEIC/HEIF 序列或动画，源文件已保留')
    if (type === 'ftyp') {
      if (offset !== 0 || header !== 8 || size < 16 || size % 4 !== 0)
        throw new Error('HEIC/HEIF 格式标识无效')
      const brands = [buffer.toString('ascii', offset + 8, offset + 12)]
      for (let i = offset + 16; i < offset + size; i += 4)
        brands.push(buffer.toString('ascii', i, i + 4))
      if (
        brands.some((brand) =>
          ['msf1', 'hevc', 'hevx', 'hevm', 'hevs', 'avis'].includes(brand),
        )
      )
        throw new Error('暂不支持 HEIC/HEIF 序列或动画，源文件已保留')
      if (!['heic', 'heix', 'mif1'].includes(brands[0]))
        throw new Error('暂不支持此 HEIC/HEIF 编码，源文件已保留')
      hasBrand = true
    }
    if (type === 'meta') {
      if (
        hasMeta ||
        size < header + 4 ||
        buffer.readUInt32BE(offset + header) !== 0
      )
        throw new Error('暂不支持此 HEIC/HEIF 元数据结构，源文件已保留')
      hasMeta = true
    }
    offset += size
  }
  if (!hasBrand || !hasMeta) throw new Error('缺少 HEIC/HEIF 静态图片结构')
}

/** libheif 默认应用容器中的裁剪、irot 和 imir；raw 像素不能再做 EXIF 自动旋转。 */
export const encodeStaticHeif = async (buffer: Buffer) => {
  assertStaticHeif(buffer)
  // heic-decode 底层会跳过无法取得 handle 的图片；不能只靠 decode.all 的长度判断单图。
  await libheif.ready
  const context = libheif.heif_context_alloc()
  try {
    const parsed = libheif.heif_context_read_from_memory(context, buffer)
    if (parsed.code.value !== 0)
      throw new Error(`HEIC/HEIF 解析失败：${parsed.message}`)
    const count = libheif.heif_context_get_number_of_top_level_images(context)
    if (count !== 1)
      throw new Error(`暂不支持包含 ${count} 张图片的 HEIC/HEIF，源文件已保留`)
  } finally {
    context.delete()
  }
  const images = await decode.all({ buffer })
  try {
    if (images.length !== 1)
      throw new Error(
        `暂不支持包含 ${images.length} 张图片的 HEIC/HEIF，源文件已保留`,
      )
    const { width, height, data } = await images[0].decode()
    if (!width || !height || data.length !== width * height * 4)
      throw new Error('HEIC/HEIF 解码尺寸或像素数据无效')
    const webp = await sharp(Buffer.from(data), {
      raw: { width, height, channels: 4 },
    })
      .webp({ quality: 90 })
      .toBuffer()
    // 完整解码而非只读取头部，确认输出可读且没有缩放。
    const verified = await sharp(webp, { failOn: 'warning' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    if (verified.info.width !== width || verified.info.height !== height)
      throw new Error('WebP 重新解码验证失败')
    return { webp, width, height }
  } finally {
    images.dispose()
  }
}
