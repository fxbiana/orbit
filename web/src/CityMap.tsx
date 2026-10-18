import { useEffect, useState } from "react"
import { CITIES } from "./onboarding"
import { COUNTRY_SHAPES, WORLD_VIEW } from "./worldMap"

type CityName = (typeof CITIES)[number]

type Place = {
  name: CityName
  country: string
  x: number
  y: number
}

// ViewBox coordinates on the world map. Checked so each pin sits on its country.
const PLACES: Place[] = [
  { name: "Vancouver", country: "Canada", x: 152, y: 164 },
  { name: "Seattle", country: "United States of America", x: 154, y: 168 },
  { name: "Portland", country: "United States of America", x: 153, y: 174 },
  { name: "San Francisco", country: "United States of America", x: 159, y: 191 },
  { name: "Los Angeles", country: "United States of America", x: 168, y: 194 },
  { name: "Denver", country: "United States of America", x: 200, y: 190 },
  { name: "Austin", country: "United States of America", x: 219, y: 204 },
  { name: "Chicago", country: "United States of America", x: 247, y: 184 },
  { name: "Toronto", country: "Canada", x: 265, y: 178 },
  { name: "Boston", country: "United States of America", x: 287, y: 181 },
  { name: "New York", country: "United States of America", x: 277, y: 186 },
  { name: "London", country: "United Kingdom", x: 480, y: 158 },
]

const COUNTRY_LABELS: Record<string, string> = {
  "United States of America": "United States",
}

const CHOOSABLE = new Set(PLACES.map((place) => place.country))
const SHAPES = new Map(COUNTRY_SHAPES.map((shape) => [shape.name, shape]))

function countryLabel(name: string): string {
  return COUNTRY_LABELS[name] ?? name
}

function countryOf(city: string): string {
  return PLACES.find((place) => place.name === city)?.country ?? ""
}

/** Web Mercator, in the same coordinates as the country shapes. */
function project(lon: number, lat: number): [number, number] {
  const maxLat = 85.05112878
  const clamped = Math.max(-maxLat, Math.min(maxLat, lat))
  const phi = (clamped * Math.PI) / 180
  const x = ((lon + 180) / 360) * WORLD_VIEW.width
  const y =
    ((1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2) * WORLD_VIEW.height
  return [x, y]
}

function frameFor(places: Place[]) {
  const points = places.map((place) => [place.x, place.y])
  let minX = Math.min(...points.map((point) => point[0]))
  let maxX = Math.max(...points.map((point) => point[0]))
  let minY = Math.min(...points.map((point) => point[1]))
  let maxY = Math.max(...points.map((point) => point[1]))
  const padX = Math.max((maxX - minX) * 0.35, 22)
  const padY = Math.max((maxY - minY) * 0.35, 22)
  return {
    minX: minX - padX,
    minY: minY - padY,
    width: maxX - minX + padX * 2,
    height: maxY - minY + padY * 2,
  }
}

function Graticule() {
  const lines = []
  for (let lon = -150; lon <= 150; lon += 30) {
    const x = ((lon + 180) / 360) * WORLD_VIEW.width
    lines.push(<line key={`lon-${lon}`} x1={x} y1={0} x2={x} y2={WORLD_VIEW.height} />)
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = project(0, lat)[1]
    lines.push(<line key={`lat-${lat}`} x1={0} y1={y} x2={WORLD_VIEW.width} y2={y} />)
  }
  return <g className="graticule">{lines}</g>
}

type CityMapProps = {
  value: string
  onChange: (city: string) => void
}

export function CityMap({ value, onChange }: CityMapProps) {
  const selected = PLACES.some((place) => place.name === value) ? value : ""
  const [country, setCountry] = useState(() => countryOf(selected))

  useEffect(() => {
    const next = countryOf(selected)
    if (next) setCountry(next)
  }, [selected])

  function chooseCountry(next: string) {
    setCountry(next)
    if (selected && countryOf(selected) !== next) onChange("")
  }

  const shape = SHAPES.get(country)
  const places = PLACES.filter((place) => place.country === country)
  const frame = places.length > 0 ? frameFor(places) : null

  return (
    <fieldset className="city-map-field">
      <legend>City</legend>
      <p className="city-map-status">
        {selected && countryOf(selected) === country
          ? selected
          : country
            ? "Tap a city."
            : "Tap a country, then a city."}
      </p>
      <div className="city-map-layout">
        <div className="city-map">
          <svg viewBox={`0 0 ${WORLD_VIEW.width} ${WORLD_VIEW.height}`} role="group" aria-label="World map">
            <rect width={WORLD_VIEW.width} height={WORLD_VIEW.height} className="ocean" />
            <Graticule />
            {COUNTRY_SHAPES.map((countryShape) => {
              const choosable = CHOOSABLE.has(countryShape.name)
              const pressed = countryShape.name === country
              const label = countryLabel(countryShape.name)
              if (!choosable) {
                return <path key={countryShape.name} d={countryShape.d} className="world-country is-static" />
              }
              return (
                <path
                  key={countryShape.name}
                  d={countryShape.d}
                  className={pressed ? "world-country is-selected" : "world-country"}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  aria-pressed={pressed}
                  onClick={() => chooseCountry(countryShape.name)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      chooseCountry(countryShape.name)
                    }
                  }}
                >
                  <title>{label}</title>
                </path>
              )
            })}
          </svg>
        </div>
        <aside className="country-card">
          <p className="country-card-name">{country ? countryLabel(country) : "Country"}</p>
          {shape && frame ? (
            <div className="country-card-map">
              <svg viewBox={`${frame.minX} ${frame.minY} ${frame.width} ${frame.height}`} aria-hidden="true">
                <rect
                  x={frame.minX}
                  y={frame.minY}
                  width={frame.width}
                  height={frame.height}
                  className="ocean"
                />
                <path d={shape.d} className="world-country is-selected" />
              </svg>
              {places.map((place) => {
                const left = ((place.x - frame.minX) / frame.width) * 100
                const top = ((place.y - frame.minY) / frame.height) * 100
                const pressed = place.name === selected
                const side = left > 62 ? "left" : "right"
                return (
                  <button
                    key={place.name}
                    type="button"
                    className={pressed ? `city-pin is-selected label-${side}` : `city-pin label-${side}`}
                    style={{ left: `${left}%`, top: `${top}%` }}
                    aria-pressed={pressed}
                    onClick={() => onChange(place.name)}
                  >
                    <span className="city-pin-name">{place.name}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="country-card-empty">Tap a country on the map.</p>
          )}
        </aside>
      </div>
    </fieldset>
  )
}
