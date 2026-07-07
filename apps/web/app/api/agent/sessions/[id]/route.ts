export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@oie/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const session = await prisma.chatSession.findUnique({ where: { id } });
  if (!session) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json(session);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  await prisma.chatSession.delete({ where: { id } }).catch(() => null);
  return Response.json({ ok: true });
}
