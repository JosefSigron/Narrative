import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const datasetId = url.searchParams.get("datasetId");
  if (!datasetId) return NextResponse.json({ error: "Missing datasetId" }, { status: 400 });

  // Ensure ownership
  const dataset = await prisma.dataset.findFirst({ where: { id: datasetId, userId: session.user.id } });
  if (!dataset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [insights, charts, report] = await Promise.all([
    prisma.insight.findMany({ where: { datasetId }, orderBy: { createdAt: "desc" } }),
    prisma.chart.findMany({ where: { datasetId }, orderBy: { createdAt: "desc" } }),
    prisma.report.findFirst({ where: { datasetId }, orderBy: { createdAt: "desc" } }),
  ]);

  return NextResponse.json({ insights, charts, report });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { datasetId } = await req.json();
  if (!datasetId) return NextResponse.json({ error: "Missing datasetId" }, { status: 400 });

  const dataset = await prisma.dataset.findFirst({
    where: { id: datasetId, userId: session.user.id },
  });
  if (!dataset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const columnsText = Array.isArray(dataset.columns)
    ? (dataset.columns as string[]).join(", ")
    : typeof dataset.columns === "string"
    ? dataset.columns
    : "";
  const sampleRowsText = JSON.stringify(dataset.sampleRows ?? [], null, 2);

  const prompt = `You are a data storytelling assistant. Given CSV column names and up to 20 sample rows, produce:
- 5 concise insights with a title and 2-3 sentence explanation
- A suggested chart type for 2 of them (bar/line/scatter/pie) with a simple spec containing xKey and yKey
- A short executive summary for a blog post.
Return JSON with { "insights": [{"title": string, "content": string, "score"?: number}], "charts": [{"type": string, "spec": {"xKey": string, "yKey": string}}], "summary": string }.

Columns: ${columnsText}
SampleRows: ${sampleRowsText}`;

  let json: any = {};
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You output strictly valid JSON only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
    });
    const text = response.choices?.[0]?.message?.content ?? "{}";
    try { json = JSON.parse(text); } catch { json = {}; }
  } catch (err: any) {
    return NextResponse.json({ error: "OpenAI error", detail: String(err?.message || err) }, { status: 500 });
  }

  const created = await prisma.$transaction(async (tx) => {
    const insightCreates = (Array.isArray(json.insights) ? json.insights : []).map((i: any) =>
      tx.insight.create({ data: { datasetId: dataset.id, title: i?.title ?? "Insight", content: i?.content ?? "" } })
    );
    const chartCreates = (Array.isArray(json.charts) ? json.charts : []).map((c: any) =>
      tx.chart.create({ data: { datasetId: dataset.id, type: c?.type ?? "bar", spec: c?.spec ?? {} } })
    );
    const reportCreate = tx.report.create({ data: { datasetId: dataset.id, markdown: json?.summary ?? "" } });
    const results = await Promise.all([...insightCreates, ...chartCreates, reportCreate]);
    return results.length;
  });

  return NextResponse.json({ ok: true, created });
}
