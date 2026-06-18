import { z } from "zod";
import { normaliseDomain } from "@oie/core";
import type { NormalisedCompany } from "../contracts/model";

/**
 * SearchApi.io (Google Maps engine) response schema — validated at the boundary.
 * Only the fields we map are declared; unknown keys are stripped by Zod.
 * https://www.searchapi.io/docs/google-maps
 */
export const searchApiResponse = z.object({
  local_results: z
    .array(
      z.object({
        title: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        website: z.string().optional(),
        type: z.string().optional(),
        types: z.array(z.string()).optional(),
        rating: z.number().optional(),
        gps_coordinates: z
          .object({ latitude: z.number(), longitude: z.number() })
          .optional(),
        place_id: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
});

export type SearchApiResponse = z.infer<typeof searchApiResponse>;
export type SearchApiResult = SearchApiResponse["local_results"][number];

/** Best-effort country/region from a formatted address tail (mirrors Places). */
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

/** Translate a SearchApi.io Maps result into the unified NormalisedCompany. */
export function resultToCompany(result: SearchApiResult): NormalisedCompany {
  const website = result.website ?? null;
  const { region, country } = splitAddress(result.address);
  const company: NormalisedCompany = {
    domain: normaliseDomain(website),
    name: result.title ?? "unknown",
    website,
    country,
    region,
    lat: result.gps_coordinates?.latitude ?? null,
    lng: result.gps_coordinates?.longitude ?? null,
    placeId: result.place_id ?? null,
    localCategory: result.type ?? result.types?.[0] ?? null,
    // NormalisedCompany has no phone field; keep the Maps switchboard number in
    // `socials` so it survives for the operator (decision-maker mobiles come
    // from Apollo people-search, not Maps).
    socials: result.phone ? { phone: result.phone } : null,
  };
  // Field provenance — everything SearchApi supplied is attributed to it.
  const sources: Record<string, string> = {};
  for (const key of Object.keys(company) as (keyof NormalisedCompany)[]) {
    if (company[key] !== null && company[key] !== undefined) sources[key] = "searchapi";
  }
  company.sources = sources;
  return company;
}
