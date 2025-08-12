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

  // Validate header row before full parse to provide clearer errors
  try {
    const preview: any[] = parse(text, { to_line: 2, skip_empty_lines: true });
    const headerRow: any[] | undefined = Array.isArray(preview) ? preview[0] : undefined;
    if (!headerRow || !Array.isArray(headerRow)) {
      return NextResponse.json({ error: "Invalid CSV format", detail: "Unable to read the first row." }, { status: 400 });
    }
    const headerCells = headerRow.map((c) => String(c ?? "").trim());
    const hasEmpty = headerCells.some((c) => c.length === 0);
    const dupes = new Set<string>();
    const seen = new Set<string>();
    for (const h of headerCells) {
      const key = h.toLowerCase();
      if (seen.has(key)) dupes.add(h);
      seen.add(key);
    }
    const isNumericOrDate = (s: string) => {
      if (!s) return false;
      const num = s.replace(/[,$%]/g, "");
      const looksNum = /^[-+]?\d+(?:\.\d+)?$/.test(num);
      const looksDate = !isNaN(Date.parse(s)) || /^\d{4}([-\/ ]\d{2}){0,2}$/.test(s);
      return looksNum || looksDate;
    };
    const headerLooksLikeData = headerCells.length > 0 && headerCells.every((c) => isNumericOrDate(c));
    if (hasEmpty || dupes.size > 0 || headerLooksLikeData) {
      const reasons: string[] = [];
      if (hasEmpty) reasons.push("blank column name(s)");
      if (dupes.size > 0) reasons.push(`duplicate column name(s): ${Array.from(dupes).slice(0,5).join(", ")}`);
      if (headerLooksLikeData) reasons.push("first row appears to contain data, not column titles");
      return NextResponse.json({
        error: "Invalid CSV header",
        detail: `The first row must contain column titles. Detected ${reasons.join("; ")}. Please include a header row like: Name,Age,Country.`,
      }, { status: 400 });
    }
  } catch (e: any) {
    // Non-fatal: if preview fails, fall through to main parse which will return a generic error
  }

  let records: any[] = [];
  try {
    records = parse(text, { columns: true, skip_empty_lines: true });
  } catch (e: any) {
    return NextResponse.json({
      error: "CSV parse error",
      detail: String(e?.message || e),
      hint: "Ensure the first row contains column titles and that rows have a consistent number of columns.",
    }, { status: 400 });
  }

  const columns = records.length > 0 ? Object.keys(records[0]) : [];
  
  // Improved sampling strategy: take exactly 1000 rows evenly distributed across the dataset
  let sampleRows: any[] = [];
  const totalRows = records.length;
  if (totalRows <= 1000) {
    sampleRows = records;
  } else {
    // Calculate step size to evenly distribute 1000 samples across totalRows
    const step = (totalRows - 1) / (1000 - 1); // -1 to ensure we include the last row
    for (let i = 0; i < 1000; i++) {
      const index = Math.round(i * step);
      // Ensure we don't exceed array bounds
      const safeIndex = Math.min(index, totalRows - 1);
      sampleRows.push(records[safeIndex]);
    }
  }

  const dataset = await prisma.dataset.create({
    data: {
      userId: session.user.id,
      name,
      originalFilename: (file as File).name,
      rowCount: records.length,
      columns,
      sampleRows,
      fullData: text, // Store original CSV content for full dataset analysis
    } as any, // Temporary type assertion until TypeScript picks up new Prisma types
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
