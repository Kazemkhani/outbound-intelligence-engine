import { z } from "zod";

/**
 * Smartlead API response schemas — validated at the boundary so vendor payloads
 * never leak past this mapper (adapter-contract skill). Only fields we map are
 * described; extra wire fields are ignored by Zod.
 *
 * API surface verified against https://api.smartlead.ai/reference (June 2026).
 * Auth: `api_key` query parameter on every request.
 */

// ── POST /api/v1/campaigns ────────────────────────────────────────────────────

export const smartleadCreateCampaignResponse = z.object({
  id: z.number(),
  name: z.string(),
  status: z.string(),
  created_at: z.string(),
});

export type SmartleadCreateCampaignResponse = z.infer<typeof smartleadCreateCampaignResponse>;

// ── POST /api/v1/campaigns/{id}/email-accounts ────────────────────────────────

export const smartleadAddMailboxResponse = z.object({
  ok: z.boolean(),
  campaign_id: z.number(),
  email_account_id: z.number(),
});

export type SmartleadAddMailboxResponse = z.infer<typeof smartleadAddMailboxResponse>;

// ── POST /api/v1/campaigns/{id}/leads ────────────────────────────────────────

export const smartleadAddLeadsResponse = z.object({
  ok: z.boolean(),
  upload_count: z.number(),
  total_leads: z.number(),
  already_exists_count: z.number().optional(),
  invalid_email_count: z.number().optional(),
  duplicate_count: z.number().optional(),
  lead_import_count: z.number().optional(),
});

export type SmartleadAddLeadsResponse = z.infer<typeof smartleadAddLeadsResponse>;

// ── POST /api/v1/campaigns/{id}/leads/send-email ─────────────────────────────
// Smartlead's transactional send within an existing campaign sequence.

export const smartleadSendEmailResponse = z.object({
  ok: z.boolean(),
  email_id: z.string(),
  campaign_id: z.number(),
  lead_email: z.string(),
  message: z.string().optional(),
});

export type SmartleadSendEmailResponse = z.infer<typeof smartleadSendEmailResponse>;
