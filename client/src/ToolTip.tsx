import React, { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './ToolTip.module.css'
import type { FocusEvent, MouseEvent, ReactElement, ReactNode, Ref } from 'react'

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

export default function Tooltip({
  children,
  content,
  placement = 'top',
  hoverDelay = 500,
  focusDelay = 0,
  offset = 8,
  className,
}: TooltipProps) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const [portalEl, setPortalEl] = useState<HTMLDivElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const id = useId()
  const childRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    setPortalEl(el)
    return () => {
      document.body.removeChild(el)
    }
  }, [])

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  const showAfter = (delay: number) => {
    clearTimer()
    timerRef.current = setTimeout(() => setOpen(true), delay)
  }

  const hideNow = () => {
    clearTimer()
    setOpen(false)
  }

  const updatePosition = () => {
    const node = childRef.current
    if (!node) return

    const rect = node.getBoundingClientRect()
    let top = 0
    let left = 0

    switch (placement) {
      case 'top':
        top = rect.top - offset
        left = rect.left + rect.width / 2
        break
      case 'bottom':
        top = rect.bottom + offset
        left = rect.left + rect.width / 2
        break
      case 'left':
        top = rect.top + rect.height / 2
        left = rect.left - offset
        break
      case 'right':
        top = rect.top + rect.height / 2
        left = rect.right + offset
        break
    }

    setCoords({ top, left })
  }

  useLayoutEffect(() => {
    if (!open) return

    updatePosition()
    const onScroll = () => updatePosition()
    const onResize = () => updatePosition()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, placement, offset])

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
    'aria-describedby': open
      ? [onlyChild.props['aria-describedby'], `${id}-tooltip`].filter(Boolean).join(' ')
      : onlyChild.props['aria-describedby'],
  })

  return (
    <>
      {childWithProps}

      {portalEl &&
        open &&
        createPortal(
          <div
            id={`${id}-tooltip`}
            role="tooltip"
            className={`${styles.tooltip} ${styles[placement]} ${className || ''}`}
            style={{ top: coords.top, left: coords.left, position: 'fixed' }}
          >
            {content}
            <span className={styles.arrow} aria-hidden="true" />
          </div>,
          portalEl,
        )}
    </>
  )
}
