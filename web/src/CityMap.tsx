import { CITIES } from "./onboarding"

type CityName = (typeof CITIES)[number]

type Pin = {
  name: CityName
  x: number
  y: number
  label: "left" | "right"
}

// Positions are percentages of the map. North America uses a simple
// lat/long layout; London sits on a United Kingdom inset.
const PINS: Pin[] = [
  { name: "Vancouver", x: 12.2, y: 23.2, label: "right" },
  { name: "Seattle", x: 13.1, y: 27.6, label: "right" },
  { name: "Portland", x: 12.6, y: 32.8, label: "right" },
  { name: "San Francisco", x: 12.9, y: 52.0, label: "right" },
  { name: "Los Angeles", x: 17.2, y: 61.4, label: "right" },
  { name: "Denver", x: 30.6, y: 47.2, label: "right" },
  { name: "Austin", x: 37.9, y: 70.8, label: "right" },
  { name: "Chicago", x: 48.1, y: 41.8, label: "right" },
  { name: "Toronto", x: 56.4, y: 37.2, label: "left" },
  { name: "Boston", x: 64.8, y: 40.4, label: "left" },
  { name: "New York", x: 61.8, y: 44.8, label: "left" },
  { name: "London", x: 88.6, y: 41.5, label: "left" },
]

type CityMapProps = {
  value: string
  onChange: (city: CityName) => void
}

export function CityMap({ value, onChange }: CityMapProps) {
  const selected = PINS.some((pin) => pin.name === value) ? value : ""

  return (
    <fieldset className="city-map-field">
      <legend>City</legend>
      <p className="city-map-status">{selected || "Tap a city on the map."}</p>
      <div className="city-map">
        <svg viewBox="0 0 680 400" aria-hidden="true">
          <rect width="680" height="400" fill="#f3dccb" />
          <path
            fill="#fff8f3"
            stroke="#c4a090"
            strokeWidth="1.5"
            d="M42 118
              C50 68 96 46 168 40
              C260 32 350 40 430 48
              C500 56 536 78 528 116
              C522 146 496 156 490 174
              C512 192 498 214 468 218
              C450 252 472 292 428 314
              C396 332 368 318 346 342
              C324 366 286 372 258 348
              C228 324 206 346 176 360
              C140 376 112 342 100 304
              C88 266 72 236 66 198
              C56 156 34 148 42 118 Z"
          />
          <path
            fill="#f3dccb"
            d="M318 148
              C340 142 358 154 352 170
              C344 184 324 180 316 166
              C312 156 316 150 318 148 Z
              M360 156
              C382 150 396 164 388 178
              C376 188 360 180 358 168
              C358 160 360 156 360 156 Z"
          />
          <g transform="translate(548, 86)">
            <rect width="112" height="148" rx="16" fill="#fffdfb" stroke="#edd0be" />
            <text x="56" y="24" textAnchor="middle" fill="#7a5548" fontSize="12" fontWeight="700">
              United Kingdom
            </text>
            <path
              fill="#fff8f3"
              stroke="#c4a090"
              strokeWidth="1.5"
              d="M54 40
                C70 36 78 52 72 68
                C86 78 80 104 62 114
                C54 128 38 124 36 106
                C22 98 24 74 38 62
                C32 48 42 40 54 40 Z"
            />
          </g>
        </svg>
        {PINS.map((pin) => {
          const pressed = pin.name === selected
          return (
            <button
              key={pin.name}
              type="button"
              className={pressed ? `city-pin is-selected label-${pin.label}` : `city-pin label-${pin.label}`}
              style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
              aria-pressed={pressed}
              onClick={() => onChange(pin.name)}
            >
              <span className="city-pin-name">{pin.name}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
