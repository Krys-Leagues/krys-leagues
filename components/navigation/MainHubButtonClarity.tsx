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

// Keep the original line breaks and left edge of each printed label.
const buttonLabels = [
  { x: 141, y: 299.5, lines: ["PLAYER", "PROFILES"] },
  { x: 346, y: 299.5, lines: ["JOIN", "LEAGUES"] },
  { x: 552, y: 299.5, lines: ["LEAGUE", "PLAY"] },
  { x: 151, y: 359, lines: ["KWT"] },
  { x: 337, y: 359, lines: ["MONTHLIES"] },
  { x: 551, y: 352.5, lines: ["BRACKET", "TOURNAMENTS"] },
  { x: 142, y: 402.5, lines: ["OVERALL", "LEADERBOARDS"] },
  { x: 560, y: 402.5, lines: ["HALL OF", "CHAMPIONS"] },
] as const

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
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          clipPath: "url(#main-hub-button-areas)",
          filter: "url(#main-hub-button-clarity)",
        }}
      >
        <Image src={imageSrc} alt="" fill unoptimized draggable={false} className="artwork-navigation__image" />
        <Image
          src="/approved-pages/main-hub-label-backgrounds.png"
          alt=""
          fill
          unoptimized
          draggable={false}
          className="artwork-navigation__image"
        />
      </div>
      <svg
        viewBox="0 0 792 686"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
        style={{ fontFamily: "var(--font-geist-sans), Arial, sans-serif" }}
      >
        <defs>
          <linearGradient id="main-hub-label-ink" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="68%" stopColor="#fff" />
            <stop offset="100%" stopColor="#e9f6ff" />
          </linearGradient>
        </defs>
        <g
          fill="url(#main-hub-label-ink)"
          stroke="#070811"
          strokeWidth="1.6"
          strokeLinejoin="round"
          paintOrder="stroke fill"
          fontSize="10.5"
          fontWeight="850"
          letterSpacing="0.12"
        >
          {buttonLabels.map(({ x, y, lines }) => (
            <text key={lines[0]} x={x} y={y}>
              {lines.map((line, index) => (
                <tspan key={line} x={x} dy={index === 0 ? 0 : 11.5}>{line}</tspan>
              ))}
            </text>
          ))}
        </g>
      </svg>
    </>
  )
}
