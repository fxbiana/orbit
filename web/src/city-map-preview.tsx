import { useState } from "react"
import { createRoot } from "react-dom/client"
import { CityMap } from "./CityMap"

function Preview() {
  const [city, setCity] = useState("Seattle")
  return (
    <div style={{ maxWidth: 760, margin: "16px auto 48px" }}>
      <CityMap value={city} onChange={setCity} />
    </div>
  )
}

const el = document.createElement("div")
document.body.prepend(el)
createRoot(el).render(<Preview />)
