import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { prisma } from "@/lib/prisma";
import { parse } from "csv-parse/sync";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const datasets = await prisma.dataset.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      originalFilename: true,
      rowCount: true,
      columns: true,
      createdAt: true,
      _count: { select: { insights: true, charts: true, reports: true } },
    },
  });
  return NextResponse.json({ datasets });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const name = (form.get("name") as string) || "Untitled Dataset";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const buffer = Buffer.from(await (file as File).arrayBuffer());
  const text = buffer.toString("utf8");

  let records: any[] = [];
  try {
    records = parse(text, { columns: true, skip_empty_lines: true });
  } catch (e: any) {
    return NextResponse.json({ error: "CSV parse error", detail: String(e?.message || e) }, { status: 400 });
  }

  const columns = records.length > 0 ? Object.keys(records[0]) : [];
  const sampleRows = records.slice(0, 20);

  const dataset = await prisma.dataset.create({
    data: {
      userId: session.user.id,
      name,
      originalFilename: (file as File).name,
      rowCount: records.length,
      columns,
      sampleRows,
    },
  });

  return NextResponse.json({ datasetId: dataset.id, columns, rowCount: records.length });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let id: string | null = null;
  try {
    const body = await req.json();
    id = body?.id ?? null;
  } catch {}
  if (!id) {
    const url = new URL(req.url);
    id = url.searchParams.get("id");
  }
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const result = await prisma.dataset.deleteMany({ where: { id, userId: session.user.id } });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, deleted: result.count });
}
