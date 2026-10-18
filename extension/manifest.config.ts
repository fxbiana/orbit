import { defineManifest } from "@crxjs/vite-plugin"

// Public key only. It pins the unpacked extension id to
// gpnknnpdogpdgeejedabdihnacblhmmj so the Clerk allowed origin does not change
// between loads. The matching private key is not in this repo.
const EXTENSION_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1nTDIFkxd1uvsUCrSNFG++tDYyvjKr5/hJSLco5hHZ12x/U59qTeN/z9pEA58OMShwhIgSskZsNN/1Ao5hYlJptdql9oiSsGxdcOKagm1s3EIF9WcxD6kVoh9xEwR47MlFZ4r7QC2VBCvYz/H4+MqYx8MHG9L/evSkP5bWgMnA/OprRslQ/zgByfORJ9CiuZ7c17pnhOi1To3aDUZbze7H3gR29P6Sn31MJqPvKD7d20nQzAi3Inr/OQk8qOYcPaDwrgP+wEpvY4T5wp8Hm/bj4kDSfUZeb+Z6N7MFospSvyn6noxrQZdMr36MVf9xZas75LfrerxzOcEx4362YGqwIDAQAB"

export default defineManifest({
  manifest_version: 3,
  name: "Orbit",
  description: "Save the current tab to Orbit and find people to go with.",
  version: "0.1.0",
  key: EXTENSION_KEY,
  action: {
    default_popup: "src/popup/index.html",
    default_title: "Orbit",
  },

  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  permissions: ["activeTab", "storage"],
  host_permissions: ["http://localhost:5000/*", "https://*.clerk.accounts.dev/*"],
  content_scripts: [
    {
      matches: ["https://www.instagram.com/*", "https://instagram.com/*"],
      js: ["src/content/instagram.ts"],
      run_at: "document_idle",
    },
  ],
})
