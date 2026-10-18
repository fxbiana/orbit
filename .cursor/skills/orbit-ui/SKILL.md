---
name: orbit-ui
description: >-
  Restyle Orbit web and extension UI. Use when editing layout, CSS, the logo,
  onboarding, the city field, or when the user asks to improve the UI, remove
  gradients, or make the interface less AI-like.
---

# Orbit UI

Apply these rules whenever you change the website or extension appearance.

## Flat interface

- Use solid colors from the existing palette. No gradients, glows, glass, or decorative shadows.
- No entrance animations, hover scale, or wide letter-spacing.
- Buttons, cards, and the page background are flat fills with a 1px border when a control needs an edge.

## Logo

- The Orbit logo is small and sits in the top-left corner of the page, beside the account actions.
- Do not center it or scale it up as a hero mark.

## After onboarding

- People, Reach, Events, Plans, and Saved pages are separate views behind one nav bar.
- Show one section at a time. Do not stack them into a single long page.

## City

- City is a text field, not a map.
- The field lists the allowed cities in a menu attached under the input. Do not use a native datalist; that menu opens away from the field.
- The input uses `autoComplete="address-level2"` so the browser can fill it.
- A typed value is kept as the listed city when it matches one, including a browser value like `Seattle, WA`.
- Do not add a world map, country tap target, or pin picker back onto onboarding.
