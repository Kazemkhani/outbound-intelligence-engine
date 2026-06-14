import { describe, it, expect } from "vitest";
import {
  normaliseDomain,
  normaliseEmail,
  normaliseLinkedinUrl,
  companyDedupeKey,
  contactDedupeKey,
  signalDedupeKey,
} from "./dedupe";

describe("normaliseDomain", () => {
  it("strips scheme, www, path, query and port", () => {
    expect(normaliseDomain("https://www.Example.com/path?q=1")).toBe("example.com");
    expect(normaliseDomain("http://example.com:8080")).toBe("example.com");
    expect(normaliseDomain("EXAMPLE.COM")).toBe("example.com");
  });
  it("returns null for empty input", () => {
    expect(normaliseDomain(null)).toBeNull();
    expect(normaliseDomain("")).toBeNull();
    expect(normaliseDomain("   ")).toBeNull();
  });
  it("treats www and non-www as the same identity", () => {
    expect(normaliseDomain("www.acme.io")).toBe(normaliseDomain("acme.io"));
  });
});

describe("normaliseEmail", () => {
  it("lowercases and trims", () => {
    expect(normaliseEmail("  Owner@Acme.IO ")).toBe("owner@acme.io");
  });
  it("rejects non-emails", () => {
    expect(normaliseEmail("not-an-email")).toBeNull();
    expect(normaliseEmail("")).toBeNull();
  });
});

describe("normaliseLinkedinUrl", () => {
  it("collapses locale subdomains and strips query", () => {
    expect(normaliseLinkedinUrl("https://uk.linkedin.com/in/Jane-Doe/?trk=abc")).toBe(
      "linkedin.com/in/jane-doe",
    );
    expect(normaliseLinkedinUrl("https://www.linkedin.com/in/jane-doe")).toBe(
      "linkedin.com/in/jane-doe",
    );
  });
});

describe("dedupe keys", () => {
  it("prefers domain then placeId for companies", () => {
    expect(companyDedupeKey({ website: "https://acme.io" })).toBe("domain:acme.io");
    expect(companyDedupeKey({ domain: null, placeId: "ChIJxyz" })).toBe("place:ChIJxyz");
    expect(companyDedupeKey({})).toBeNull();
  });
  it("prefers email then linkedinUrl for contacts", () => {
    expect(contactDedupeKey({ email: "A@b.com" })).toBe("email:a@b.com");
    expect(contactDedupeKey({ linkedinUrl: "https://linkedin.com/in/x" })).toBe(
      "linkedin:linkedin.com/in/x",
    );
    expect(contactDedupeKey({})).toBeNull();
  });
});

describe("signalDedupeKey", () => {
  it("collapses the same event reported twice (URL variations)", () => {
    const a = signalDedupeKey({
      companyDomain: "acme.io",
      type: "hiring",
      sourceUrl: "https://jobs.acme.io/sdr?utm=x",
    });
    const b = signalDedupeKey({
      companyDomain: "www.acme.io",
      type: "hiring",
      sourceUrl: "https://jobs.acme.io/sdr",
    });
    expect(a).toBe(b);
  });

  it("distinguishes different types and subjects", () => {
    const base = { companyDomain: "acme.io", sourceUrl: "https://acme.io/x" };
    expect(signalDedupeKey({ ...base, type: "hiring" })).not.toBe(
      signalDedupeKey({ ...base, type: "funding" }),
    );
  });

  it("falls back to detection day when there is no URL", () => {
    const k = signalDedupeKey({
      companyDomain: "acme.io",
      type: "news",
      detectedAt: new Date("2026-06-14T09:00:00Z"),
    });
    expect(k).toBe("acme.io|news|2026-06-14");
  });
});
