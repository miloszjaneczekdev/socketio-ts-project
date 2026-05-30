import { useLayoutEffect, useMemo } from 'react'

type SvgFilterMode = 'full' | 'light' | 'off'

function getSvgFilterMode(): SvgFilterMode {
  if (typeof window === 'undefined') return 'off'

  const { navigator } = window
  const ua = navigator.userAgent
  const platform = navigator.platform
  const isTouchMac = platform === 'MacIntel' && navigator.maxTouchPoints > 1
  const isIOS = /iP(?:ad|hone|od)/.test(platform) || isTouchMac
  const isSafari = /Safari/i.test(ua) && !/(?:Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPiOS|Android)/i.test(ua)
  const isCoarsePointer = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  if (isIOS || isCoarsePointer || prefersReducedMotion) return 'off'
  if (isSafari) return 'light'

  return 'full'
}

export default function SVGFilters() {
  const randomSeed = useMemo(() => Math.floor(Math.random() * 10000), [])
  const lightSeed = randomSeed + 17

  useLayoutEffect(() => {
    document.documentElement.dataset.svgFilters = getSvgFilterMode()

    return () => {
      delete document.documentElement.dataset.svgFilters
    }
  }, [])

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{
        position: 'absolute',
        width: 0,
        height: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
      shapeRendering="geometricPrecision"
    >
      <defs>
        <filter
          id="squiggly-soft"
          x="-12%"
          y="-12%"
          width="124%"
          height="124%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012"
            numOctaves={2}
            seed={randomSeed}
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={8}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <filter
          id="squiggly-light"
          x="-8%"
          y="-8%"
          width="116%"
          height="116%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.009"
            numOctaves={1}
            seed={lightSeed}
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={3}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  )
}
