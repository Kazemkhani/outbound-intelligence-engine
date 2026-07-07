/**
 * GET  /api/agent/sessions        — list all chat sessions, newest first
 * POST /api/agent/sessions        — create or update a session
 *   body: { sessionId?: string; title: string; messages: AgentMessage[] }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@oie/db";
import { z } from "zod";

const upsertSchema = z.object({
  sessionId: z.string().optional(),
  title: z.string().max(200),
  messages: z.array(z.unknown()),
});

export async function GET(): Promise<Response> {
  const sessions = await prisma.chatSession.findMany({
    select: { id: true, title: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return Response.json(sessions);
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid body." }, { status: 400 });

  const { sessionId, title, messages } = parsed.data;
  // Prisma expects InputJsonValue — cast through unknown→JsonValue.
  const messagesJson = messages as Parameters<typeof prisma.chatSession.create>[0]["data"]["messages"];

  if (sessionId) {
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { title, messages: messagesJson },
    });
    return Response.json({ id: sessionId });
  }

  const session = await prisma.chatSession.create({
    data: { title, messages: messagesJson },
    select: { id: true },
  });
  return Response.json({ id: session.id });
}
