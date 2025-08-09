import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { prisma } from "@/lib/prisma";
import { parse } from "csv-parse/sync";

export const runtime = "nodejs";

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

  const buffer = Buffer.from(await file.arrayBuffer());
  const text = buffer.toString("utf8");

  let records: any[] = [];
  try {
    records = parse(text, { columns: true, skip_empty_lines: true });
  } catch (e: any) {
    return NextResponse.json({ error: "CSV parse error", detail: String(e?.message || e) }, { status: 400 });
  }

  const columns = records.length > 0 ? Object.keys(records[0]) : [];

  const dataset = await prisma.dataset.create({
    data: {
      userId: session.user.id,
      name,
      originalFilename: (file as File).name,
      rowCount: records.length,
      columns: columns,
    },
  });

  return NextResponse.json({ datasetId: dataset.id, columns, rowCount: records.length });
}
