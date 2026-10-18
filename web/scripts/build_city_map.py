from pathlib import Path

root = Path(__file__).resolve().parents[2]
us, ca, mx, uk = (root / "na_paths.txt").read_text(encoding="utf-8").splitlines()

tsx = f"""import {{ CITIES }} from "./onboarding"

type CityName = (typeof CITIES)[number]

type Pin = {{
  name: CityName
  x: number
  y: number
  label: "left" | "right"
}}

// Percent positions match the map projection (North America, plus a UK inset).
const PINS: Pin[] = [
  {{ name: "Vancouver", x: 8.2, y: 19.5, label: "right" }},
  {{ name: "Seattle", x: 9.1, y: 24.3, label: "right" }},
  {{ name: "Portland", x: 8.7, y: 30.3, label: "right" }},
  {{ name: "San Francisco", x: 9.0, y: 52.5, label: "right" }},
  {{ name: "Los Angeles", x: 14.0, y: 63.2, label: "right" }},
  {{ name: "Denver", x: 29.9, y: 46.9, label: "right" }},
  {{ name: "Austin", x: 38.5, y: 74.0, label: "right" }},
  {{ name: "Chicago", x: 50.6, y: 40.8, label: "right" }},
  {{ name: "Toronto", x: 60.5, y: 35.6, label: "left" }},
  {{ name: "New York", x: 66.9, y: 44.1, label: "left" }},
  {{ name: "Boston", x: 70.4, y: 39.4, label: "left" }},
  {{ name: "London", x: 92.5, y: 49.8, label: "left" }},
]

type CityMapProps = {{
  value: string
  onChange: (city: CityName) => void
}}

export function CityMap({{ value, onChange }}: CityMapProps) {{
  const selected = PINS.some((pin) => pin.name === value) ? value : ""

  return (
    <fieldset className="city-map-field">
      <legend>City</legend>
      <p className="city-map-status">{{selected || "Tap a city on the map."}}</p>
      <div className="city-map">
        <svg viewBox="0 0 680 400" aria-hidden="true">
          <rect width="680" height="400" fill="#f3dccb" />
          <clipPath id="city-map-land">
            <rect x="8" y="12" width="528" height="372" rx="8" />
          </clipPath>
          <g clipPath="url(#city-map-land)" fill="#fff8f3" stroke="#c4a090" strokeWidth="1" strokeLinejoin="round">
            <path d="{ca}" />
            <path d="{us}" />
            <path d="{mx}" />
          </g>
          <g transform="translate(548, 72)">
            <rect width="116" height="168" rx="16" fill="#fffdfb" stroke="#edd0be" />
            <text x="58" y="22" textAnchor="middle" fill="#7a5548" fontSize="12" fontWeight="700">
              United Kingdom
            </text>
            <path fill="#fff8f3" stroke="#c4a090" strokeWidth="1" strokeLinejoin="round" d="{uk}" />
          </g>
        </svg>
        {{PINS.map((pin) => {{
          const pressed = pin.name === selected
          return (
            <button
              key={{pin.name}}
              type="button"
              className={{pressed ? `city-pin is-selected label-${{pin.label}}` : `city-pin label-${{pin.label}}`}}
              style={{{{ left: `${{pin.x}}%`, top: `${{pin.y}}%` }}}}
              aria-pressed={{pressed}}
              onClick={{() => onChange(pin.name)}}
            >
              <span className="city-pin-name">{{pin.name}}</span>
            </button>
          )
        }})}}
      </div>
    </fieldset>
  )
}}
"""

out = root / "web" / "src" / "CityMap.tsx"
out.write_text(tsx, encoding="utf-8")
print("wrote", out, "chars", len(tsx))
