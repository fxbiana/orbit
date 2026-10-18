# Extension (Orbit capture)

The website in `web/` owns onboarding, matches, and the social graph. This folder is the Chrome extension: capture the open tab, save it through the API, then send people to the site.

When loaded:

1. Use the same Clerk account as the website (`getToken()` → `Authorization: Bearer`).
2. Read the tab that is open (`chrome.tabs`).
3. Save that title and URL through `POST /api/tickets`.
4. Offer “Find people on Orbit” via `VITE_WEB_APP_URL` (default `http://localhost:5174`).

It will not keep session tokens in `chrome.storage`. It does not talk to Firestore. The unpacked id stays `gpnknnpdogpdgeejedabdihnacblhmmj`. The website shows a static sample of this popup.
