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
  return (
    <label htmlFor="location">
      City
      <input
        id="location"
        name="address-level2"
        value={value}
        list="orbit-cities"
        autoComplete="address-level2"
        placeholder="Seattle"
        onChange={(event) => onChange(listedCity(event.target.value))}
      />
      <datalist id="orbit-cities">
        {CITIES.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>
    </label>
  )
}
