export interface DrawPoint {
  x: number
  y: number
}

export interface DrawStroke {
  color: string
  width: number
  points: DrawPoint[]
}

export function getCanvasPoint(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): DrawPoint {
  const rect = canvas.getBoundingClientRect()
  return {
    x: Math.max(
      0,
      Math.min(
        canvas.width,
        (clientX - rect.left) * (canvas.width / rect.width),
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        canvas.height,
        (clientY - rect.top) * (canvas.height / rect.height),
      ),
    ),
  }
}

export function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: DrawStroke,
) {
  const firstPoint = stroke.points[0]
  if (!firstPoint) return
  context.save()
  context.strokeStyle = stroke.color
  context.fillStyle = stroke.color
  context.lineWidth = stroke.width
  context.lineCap = 'round'
  context.lineJoin = 'round'
  if (stroke.points.length === 1) {
    context.beginPath()
    context.arc(firstPoint.x, firstPoint.y, stroke.width / 2, 0, Math.PI * 2)
    context.fill()
  } else {
    context.beginPath()
    context.moveTo(firstPoint.x, firstPoint.y)
    for (let index = 1; index < stroke.points.length; index += 1) {
      const point = stroke.points[index]
      context.lineTo(point.x, point.y)
    }
    context.stroke()
  }
  context.restore()
}

export function redrawStrokes(
  canvas: HTMLCanvasElement,
  strokes: DrawStroke[],
) {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建图片绘制画布')
  context.clearRect(0, 0, canvas.width, canvas.height)
  strokes.forEach((stroke) => drawStroke(context, stroke))
}

function canvasToDataUrl(canvas: HTMLCanvasElement) {
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('图片绘制导出失败'))
        return
      }
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('绘制结果读取失败'))
      reader.readAsDataURL(blob)
    }, 'image/png')
  })
}

export async function exportDrawnImage(
  image: HTMLImageElement,
  strokes: DrawStroke[],
) {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建图片绘制画布')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  strokes.forEach((stroke) => drawStroke(context, stroke))
  return canvasToDataUrl(canvas)
}
