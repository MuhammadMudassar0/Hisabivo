import test from "node:test";
import assert from "node:assert/strict";
import { getSiteOrigin } from "../lib/seo";

test("SEO does not invent a canonical domain before deployment", () => {
  assert.equal(getSiteOrigin({}), null);
  assert.equal(getSiteOrigin({ NEXT_PUBLIC_SITE_URL: "" }), null);
});
test("SEO uses the configured public origin before Vercel fallbacks", () => {
  assert.equal(getSiteOrigin({ NEXT_PUBLIC_SITE_URL: "https://finance.example/path?query=yes", VERCEL_PROJECT_PRODUCTION_URL: "project.vercel.app" }), "https://finance.example");
  assert.equal(getSiteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "production.vercel.app", VERCEL_URL: "preview.vercel.app" }), "https://production.vercel.app");
  assert.equal(getSiteOrigin({ VERCEL_URL: "preview.vercel.app" }), "https://preview.vercel.app");
});
test("SEO rejects malformed URLs, non-web schemes, and embedded credentials", () => {
  for (const value of ["javascript:alert(1)", "ftp://example.com", "not a URL", "https://user:secret@example.com"]) {
    assert.equal(getSiteOrigin({ NEXT_PUBLIC_SITE_URL: value }), null);
  }
});
