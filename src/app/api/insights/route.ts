import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";

export const runtime = "nodejs";

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

  const prompt = You are a data storytelling assistant. Given CSV column names and up to 20 sample rows, produce:\n- 5 concise insights with a title and 2-3 sentence explanation\n- A suggested chart type for 2 of them (bar/line/scatter/pie) with a simple spec containing xKey and yKey\n- A short executive summary for a blog post.\nReturn JSON with { insights: [{title, content, score?}], charts: [{type, spec}], summary }.
Columns: \nSampleRows: ;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You output strictly valid JSON only." },
      { role: "user", content: prompt },
    ],
    temperature: 0.4,
  });

  const text = response.choices?.[0]?.message?.content ?? "{}";
  let json: any = {};
  try { json = JSON.parse(text); } catch { json = {}; }

  const created = await prisma.(async (tx) => {
    const insightCreates = (json.insights ?? []).map((i: any) =>
      tx.insight.create({ data: { datasetId: dataset.id, title: i.title ?? "Insight", content: i.content ?? "" } })
    );
    const chartCreates = (json.charts ?? []).map((c: any) =>
      tx.chart.create({ data: { datasetId: dataset.id, type: c.type ?? "bar", spec: c.spec ?? {} } })
    );
    const reportCreate = tx.report.create({ data: { datasetId: dataset.id, markdown: json.summary ?? "" } });
    const results = await Promise.all([...insightCreates, ...chartCreates, reportCreate]);
    return results.length;
  });

  return NextResponse.json({ ok: true, created });
}
