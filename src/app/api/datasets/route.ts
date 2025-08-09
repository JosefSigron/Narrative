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
