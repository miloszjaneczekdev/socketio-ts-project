import { useMemo } from 'react'

export default function SVGFilters() {
  const randomSeed = useMemo(() => Math.floor(Math.random() * 10000), [])

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'none' }}
      shapeRendering="geometricPrecision"   // ← DODAJ TU
    >
      <filter id="squiggly-soft" x="-5%" y="-5%" width="110%" height="110%">
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
          result="displaced"
        />
      </filter>
    </svg>


  )
}
