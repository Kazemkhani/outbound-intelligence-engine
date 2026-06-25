import { z } from "zod";
import { normaliseDomain } from "@oie/core";
import type { NormalisedCompany } from "../contracts/model";

/**
 * 2GIS Catalog (Places) API boundary. 2GIS has a full UAE business directory
 * (Dubai, Abu Dhabi, Sharjah) including phone numbers, the phone-first data point
 * global vendors cover poorly. All 2GIS-specific shapes stay in this file; only
 * NormalisedCompany crosses the boundary. We never fabricate: missing fields map
 * to null. See https://docs.2gis.com/en/api/search/places/reference/3.0/items
 */

const dgisContact = z.object({
  type: z.string(),
  value: z.string().optional(),
  text: z.string().optional(),
  url: z.string().optional(),
});

const dgisItem = z.object({
  id: z.string().optional(),
  name: z.string(),
  address_name: z.string().optional(),
  point: z.object({ lat: z.number(), lon: z.number() }).optional(),
  contact_groups: z
    .array(z.object({ contacts: z.array(dgisContact).default([]) }))
    .optional()
    .default([]),
  rubrics: z.array(z.object({ name: z.string() })).optional().default([]),
});

export const dgisItemsResponse = z.object({
  result: z.object({ items: z.array(dgisItem).default([]), total: z.number().optional() }).optional(),
});

export type DgisItem = z.infer<typeof dgisItem>;
export type DgisItemsResponse = z.infer<typeof dgisItemsResponse>;

/** First contact value of a given type across all contact groups. */
function firstContact(item: DgisItem, type: string): string | undefined {
  for (const group of item.contact_groups) {
    for (const c of group.contacts) {
      if (c.type === type) return c.url ?? c.value ?? c.text;
    }
  }
  return undefined;
}

/**
 * Map one 2GIS item to a NormalisedCompany. country defaults to "AE": the UAE
 * 2GIS key only returns UAE results. The business phone is the headline field;
 * the contact's personal mobile is captured elsewhere (verify-by-conversation).
 */
export function dgisItemToCompany(item: DgisItem): NormalisedCompany {
  const website = firstContact(item, "website");
  const phone = firstContact(item, "phone") ?? null;
  const domain = website ? normaliseDomain(website) : null;

  const sources: Record<string, string> = { name: "2gis" };
  if (phone) sources["phone"] = "2gis";
  if (website) sources["website"] = "2gis";
  if (item.point) {
    sources["lat"] = "2gis";
    sources["lng"] = "2gis";
  }
  if (item.rubrics[0]) sources["localCategory"] = "2gis";

  return {
    domain,
    name: item.name,
    website: website ?? null,
    country: "AE",
    region: item.address_name ?? null,
    lat: item.point?.lat ?? null,
    lng: item.point?.lon ?? null,
    placeId: item.id ?? null,
    localCategory: item.rubrics[0]?.name ?? null,
    phone,
    sources,
  };
}
