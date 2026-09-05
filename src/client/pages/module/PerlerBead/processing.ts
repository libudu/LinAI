import type {
  AutoGridResult,
  CellColor,
  CellOverrideMap,
  CellResult,
  ColorRule,
  GridSize,
} from './types'

// ---------- 图像加载与基础转换 ----------

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败，请检查图片格式或网络'))
    img.src = src
  })
}

export function getImageDataFromImage(
  img: HTMLImageElement,
  maxDimension = 1200,
): { imageData: ImageData; width: number; height: number } {
  let width = img.naturalWidth || img.width
  let height = img.naturalHeight || img.height

  if (maxDimension && (width > maxDimension || height > maxDimension)) {
    if (width >= height) {
      height = Math.round((height * maxDimension) / width)
      width = maxDimension
    } else {
      width = Math.round((width * maxDimension) / height)
      height = maxDimension
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('无法创建 Canvas 2D 绘图上下文')
  }

  ctx.drawImage(img, 0, 0, width, height)
  return {
    imageData: ctx.getImageData(0, 0, width, height),
    width,
    height,
  }
}

// ---------- 颜色工具 ----------

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase()
  return `#${to(r)}${to(g)}${to(b)}`
}

export function hexToRgb(
  hex: string,
): { r: number; g: number; b: number } | null {
  const m = hex.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  if (!m) return null
  let h = m[1]
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const num = parseInt(h, 16)
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

/** 混合透明像素到白色底色 */
function blendOverWhite(
  r: number,
  g: number,
  b: number,
  a: number,
): [number, number, number] {
  if (a >= 255) return [r, g, b]
  const alpha = a / 255
  return [
    Math.round(r * alpha + 255 * (1 - alpha)),
    Math.round(g * alpha + 255 * (1 - alpha)),
    Math.round(b * alpha + 255 * (1 - alpha)),
  ]
}

// ---------- 高性能单元格取色实现 ----------

/**
 * 中心像素直接采样（O(1) 性能，拖动滑块时毫秒级更新，杜绝卡顿）
 */
export function sampleCenterColor(
  imageData: ImageData,
  startX: number,
  endX: number,
  startY: number,
  endY: number,
  offsetX = 0,
  offsetY = 0,
): string {
  const imgW = imageData.width
  const cellW = endX - startX
  const cellH = endY - startY
  const midX = startX + cellW / 2
  const midY = startY + cellH / 2

  const targetX = Math.max(
    startX,
    Math.min(endX - 1, Math.round(midX + offsetX * (cellW / 2))),
  )
  const targetY = Math.max(
    startY,
    Math.min(endY - 1, Math.round(midY + offsetY * (cellH / 2))),
  )

  const idx = (targetY * imgW + targetX) * 4
  const data = imageData.data
  const [r, g, b] = blendOverWhite(
    data[idx],
    data[idx + 1],
    data[idx + 2],
    data[idx + 3],
  )
  return rgbToHex(r, g, b)
}

interface FastCluster {
  r: number
  g: number
  b: number
  count: number
}

/**
 * 高性能主色采样（无字符串分配、无 Map 查找，纯数字比较与小容量聚类）
 */
export function sampleDominantColor(
  imageData: ImageData,
  startX: number,
  endX: number,
  startY: number,
  endY: number,
  clusterDistThreshold = 24,
): string {
  const data = imageData.data
  const imgW = imageData.width
  const distSqThreshold = clusterDistThreshold * clusterDistThreshold
  const clusters: FastCluster[] = []

  for (let y = startY; y < endY; y++) {
    const rowOffset = y * imgW * 4
    for (let x = startX; x < endX; x++) {
      const idx = rowOffset + x * 4
      const a = data[idx + 3]
      let r = data[idx]
      let g = data[idx + 1]
      let b = data[idx + 2]
      if (a < 255) {
        const alpha = a / 255
        r = Math.round(r * alpha + 255 * (1 - alpha))
        g = Math.round(g * alpha + 255 * (1 - alpha))
        b = Math.round(b * alpha + 255 * (1 - alpha))
      }

      let matched: FastCluster | null = null
      let minDistSq = Infinity
      for (let i = 0; i < clusters.length; i++) {
        const c = clusters[i]
        const dr = r - c.r
        const dg = g - c.g
        const db = b - c.b
        const dSq = dr * dr + dg * dg + db * db
        if (dSq <= distSqThreshold && dSq < minDistSq) {
          minDistSq = dSq
          matched = c
        }
      }

      if (matched) {
        matched.count++
      } else if (clusters.length < 16) {
        clusters.push({ r, g, b, count: 1 })
      }
    }
  }

  if (clusters.length === 0) return '#FFFFFF'
  let best = clusters[0]
  for (let i = 1; i < clusters.length; i++) {
    if (clusters[i].count > best.count) {
      best = clusters[i]
    }
  }
  return rgbToHex(best.r, best.g, best.b)
}

/**
 * 仅为当前选中的单个单元格分析完整的原色频次分布（按需计算，避免全图计算的巨大开销）
 */
export function analyzeSelectedCellDetails(
  imageData: ImageData,
  row: number,
  column: number,
  gridSize: GridSize,
  maxColors = 6,
  clusterDistThreshold = 24,
): CellColor[] {
  const imgW = imageData.width
  const imgH = imageData.height

  const startX = Math.floor((column * imgW) / gridSize.columns)
  const endX = Math.min(
    imgW,
    Math.max(startX + 1, Math.floor(((column + 1) * imgW) / gridSize.columns)),
  )
  const startY = Math.floor((row * imgH) / gridSize.rows)
  const endY = Math.min(
    imgH,
    Math.max(startY + 1, Math.floor(((row + 1) * imgH) / gridSize.rows)),
  )

  const data = imageData.data
  const distSqThreshold = clusterDistThreshold * clusterDistThreshold
  const clusters: Array<{
    r: number
    g: number
    b: number
    count: number
    exactColors: Map<string, number>
  }> = []
  let totalPixels = 0

  for (let y = startY; y < endY; y++) {
    const rowOffset = y * imgW * 4
    for (let x = startX; x < endX; x++) {
      const idx = rowOffset + x * 4
      const [r, g, b] = blendOverWhite(
        data[idx],
        data[idx + 1],
        data[idx + 2],
        data[idx + 3],
      )
      const hex = rgbToHex(r, g, b)
      totalPixels++

      let matchedCluster: (typeof clusters)[0] | null = null
      let minDistSq = Infinity
      for (const cluster of clusters) {
        const dr = r - cluster.r
        const dg = g - cluster.g
        const db = b - cluster.b
        const dSq = dr * dr + dg * dg + db * db
        if (dSq <= distSqThreshold && dSq < minDistSq) {
          minDistSq = dSq
          matchedCluster = cluster
        }
      }

      if (matchedCluster) {
        matchedCluster.count++
        matchedCluster.exactColors.set(
          hex,
          (matchedCluster.exactColors.get(hex) || 0) + 1,
        )
      } else {
        const exactMap = new Map<string, number>()
        exactMap.set(hex, 1)
        clusters.push({
          r,
          g,
          b,
          count: 1,
          exactColors: exactMap,
        })
      }
    }
  }

  if (totalPixels === 0 || clusters.length === 0) {
    return [{ color: '#FFFFFF', count: 1, ratio: 1 }]
  }

  clusters.sort((a, b) => b.count - a.count)

  return clusters.slice(0, maxColors).map((cluster) => {
    let bestHex = ''
    let bestCount = -1
    for (const [hex, count] of cluster.exactColors.entries()) {
      if (count > bestCount) {
        bestCount = count
        bestHex = hex
      }
    }
    return {
      color: bestHex || rgbToHex(cluster.r, cluster.g, cluster.b),
      count: cluster.count,
      ratio: Number((cluster.count / totalPixels).toFixed(4)),
    }
  })
}

/**
 * 批量高效计算全图所有单元格结果（极速模式：中心采样 < 1ms，主色采样 < 15ms）
 */
export function computeAllCells(
  imageData: ImageData,
  gridSize: GridSize,
  globalRule: ColorRule,
  overrides: CellOverrideMap,
): CellResult[][] {
  const rows = Math.max(1, Math.min(200, gridSize.rows || 50))
  const cols = Math.max(1, Math.min(200, gridSize.columns || 50))
  const imgW = imageData.width
  const imgH = imageData.height
  const results: CellResult[][] = []

  for (let r = 0; r < rows; r++) {
    const startY = Math.floor((r * imgH) / rows)
    const endY = Math.min(
      imgH,
      Math.max(startY + 1, Math.floor(((r + 1) * imgH) / rows)),
    )
    const rowList: CellResult[] = []

    for (let c = 0; c < cols; c++) {
      const startX = Math.floor((c * imgW) / cols)
      const endX = Math.min(
        imgW,
        Math.max(startX + 1, Math.floor(((c + 1) * imgW) / cols)),
      )

      const key = `${r},${c}`
      const override = overrides[key]
      let cellColor = '#FFFFFF'

      if (override?.color) {
        cellColor = override.color
      } else {
        const effectiveRule = override?.rule || globalRule
        if (effectiveRule.type === 'center') {
          cellColor = sampleCenterColor(
            imageData,
            startX,
            endX,
            startY,
            endY,
            effectiveRule.offsetX || 0,
            effectiveRule.offsetY || 0,
          )
        } else {
          cellColor = sampleDominantColor(imageData, startX, endX, startY, endY)
        }
      }

      rowList.push({
        row: r,
        column: c,
        color: cellColor,
        sourceColors: [], // 按需由 analyzeSelectedCellDetails 填充
      })
    }
    results.push(rowList)
  }

  return results
}

// ---------- 网格自动识别算法 ----------

function evaluateGridCandidate(
  diffProfile: Float32Array,
  length: number,
  count: number,
): number {
  if (count <= 1 || length <= count) return 0
  const cellSize = length / count
  let boundarySum = 0
  let boundaryCount = 0
  let interiorSum = 0
  let interiorCount = 0

  for (let i = 1; i < count; i++) {
    const bPos = Math.round(i * cellSize)
    if (bPos >= 0 && bPos < length) {
      boundarySum += diffProfile[bPos]
      boundaryCount++
    }
  }

  for (let i = 0; i < count; i++) {
    const inPos = Math.round((i + 0.5) * cellSize)
    if (inPos >= 0 && inPos < length) {
      interiorSum += diffProfile[inPos]
      interiorCount++
    }
  }

  const bAvg = boundaryCount > 0 ? boundarySum / boundaryCount : 0
  const inAvg = interiorCount > 0 ? interiorSum / interiorCount : 0

  const contrastRatio = (bAvg + 1) / (inAvg + 1)
  const sizePreference = 1 + 0.15 * Math.exp(-Math.pow((count - 50) / 25, 2))

  return contrastRatio * sizePreference
}

/**
 * 默认按长边 50，等比计算短边，锁定原图宽高比
 */
export function getDefaultGridSize(origW: number, origH: number): GridSize {
  if (origW <= 0 || origH <= 0) {
    return { columns: 50, rows: 50 }
  }
  if (origW >= origH) {
    const cols = 50
    const rows = Math.max(1, Math.min(200, Math.round((50 * origH) / origW)))
    return { columns: cols, rows }
  } else {
    const rows = 50
    const cols = Math.max(1, Math.min(200, Math.round((50 * origW) / origH)))
    return { columns: cols, rows }
  }
}

export function detectGridSize(img: HTMLImageElement): AutoGridResult {
  const origW = img.naturalWidth || img.width
  const origH = img.naturalHeight || img.height

  try {
    const { imageData, width, height } = getImageDataFromImage(img, 400)
    const data = imageData.data

    const dxProfile = new Float32Array(width)
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width * 4
      for (let x = 1; x < width; x++) {
        const idx = rowOffset + x * 4
        const prevIdx = rowOffset + (x - 1) * 4
        const dr = Math.abs(data[idx] - data[prevIdx])
        const dg = Math.abs(data[idx + 1] - data[prevIdx + 1])
        const db = Math.abs(data[idx + 2] - data[prevIdx + 2])
        dxProfile[x] += (dr + dg + db) / height
      }
    }

    const dyProfile = new Float32Array(height)
    for (let x = 0; x < width; x++) {
      for (let y = 1; y < height; y++) {
        const idx = (y * width + x) * 4
        const prevIdx = ((y - 1) * width + x) * 4
        const dr = Math.abs(data[idx] - data[prevIdx])
        const dg = Math.abs(data[idx + 1] - data[prevIdx + 1])
        const db = Math.abs(data[idx + 2] - data[prevIdx + 2])
        dyProfile[y] += (dr + dg + db) / width
      }
    }

    let bestCols = 50
    let bestColsScore = -1
    for (let c = 10; c <= 150; c++) {
      const score = evaluateGridCandidate(dxProfile, width, c)
      if (score > bestColsScore) {
        bestColsScore = score
        bestCols = c
      }
    }

    let bestRows = 50
    let bestRowsScore = -1
    for (let r = 10; r <= 150; r++) {
      const score = evaluateGridCandidate(dyProfile, height, r)
      if (score > bestRowsScore) {
        bestRowsScore = score
        bestRows = r
      }
    }

    const avgScore = (bestColsScore + bestRowsScore) / 2
    let confidence = 0
    if (avgScore > 1.35) {
      confidence = Math.min(1, (avgScore - 1.2) / 1.0)
    }

    const detectedAspect = bestCols / bestRows
    const actualAspect = origW / origH
    const aspectDiff = Math.abs(detectedAspect - actualAspect) / actualAspect

    if (confidence >= 0.45 && aspectDiff < 0.25) {
      return {
        gridSize: {
          columns: Math.max(1, Math.min(200, Math.round(bestCols))),
          rows: Math.max(1, Math.min(200, Math.round(bestRows))),
        },
        confidence: Number(confidence.toFixed(2)),
      }
    }

    return {
      gridSize: getDefaultGridSize(origW, origH),
      confidence: 0,
    }
  } catch (err) {
    console.warn('自动网格识别出错，使用默认网格', err)
    return {
      gridSize: getDefaultGridSize(origW, origH),
      confidence: 0,
    }
  }
}
