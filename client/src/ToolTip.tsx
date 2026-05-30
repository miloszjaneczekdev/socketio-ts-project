import React, { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './ToolTip.module.css'
import type { CSSProperties, FocusEvent, MouseEvent, ReactElement, ReactNode, Ref } from 'react'

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

type TooltipChildProps = {
  ref?: Ref<HTMLElement>
  onMouseEnter?: (event: MouseEvent<HTMLElement>) => void
  onMouseLeave?: (event: MouseEvent<HTMLElement>) => void
  onFocus?: (event: FocusEvent<HTMLElement>) => void
  onBlur?: (event: FocusEvent<HTMLElement>) => void
  'aria-describedby'?: string
}

type TooltipProps = {
  children: ReactElement<TooltipChildProps>
  content: ReactNode
  placement?: TooltipPlacement
  hoverDelay?: number
  focusDelay?: number
  offset?: number
  className?: string
}

type TooltipLayout = {
  top: number
  left: number
  arrowLeft: number
  arrowTop: number
}

type TooltipStyle = CSSProperties & {
  '--tooltip-arrow-left': string
  '--tooltip-arrow-top': string
}

const VIEWPORT_PADDING = 8
const ARROW_EDGE_PADDING = 12

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const sameLayout = (current: TooltipLayout | null, next: TooltipLayout) =>
  !!current &&
  Math.abs(current.top - next.top) < 0.5 &&
  Math.abs(current.left - next.left) < 0.5 &&
  Math.abs(current.arrowLeft - next.arrowLeft) < 0.5 &&
  Math.abs(current.arrowTop - next.arrowTop) < 0.5

export default function Tooltip({
  children,
  content,
  placement = 'top',
  hoverDelay = 1500,
  focusDelay = 1500,
  offset = 8,
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [layout, setLayout] = useState<TooltipLayout | null>(null)
  const [portalEl, setPortalEl] = useState<HTMLDivElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const id = useId()
  const childRef = useRef<HTMLElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    setPortalEl(el)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      document.body.removeChild(el)
    }
  }, [])

  const clearTimer = () => {
    if (!timerRef.current) return
    clearTimeout(timerRef.current)
    timerRef.current = null
  }

  const getLayout = useCallback((): TooltipLayout | null => {
    const node = childRef.current
    const tooltip = tooltipRef.current
    if (!node || !tooltip) return null

    const rect = node.getBoundingClientRect()
    const width = tooltip.offsetWidth
    const height = tooltip.offsetHeight
    if (!width || !height) return null

    const targetCenterX = rect.left + rect.width / 2
    const targetCenterY = rect.top + rect.height / 2
    let top = 0
    let left = 0

    switch (placement) {
      case 'top':
        top = rect.top - offset - height
        left = targetCenterX - width / 2
        break
      case 'bottom':
        top = rect.bottom + offset
        left = targetCenterX - width / 2
        break
      case 'left':
        top = targetCenterY - height / 2
        left = rect.left - offset - width
        break
      case 'right':
        top = targetCenterY - height / 2
        left = rect.right + offset
        break
    }

    const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - width - VIEWPORT_PADDING)
    const maxTop = Math.max(VIEWPORT_PADDING, window.innerHeight - height - VIEWPORT_PADDING)
    const nextLeft = clamp(left, VIEWPORT_PADDING, maxLeft)
    const nextTop = clamp(top, VIEWPORT_PADDING, maxTop)

    return {
      top: nextTop,
      left: nextLeft,
      arrowLeft: clamp(targetCenterX - nextLeft, ARROW_EDGE_PADDING, Math.max(ARROW_EDGE_PADDING, width - ARROW_EDGE_PADDING)),
      arrowTop: clamp(targetCenterY - nextTop, ARROW_EDGE_PADDING, Math.max(ARROW_EDGE_PADDING, height - ARROW_EDGE_PADDING)),
    }
  }, [offset, placement])

  const updatePosition = useCallback(() => {
    const nextLayout = getLayout()
    if (!nextLayout) return

    setLayout((current) => (sameLayout(current, nextLayout) ? current : nextLayout))
  }, [getLayout])

  const showAfter = (delay: number) => {
    clearTimer()
    timerRef.current = setTimeout(() => {
      setLayout(null)
      setVisible(true)
    }, delay)
  }

  const hideNow = () => {
    clearTimer()
    setVisible(false)
    setLayout(null)
  }

  useLayoutEffect(() => {
    if (!visible) return

    updatePosition()
  }, [visible, updatePosition, content])

  useEffect(() => {
    if (!visible) return

    const onScroll = () => updatePosition()
    const onResize = () => updatePosition()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [visible, updatePosition])

  const onlyChild = React.Children.only(children)
  const childWithProps = cloneElement(onlyChild, {
    ref: (node: HTMLElement | null) => {
      childRef.current = node
      const { ref } = onlyChild.props

      if (typeof ref === 'function') ref(node)
      else if (ref && typeof ref === 'object') ref.current = node
    },
    onMouseEnter: (event: MouseEvent<HTMLElement>) => {
      onlyChild.props.onMouseEnter?.(event)
      showAfter(hoverDelay)
    },
    onMouseLeave: (event: MouseEvent<HTMLElement>) => {
      onlyChild.props.onMouseLeave?.(event)
      hideNow()
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      onlyChild.props.onFocus?.(event)
      showAfter(focusDelay)
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      onlyChild.props.onBlur?.(event)
      hideNow()
    },
    'aria-describedby': visible
      ? [onlyChild.props['aria-describedby'], `${id}-tooltip`].filter(Boolean).join(' ')
      : onlyChild.props['aria-describedby'],
  })

  const tooltipStyle: TooltipStyle = {
    top: layout?.top ?? 0,
    left: layout?.left ?? 0,
    position: 'fixed',
    '--tooltip-arrow-left': `${layout?.arrowLeft ?? 0}px`,
    '--tooltip-arrow-top': `${layout?.arrowTop ?? 0}px`,
  }

  return (
    <>
      {childWithProps}

      {portalEl &&
        visible &&
        createPortal(
          <div
            ref={tooltipRef}
            id={`${id}-tooltip`}
            role="tooltip"
            className={`${styles.tooltip} ${styles[placement]} ${layout ? styles.ready : styles.measuring} ${className || ''}`}
            style={tooltipStyle}
          >
            <div className={styles.bubble}>
              {content}
              <span className={styles.arrow} aria-hidden="true" />
            </div>
          </div>,
          portalEl,
        )}
    </>
  )
}
