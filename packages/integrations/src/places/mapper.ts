import { z } from "zod";
import { normaliseDomain } from "@oie/core";
import type { NormalisedCompany } from "../contracts/model";

/** Google Places (Text Search v1) response schema — validated at the boundary. */
export const placesSearchResponse = z.object({
  places: z
    .array(
      z.object({
        id: z.string().optional(),
        displayName: z.object({ text: z.string() }).optional(),
        formattedAddress: z.string().optional(),
        location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
        types: z.array(z.string()).optional(),
        websiteUri: z.string().optional(),
        nationalPhoneNumber: z.string().optional(),
        rating: z.number().optional(),
      }),
    )
    .optional()
    .default([]),
});

export type PlacesSearchResponse = z.infer<typeof placesSearchResponse>;
export type Place = PlacesSearchResponse["places"][number];

/** Best-effort extraction of a country/region from a formatted address tail. */
function splitAddress(address: string | undefined): {
  region: string | null;
  country: string | null;
} {
  if (!address) return { region: null, country: null };
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { region: null, country: null };
  return {
    country: parts[parts.length - 1] ?? null,
    region: parts.length >= 2 ? (parts[parts.length - 2] ?? null) : null,
  };
}

/** Translate a Places result into the unified NormalisedCompany shape. */
export function placeToCompany(place: Place): NormalisedCompany {
  const website = place.websiteUri ?? null;
  const { region, country } = splitAddress(place.formattedAddress);
  const company: NormalisedCompany = {
    domain: normaliseDomain(website),
    name: place.displayName?.text ?? "unknown",
    website,
    country,
    region,
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    placeId: place.id ?? null,
    localCategory: place.types?.[0] ?? null,
  };
  // Record field provenance — every field Places supplied is attributed to it.
  const sources: Record<string, string> = {};
  for (const key of Object.keys(company) as (keyof NormalisedCompany)[]) {
    if (company[key] !== null && company[key] !== undefined) sources[key] = "places";
  }
  company.sources = sources;
  return company;
}
