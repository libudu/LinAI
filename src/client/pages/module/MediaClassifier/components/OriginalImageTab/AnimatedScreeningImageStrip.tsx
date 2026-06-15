import { animate, type JSAnimation } from 'animejs'
import { Image } from 'antd'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MediaImageItem } from '../../types'
import { MediaStatusImage } from './MediaStatusImage'

type SlotName = 'offLeft' | 'prev' | 'current' | 'next' | 'offRight'

interface AnimatedScreeningImageStripProps {
  images: MediaImageItem[]
  currentIndex: number
  onChangeIndex: (index: number) => void
}

interface RenderCard {
  key: string
  item: MediaImageItem
  index: number
  slot: SlotName
}

interface TransitionState {
  direction: -1 | 1
  targetIndex: number
}

// const PRELOAD_RANGE = 4

const SLOT_STYLES: Record<
  SlotName,
  {
    left: string
    top: string
    width: string
    height: string
    opacity: number
    scale: number
    zIndex: number
  }
> = {
  offLeft: {
    left: '-16%',
    top: '16%',
    width: '18%',
    height: '68%',
    opacity: 0,
    scale: 0.82,
    zIndex: 0,
  },
  prev: {
    left: '0%',
    top: '12%',
    width: '22%',
    height: '76%',
    opacity: 0.74,
    scale: 0.9,
    zIndex: 1,
  },
  current: {
    left: '24%',
    top: '0%',
    width: '52%',
    height: '100%',
    opacity: 1,
    scale: 1,
    zIndex: 3,
  },
  next: {
    left: '78%',
    top: '12%',
    width: '22%',
    height: '76%',
    opacity: 0.74,
    scale: 0.9,
    zIndex: 1,
  },
  offRight: {
    left: '98%',
    top: '16%',
    width: '18%',
    height: '68%',
    opacity: 0,
    scale: 0.82,
    zIndex: 0,
  },
}

const clampIndex = (index: number, length: number) =>
  Math.min(Math.max(index, 0), Math.max(length - 1, 0))

const areCardsEqual = (left: RenderCard[], right: RenderCard[]) =>
  left.length === right.length &&
  left.every((card, index) => {
    const candidate = right[index]
    return (
      card.key === candidate?.key &&
      card.slot === candidate.slot &&
      card.index === candidate.index &&
      card.item === candidate.item
    )
  })

const buildSettledCards = (
  images: MediaImageItem[],
  centerIndex: number,
): RenderCard[] => {
  const cards: RenderCard[] = []
  const previousImage = images[centerIndex - 1]
  const currentImage = images[centerIndex]
  const nextImage = images[centerIndex + 1]

  if (previousImage) {
    cards.push({
      key: previousImage.relativePath,
      item: previousImage,
      index: centerIndex - 1,
      slot: 'prev',
    })
  }

  if (currentImage) {
    cards.push({
      key: currentImage.relativePath,
      item: currentImage,
      index: centerIndex,
      slot: 'current',
    })
  }

  if (nextImage) {
    cards.push({
      key: nextImage.relativePath,
      item: nextImage,
      index: centerIndex + 1,
      slot: 'next',
    })
  }

  return cards
}

const buildTransitionCards = (
  images: MediaImageItem[],
  centerIndex: number,
  direction: -1 | 1,
): RenderCard[] => {
  if (direction > 0) {
    const cards: RenderCard[] = []
    const previousImage = images[centerIndex - 1]
    const currentImage = images[centerIndex]
    const nextImage = images[centerIndex + 1]
    const incomingImage = images[centerIndex + 2]

    if (previousImage) {
      cards.push({
        key: previousImage.relativePath,
        item: previousImage,
        index: centerIndex - 1,
        slot: 'prev',
      })
    }

    if (currentImage) {
      cards.push({
        key: currentImage.relativePath,
        item: currentImage,
        index: centerIndex,
        slot: 'current',
      })
    }

    if (nextImage) {
      cards.push({
        key: nextImage.relativePath,
        item: nextImage,
        index: centerIndex + 1,
        slot: 'next',
      })
    }

    if (incomingImage) {
      cards.push({
        key: incomingImage.relativePath,
        item: incomingImage,
        index: centerIndex + 2,
        slot: 'offRight',
      })
    }

    return cards
  }

  const cards: RenderCard[] = []
  const incomingImage = images[centerIndex - 2]
  const previousImage = images[centerIndex - 1]
  const currentImage = images[centerIndex]
  const nextImage = images[centerIndex + 1]

  if (incomingImage) {
    cards.push({
      key: incomingImage.relativePath,
      item: incomingImage,
      index: centerIndex - 2,
      slot: 'offLeft',
    })
  }

  if (previousImage) {
    cards.push({
      key: previousImage.relativePath,
      item: previousImage,
      index: centerIndex - 1,
      slot: 'prev',
    })
  }

  if (currentImage) {
    cards.push({
      key: currentImage.relativePath,
      item: currentImage,
      index: centerIndex,
      slot: 'current',
    })
  }

  if (nextImage) {
    cards.push({
      key: nextImage.relativePath,
      item: nextImage,
      index: centerIndex + 1,
      slot: 'next',
    })
  }

  return cards
}

const getTargetSlot = (slot: SlotName, direction: -1 | 1): SlotName => {
  if (direction > 0) {
    switch (slot) {
      case 'prev':
        return 'offLeft'
      case 'current':
        return 'prev'
      case 'next':
        return 'current'
      case 'offRight':
        return 'next'
      default:
        return slot
    }
  }

  switch (slot) {
    case 'offLeft':
      return 'prev'
    case 'prev':
      return 'current'
    case 'current':
      return 'next'
    case 'next':
      return 'offRight'
    default:
      return slot
  }
}

export function AnimatedScreeningImageStrip({
  images,
  currentIndex,
  onChangeIndex,
}: AnimatedScreeningImageStripProps) {
  const [settledIndex, setSettledIndex] = useState(() =>
    clampIndex(currentIndex, images.length),
  )
  const [cards, setCards] = useState<RenderCard[]>(() =>
    buildSettledCards(images, clampIndex(currentIndex, images.length)),
  )
  const [transition, setTransition] = useState<TransitionState | null>(null)
  const [previewVisible, setPreviewVisible] = useState(false)
  const animationRef = useRef<JSAnimation | null>(null)
  const cardRefs = useRef(new Map<string, HTMLDivElement>())

  const clampedCurrentIndex = useMemo(
    () => clampIndex(currentIndex, images.length),
    [currentIndex, images.length],
  )
  const currentImage = images[clampedCurrentIndex] ?? null

  useEffect(() => {
    setPreviewVisible(false)
  }, [clampedCurrentIndex])

  useEffect(() => {
    if (images.length === 0) {
      animationRef.current?.cancel()
      setTransition(null)
      setSettledIndex(0)
      setCards([])
      return
    }

    if (transition && clampedCurrentIndex !== transition.targetIndex) {
      animationRef.current?.cancel()
      const fallbackCards = buildSettledCards(images, clampedCurrentIndex)
      setTransition(null)
      setSettledIndex(clampedCurrentIndex)
      setCards((currentCards) =>
        areCardsEqual(currentCards, fallbackCards)
          ? currentCards
          : fallbackCards,
      )
      return
    }

    if (transition) {
      return
    }

    if (clampedCurrentIndex === settledIndex) {
      const nextCards = buildSettledCards(images, settledIndex)
      setCards((currentCards) =>
        areCardsEqual(currentCards, nextCards) ? currentCards : nextCards,
      )
      return
    }

    const direction = clampedCurrentIndex > settledIndex ? 1 : -1
    if (Math.abs(clampedCurrentIndex - settledIndex) !== 1) {
      const nextCards = buildSettledCards(images, clampedCurrentIndex)
      setSettledIndex(clampedCurrentIndex)
      setCards((currentCards) =>
        areCardsEqual(currentCards, nextCards) ? currentCards : nextCards,
      )
      return
    }

    setCards(buildTransitionCards(images, settledIndex, direction))
    setTransition({
      direction,
      targetIndex: clampedCurrentIndex,
    })
  }, [clampedCurrentIndex, images, settledIndex, transition])

  useLayoutEffect(() => {
    if (!transition) {
      return
    }

    animationRef.current?.cancel()

    const runningAnimations = cards
      .map((card) => {
        const element = cardRefs.current.get(card.key)
        if (!element) {
          return null
        }

        const targetSlot = getTargetSlot(card.slot, transition.direction)
        const targetStyle = SLOT_STYLES[targetSlot]
        element.style.zIndex = String(
          Math.max(SLOT_STYLES[card.slot].zIndex, targetStyle.zIndex),
        )

        return animate(element, {
          left: targetStyle.left,
          top: targetStyle.top,
          width: targetStyle.width,
          height: targetStyle.height,
          opacity: targetStyle.opacity,
          scale: targetStyle.scale,
          duration: 260,
          ease: 'inOutQuad',
        })
      })
      .filter((animation): animation is JSAnimation => Boolean(animation))

    const leadAnimation = runningAnimations[0] ?? null
    animationRef.current = leadAnimation

    let cancelled = false

    void Promise.all(
      runningAnimations.map((animation) => animation.then()),
    ).then(() => {
      if (cancelled) {
        return
      }

      const nextCards = buildSettledCards(images, transition.targetIndex)
      setSettledIndex(transition.targetIndex)
      setTransition(null)
      setCards(nextCards)
    })

    return () => {
      cancelled = true
      runningAnimations.forEach((animation) => animation.cancel())
    }
  }, [cards, images, transition])

  return (
    <div className="relative h-full overflow-hidden rounded-2xl">
      {cards.map((card) => {
        const style = SLOT_STYLES[card.slot]
        const handleClick =
          transition !== null
            ? undefined
            : card.index === clampedCurrentIndex
              ? () => setPreviewVisible(true)
              : () => onChangeIndex(card.index)

        return (
          <div
            key={card.key}
            ref={(node) => {
              if (node) {
                cardRefs.current.set(card.key, node)
                return
              }

              cardRefs.current.delete(card.key)
            }}
            className="absolute will-change-[left,top,width,height,opacity,transform]"
            style={{
              left: style.left,
              top: style.top,
              width: style.width,
              height: style.height,
              opacity: style.opacity,
              transform: `scale(${style.scale})`,
              transformOrigin: 'center center',
              zIndex: style.zIndex,
            }}
          >
            <MediaStatusImage
              item={card.item}
              preview={false}
              onClick={handleClick}
              rootClassName="h-full w-full bg-white shadow-sm"
              imageClassName="object-contain"
            />
          </div>
        )
      })}
      {previewVisible && currentImage ? (
        <div className="hidden">
          <Image
            src={currentImage.previewUrl}
            alt={currentImage.name}
            preview={{
              visible: previewVisible,
              onVisibleChange: setPreviewVisible,
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
