# Extension, later

The product is the website in `web/`. This folder is the later Chrome extension.

When it ships, it will:

1. Use the same Clerk account as the website.
2. Read the tab that is open.
3. Save that title and URL through `POST /api/tickets`.

It will not keep session tokens in `chrome.storage`. The unpacked id stays `gpnknnpdogpdgeejedabdihnacblhmmj`. The website shows a static sample of this popup.
