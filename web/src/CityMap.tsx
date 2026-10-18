import { useState } from "react"
import { CITIES } from "./onboarding"

type CityMapProps = {
  value: string
  onChange: (city: string) => void
}

function listedCity(value: string): string {
  const text = value.trim()
  const head = text.split(",")[0]?.trim() ?? ""
  const match = CITIES.find(
    (city) =>
      city.toLocaleLowerCase() === text.toLocaleLowerCase() ||
      city.toLocaleLowerCase() === head.toLocaleLowerCase(),
  )
  return match ?? value
}

export function CityMap({ value, onChange }: CityMapProps) {
  const [open, setOpen] = useState(false)
  const query = value.trim().toLocaleLowerCase()
  const matches = CITIES.filter((city) => city.toLocaleLowerCase().includes(query))

  function choose(city: string) {
    onChange(city)
    setOpen(false)
  }

  return (
    <label htmlFor="location" className="city-field">
      City
      <input
        id="location"
        name="address-level2"
        value={value}
        autoComplete="address-level2"
        placeholder="Seattle"
        role="combobox"
        aria-expanded={open}
        aria-controls="city-options"
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          onChange(listedCity(event.target.value))
          setOpen(true)
        }}
      />
      {open && matches.length > 0 ? (
        <ul id="city-options" className="city-options" role="listbox">
          {matches.map((city) => (
            <li key={city} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={city === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(city)}
              >
                {city}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </label>
  )
}
