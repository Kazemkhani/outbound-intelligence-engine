/**
 * POST /api/leads/upload
 * Accepts multipart/form-data with a `file` field (CSV or XLSX).
 *
 * Expected columns (case-insensitive, any order):
 *   first_name / last_name  OR  full_name / name
 *   email
 *   title / job_title
 *   company / company_name
 *   linkedin / linkedin_url
 *   website / company_website / domain
 *
 * Returns: { imported, skipped, errors, segmentId }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@oie/db";
import Papa from "papaparse";
import * as XLSX from "xlsx";

type Row = Record<string, string>;

function normaliseKey(k: string): string {
  return k.toLowerCase().replace(/[\s_\-]+/g, "_");
}

function pick(row: Row, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k]?.trim();
    if (v) return v;
  }
  return "";
}

function parseRows(rows: Row[]) {
  return rows.map((raw) => {
    // Normalise keys
    const row: Row = {};
    for (const [k, v] of Object.entries(raw)) {
      row[normaliseKey(k)] = String(v ?? "").trim();
    }

    const firstName = pick(row, "first_name", "firstname");
    const lastName = pick(row, "last_name", "lastname");
    const fullName = pick(row, "full_name", "name", "contact_name") || [firstName, lastName].filter(Boolean).join(" ");
    const email = pick(row, "email", "email_address", "work_email");
    const title = pick(row, "title", "job_title", "position", "role");
    const companyName = pick(row, "company", "company_name", "organization", "organisation", "account");
    const linkedin = pick(row, "linkedin", "linkedin_url", "linkedin_profile");
    const domain = pick(row, "domain", "website", "company_website", "company_domain");

    return { fullName, email, title, companyName, linkedin, domain };
  });
}

export async function POST(req: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return Response.json({ error: "No file provided. Send a 'file' field." }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !["csv", "xlsx", "xls"].includes(ext)) {
    return Response.json({ error: "Only .csv, .xlsx, and .xls files are supported." }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  let rawRows: Row[] = [];

  try {
    if (ext === "csv") {
      const text = new TextDecoder().decode(bytes);
      const result = Papa.parse<Row>(text, { header: true, skipEmptyLines: true });
      rawRows = result.data;
    } else {
      const wb = XLSX.read(bytes, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]!];
      if (!ws) return Response.json({ error: "Empty workbook." }, { status: 400 });
      rawRows = XLSX.utils.sheet_to_json<Row>(ws, { defval: "" });
    }
  } catch (err) {
    return Response.json({ error: `Failed to parse file: ${err instanceof Error ? err.message : String(err)}` }, { status: 400 });
  }

  if (rawRows.length === 0) {
    return Response.json({ error: "File is empty or has no data rows." }, { status: 400 });
  }

  const parsed = parseRows(rawRows);
  let imported = 0;
  let skipped = 0;
  const importedContactIds: string[] = [];

  for (const p of parsed) {
    if (!p.fullName && !p.email) { skipped++; continue; }
    if (!p.email && !p.linkedin) { skipped++; continue; }

    try {
      // Ensure company row exists if we have a name or domain.
      let companyId: string | null = null;
      const domain = p.domain || (p.email ? p.email.split("@")[1] ?? null : null);

      if (domain && domain !== "gmail.com" && domain !== "yahoo.com" && domain !== "hotmail.com" && domain !== "outlook.com") {
        const existing = await prisma.company.findUnique({ where: { domain } });
        if (existing) {
          companyId = existing.id;
        } else {
          const co = await prisma.company.create({
            data: { domain, name: p.companyName || domain, sources: { domain: "csv_upload" } },
            select: { id: true },
          });
          companyId = co.id;
        }
      } else if (p.companyName) {
        const existing = await prisma.company.findFirst({ where: { name: p.companyName, domain: null } });
        if (existing) {
          companyId = existing.id;
        } else {
          const co = await prisma.company.create({
            data: { domain: null, name: p.companyName, sources: { name: "csv_upload" } },
            select: { id: true },
          });
          companyId = co.id;
        }
      }

      const contactData = {
        companyId,
        fullName: p.fullName || "Unknown",
        title: p.title || null,
        linkedinUrl: p.linkedin || null,
        sources: { upload: "csv" } as Record<string, string>,
      };

      let row: { id: string } | undefined;
      if (p.email) {
        row = await prisma.contact.upsert({
          where: { email: p.email },
          create: { email: p.email, ...contactData },
          update: { title: contactData.title },
          select: { id: true },
        });
      } else if (p.linkedin) {
        row = await prisma.contact.upsert({
          where: { linkedinUrl: p.linkedin },
          create: contactData,
          update: { title: contactData.title },
          select: { id: true },
        });
      }

      if (row) {
        importedContactIds.push(row.id);
        imported++;
      } else {
        skipped++;
      }
    } catch {
      skipped++;
    }
  }

  // Create a named segment for this upload.
  let segmentId: string | undefined;
  if (importedContactIds.length > 0) {
    try {
      const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      const name = `${file.name.replace(/\.[^.]+$/, "")} · ${dateStr}`;
      const seg = await prisma.segment.create({ data: { name }, select: { id: true } });
      await prisma.contactSegment.createMany({
        data: importedContactIds.map((contactId) => ({ contactId, segmentId: seg.id })),
        skipDuplicates: true,
      });
      segmentId = seg.id;
    } catch { /* non-fatal */ }
  }

  return Response.json({ imported, skipped, total: rawRows.length, segmentId });
}
