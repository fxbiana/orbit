import { cleanup } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"
import { clearPanelCache } from "../panelCache"

afterEach(() => {
  clearPanelCache()
  cleanup()
})
