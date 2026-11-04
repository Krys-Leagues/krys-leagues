import Image from "next/image"

// Visual bounds in the approved 792 × 686 Hub image, including each button's glow.
const buttonAreas = [
  [47, 275, 222, 54], // Player Profiles
  [269, 275, 214, 54], // Join Leagues
  [483, 275, 220, 54], // League Play
  [47, 329, 222, 49], // KWT
  [269, 329, 214, 49], // Monthlies
  [483, 329, 220, 49], // Bracket Tournaments
  [47, 378, 222, 55], // Overall Leaderboards
  [483, 378, 220, 55], // Hall of Champions
] as const

const tone = "0 0.13 0.34 0.56 0.74 0.88 0.97 1"

export function MainHubButtonClarity({ imageSrc }: { imageSrc: string }) {
  return (
    <>
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <clipPath id="main-hub-button-areas" clipPathUnits="objectBoundingBox">
            {buttonAreas.map(([x, y, width, height]) => (
              <rect
                key={`${x}-${y}`}
                x={x / 792}
                y={y / 686}
                width={width / 792}
                height={height / 686}
                rx={18 / 792}
                ry={18 / 686}
              />
            ))}
          </clipPath>
          <filter id="main-hub-button-clarity" colorInterpolationFilters="sRGB">
            <feConvolveMatrix
              order="3"
              kernelMatrix="0 -0.19 0 -0.19 1.76 -0.19 0 -0.19 0"
              preserveAlpha="true"
            />
            <feColorMatrix type="saturate" values="1.3" />
            <feComponentTransfer>
              <feFuncR type="table" tableValues={tone} />
              <feFuncG type="table" tableValues={tone} />
              <feFuncB type="table" tableValues={tone} />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>
      <Image
        src={imageSrc}
        alt=""
        aria-hidden="true"
        fill
        unoptimized
        draggable={false}
        className="artwork-navigation__image pointer-events-none"
        style={{
          clipPath: "url(#main-hub-button-areas)",
          filter: "url(#main-hub-button-clarity)",
        }}
      />
    </>
  )
}
