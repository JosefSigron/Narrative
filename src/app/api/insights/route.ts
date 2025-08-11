import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { toFile } from "openai/uploads";

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

  // Try to include plotGroups from report.html if present
  let plotGroups: any[] = [];
  try {
    const parsed = report?.html ? JSON.parse(String(report.html)) : null;
    if (parsed && Array.isArray(parsed.plotGroups)) plotGroups = parsed.plotGroups;
  } catch {}

  return NextResponse.json({
    dataset: {
      id: dataset.id,
      name: dataset.name,
      columns: dataset.columns,
      sampleRows: dataset.sampleRows,
      rowCount: dataset.rowCount,
      originalFilename: dataset.originalFilename,
    },
    insights,
    charts,
    plotGroups,
    report,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OpenAI API key is missing. Set OPENAI_API_KEY in your environment." },
      { status: 500 }
    );
  }

  const { datasetId, regenerate } = await req.json();
  if (!datasetId) return NextResponse.json({ error: "Missing datasetId" }, { status: 400 });

  const dataset = await prisma.dataset.findFirst({
    where: { id: datasetId, userId: session.user.id },
  });
  if (!dataset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Build compact, token-efficient inputs
  const columnsArray: string[] = Array.isArray(dataset.columns)
    ? (dataset.columns as string[])
    : typeof dataset.columns === "string"
    ? String(dataset.columns).split(/\s*,\s*/g).filter(Boolean)
    : [];

  type ColType = "numeric" | "categorical" | "temporal";
  const parseNumber = (v: any): number | null => {
    if (typeof v === "number" && isFinite(v)) return v;
    if (typeof v === "string") {
      const cleaned = v.replace(/[,$%]/g, "");
      const num = parseFloat(cleaned);
      return isFinite(num) ? num : null;
    }
    return null;
  };
  const isDateLike = (v: any): boolean => {
    if (typeof v !== "string") return false;
    return !isNaN(Date.parse(v)) || /^\d{4}([-\/]\d{2}){0,2}$/.test(v);
  };
  const inferType = (values: any[]): ColType => {
    const sample = values.slice(0, 50).filter(v => v != null && v !== "");
    if (sample.length === 0) return "categorical";
    const numCount = sample.reduce((acc, v) => acc + (parseNumber(v) != null ? 1 : 0), 0);
    const dateCount = sample.reduce((acc, v) => acc + (isDateLike(v) ? 1 : 0), 0);
    if (dateCount > sample.length * 0.5) return "temporal";
    if (numCount > sample.length * 0.7) return "numeric";
    return "categorical";
  };

  const allRows: any[] = Array.isArray(dataset.sampleRows) ? (dataset.sampleRows as any[]) : [];
  const downsampleEvenly = (data: any[], max: number) => {
    if (data.length <= max) return data;
    const out: any[] = [];
    const step = (data.length - 1) / (max - 1);
    for (let i = 0; i < max; i++) {
      const idx = Math.round(i * step);
      out.push(data[Math.min(idx, data.length - 1)]);
    }
    return out;
  };

  // Keep prompt rows modest to avoid TPM overages
  const promptRows = downsampleEvenly(allRows, 60);

  const buildProfile = () => {
    const profile: any = { rowCount: dataset.rowCount ?? allRows.length, columns: [] as any[] };
    for (const col of columnsArray) {
      const values = allRows.map(r => r?.[col]).filter(v => v !== undefined);
      const colType = inferType(values);
      const nonNull = values.filter(v => v != null && v !== "");
      const distinctMap = new Map<string, number>();
      for (const v of nonNull) {
        const key = String(v);
        distinctMap.set(key, (distinctMap.get(key) || 0) + 1);
      }
      const distinctCount = distinctMap.size;
      const topValues = Array.from(distinctMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([value, count]) => ({ value, count }));

      const colProfile: any = {
        name: col,
        type: colType,
        missingCount: values.length - nonNull.length,
        distinctCount,
      };

      if (colType === "numeric") {
        const nums = nonNull
          .map(parseNumber)
          .filter((n): n is number => n != null)
          .sort((a, b) => a - b);
        const quantile = (p: number) => (nums.length ? nums[Math.floor(p * (nums.length - 1))] : null);
        const mean = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
        colProfile.stats = {
          min: nums[0] ?? null,
          p25: quantile(0.25),
          p50: quantile(0.5),
          p75: quantile(0.75),
          max: nums[nums.length - 1] ?? null,
          mean,
        };
      } else if (colType === "temporal") {
        const dates = nonNull
          .map(v => new Date(v))
          .filter(d => !isNaN(d.getTime()))
          .sort((a, b) => a.getTime() - b.getTime());
        colProfile.range = {
          start: dates[0]?.toISOString() ?? null,
          end: dates[dates.length - 1]?.toISOString() ?? null,
        };
      } else {
        colProfile.topValues = topValues;
      }

      profile.columns.push(colProfile);
    }
    return profile;
  };

  const columnsText = columnsArray.join(", ");
  const profileTextFull = JSON.stringify(buildProfile(), null, 2);
  const buildPrompt = (maxRows: number) => {
    const rowsLimited = downsampleEvenly(allRows, maxRows);
    const sampleRowsTextLocal = JSON.stringify(rowsLimited, null, 2);
    return {
      promptText: `You are a data visualization expert and storyteller. Analyze the provided dataset and create meaningful, narrative visualizations.

DATASET INFO:
Columns: ${columnsText}
Total Row Count: ${dataset.rowCount}

Compact Profile (types, ranges, top categories):
${profileTextFull}

Sample Data (downsampled to ${rowsLimited.length} rows to fit token limits):
${sampleRowsTextLocal}

  TASK: Create EXACTLY 4-5 distinct analysis groups, each with 2-5 charts. Analyze ALL data provided systematically.

OUTPUT: Return valid JSON with this exact structure:
{
  "insights": [
    {"title": "Key Finding", "content": "What this data reveals in 1-2 sentences", "score": 0.9}
  ],
  "plotGroups": [
    {
      "groupTitle": "Specific Analysis Topic (e.g., 'Sales Performance', 'Customer Demographics')", 
      "groupNarrative": "3-6 sentences explaining what this analysis reveals and why it matters",
      "plots": [
        {
          "type": "bar|line|area|scatter|pie|histogram",
          "spec": {
            "xKey": "exact_column_name_from_dataset",
            "yKey": "exact_column_name_or_null",
            "aggregation": "count|sum|avg|none",
            "dataType": "categorical|numeric|temporal"
          },
          "explanation": "What users learn from this chart"
        }
      ]
    }
  ],
  "summaryMarkdown": "A long, engaging summary (at least 900 characters, preferably multiple paragraphs).\n\nFurther exploration ideas\n- Provide 8-12 concrete, data-grounded suggestions."
}

CHART SELECTION RULES:
1. ANALYZE DATA TYPES FIRST:
   - Look at sample values to determine if columns are numeric, categorical, or date/time
   - Numeric: values that are clearly numbers (sales, age, price, quantity)
   - Categorical: text values, limited distinct values (status, category, type)
   - Temporal: dates, timestamps, years, months

2. CHOOSE APPROPRIATE CHARTS:
   - BAR: Categorical x-axis (text/labels), counts or sums (use with aggregation)
   - SCATTER: Two numeric columns (x AND y both numeric), shows correlations
   - LINE: Time series ONLY (dates/timestamps on x-axis), temporal trends
   - AREA: Time series with magnitude emphasis (temporal x-axis)
   - PIE: Categorical breakdown with counts (single categorical column)
   - HISTOGRAM: Single numeric column distribution (frequency of numeric values)

3. SPECIFICATION GUIDELINES:
   - xKey: Always use exact column name from dataset (REQUIRED)
   - yKey: For scatter plots use numeric column, for others null or appropriate column
   - aggregation: "none" for raw data (PREFERRED), "count" for summaries only
   - dataType: Match actual data type from analysis

4. CHART TYPE DECISION TREE:
   - If x is NUMERIC and y is NUMERIC → use "scatter" 
   - If x is TEMPORAL (dates) → use "line" or "area"
   - If x is CATEGORICAL → use "bar" or "pie"
   - If showing distribution of ONE numeric column → use "histogram"

⚠️ CRITICAL REQUIREMENTS:
- Create EXACTLY 4-5 DISTINCT plot groups, each with 2-5 plots
- Each group must analyze different aspects (e.g., demographics, performance, trends, distributions, correlations)
- Use "aggregation": "none" unless showing category counts
- For scatter plots: BOTH x and y must be numeric columns
- For line plots: x must be temporal (dates/time)
- Always specify valid column names that exist in the dataset
- DO NOT create groups with only 1 plot

EXAMPLE DECISION MAKING:
- age (numeric) vs income (numeric) → scatter plot
- date vs sales → line plot  
- category vs count → bar plot with aggregation count
- single numeric column → histogram

Be specific and use actual column names from the dataset.`,
      rowsCount: rowsLimited.length,
    };
  };

  // Remove legacy prompt (we now build prompts dynamically or use Responses API with files)

  let json: any = {};
  const model = process.env.INSIGHTS_MODEL || "gpt-4o-mini";
  try {
    let text = "{}";
    if (process.env.INSIGHTS_USE_ASSISTANTS === "true") {
      // Responses API + File + json_schema for strict JSON and retrieval
      // Build CSV from stored sample rows
      const header = columnsArray.join(",");
      const esc = (v: any) => {
        if (v == null) return "";
        const s = String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const body = allRows.map(r => columnsArray.map(c => esc(r?.[c])).join(",")).join("\n");
      const datasetCsv = `${header}\n${body}`;

      const fileUpload = await toFile(Buffer.from(datasetCsv, "utf8"), `dataset-${dataset.id}.csv`, { type: "text/csv" });
      const uploaded = await openai.files.create({ file: fileUpload, purpose: "assistants" });

      const instructions = `You are a data visualization expert. Analyze ONLY the attached file via file_search. Create 4-5 distinct analysis subjects with 2-5 plots each.

Dataset metadata:
- Columns: ${columnsArray.join(", ")}
- Total Row Count: ${dataset.rowCount}

CRITICAL REQUIREMENTS:
1. Create EXACTLY 4-5 DISTINCT plot groups (analysis subjects), each with 2-5 plots
2. Each group should focus on a different aspect of the data (e.g., demographics, performance, distributions, relationships, trends)
3. Use only column names that exist in the dataset
4. For chart type selection:
   - BAR: categorical x-axis (text/categories) 
   - SCATTER: two numeric columns (x and y both numeric)
   - LINE: time series or ordered sequences only
   - HISTOGRAM: single numeric column distribution
   - PIE: categorical breakdown with counts
5. ALWAYS specify valid xKey from actual columns
6. Use "aggregation": "none" for individual data points (PREFERRED)
7. Use "aggregation": "count" only for category summaries

Return strictly valid JSON following the provided schema.`;

      const schema: any = {
        name: "InsightsSchema",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            insights: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: { type: "string" },
                  content: { type: "string" },
                  score: { type: "number" }
                },
                required: ["title", "content"]
              }
            },
            plotGroups: {
              type: "array",
              minItems: 4,
              maxItems: 5,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  groupTitle: { type: "string" },
                  groupNarrative: { type: "string", minLength: 200 },
                  plots: {
                    type: "array",
                    minItems: 2,
                    maxItems: 5,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        type: { type: "string", enum: ["bar", "line", "area", "scatter", "pie", "histogram"] },
                        spec: {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            xKey: { type: "string", minLength: 1 },
                            yKey: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] },
                            aggregation: { type: "string", enum: ["none", "count", "sum", "avg"] },
                            dataType: { type: "string", enum: ["categorical", "numeric", "temporal"] }
                          },
                          required: ["xKey", "aggregation", "dataType"]
                        },
                        explanation: { type: "string" }
                      },
                      required: ["type", "spec"]
                    }
                  }
                },
                required: ["groupTitle", "groupNarrative", "plots"]
              }
            },
            summaryMarkdown: { type: "string", minLength: 900 }
          },
          required: ["plotGroups", "summaryMarkdown"]
        }
      };

      // Use Responses API with attachments and file_search tool
      const response = await (openai as any).responses.create({
        model,
        input: instructions,
        tools: [{ type: "file_search" }],
        attachments: [{ file_id: uploaded.id, tools: [{ type: "file_search" }] }],
        response_format: { type: "json_schema", json_schema: schema },
        max_output_tokens: 4000,
      });

      // Extract text output
      text = (response as any).output_text
        || (response as any).output?.[0]?.content?.[0]?.text?.value
        || (response as any).output?.text
        || "{}";
    } else {
      // Fallback: Chat Completions with compact prompt
      const { promptText } = buildPrompt(60);
      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: "You output strictly valid JSON only." },
          { role: "user", content: promptText },
        ],
        response_format: { type: "json_object" },
        max_tokens: 4000,
      });
      text = completion.choices?.[0]?.message?.content ?? "{}";
    }

    const tryExtractJson = (raw: string): any => {
      try {
        return JSON.parse(raw);
      } catch {
        // Attempt to extract first JSON object substring
        const firstBrace = raw.indexOf("{");
        const lastBrace = raw.lastIndexOf("}");
        if (firstBrace >= 0 && lastBrace > firstBrace) {
          const slice = raw.slice(firstBrace, lastBrace + 1);
          try { return JSON.parse(slice); } catch {}
        }
        return null;
      }
    };

    json = tryExtractJson(text) ?? {};
    if (!json || (!Array.isArray(json.plotGroups) && !Array.isArray(json.charts) && !json.summaryMarkdown && !json.summary)) {
      // Strict mode: do not fallback; surface precise error with snippet to aid debugging
      const snippet = String(text || "").slice(0, 400);
      throw new Error(`Assistant returned invalid JSON. Snippet: ${snippet}`);
    }

    try {
      console.log('🤖 AI Generated Charts:', json.plotGroups?.map((g: any) => ({
        groupTitle: g.groupTitle,
        plots: g.plots?.map((p: any) => ({ type: p.type, xKey: p.spec?.xKey, yKey: p.spec?.yKey, aggregation: p.spec?.aggregation }))
      })));
    } catch {}

    // Sanitize summary to remove markdown bold/italics markers like ** and *
    if (typeof json.summaryMarkdown === 'string') {
      json.summaryMarkdown = String(json.summaryMarkdown)
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/_(.*?)_/g, '$1')
        .replace(/`{1,3}([^`]+)`{1,3}/g, '$1');
    }

    // Ensure we have 4-5 plot groups with 2-5 plots per group
    const needExpansion = !Array.isArray(json.plotGroups) || json.plotGroups.length < 4;
    if (needExpansion) {
      try {
        const expansionSchema: any = {
          name: 'InsightsSchemaExpansion',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              plotGroups: {
                type: 'array', minItems: 4, maxItems: 5,
                items: {
                  type: 'object', additionalProperties: false,
                  properties: {
                    groupTitle: { type: 'string' },
                    groupNarrative: { type: 'string', minLength: 200 },
                    plots: {
                      type: 'array', minItems: 2, maxItems: 5,
                      items: {
                        type: 'object', additionalProperties: false,
                        properties: {
                          type: { type: 'string', enum: ['bar','line','area','scatter','pie','histogram'] },
                          spec: {
                            type: 'object', additionalProperties: true,
                            properties: {
                              xKey: { type: 'string', minLength: 1 },
                              yKey: { anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
                              aggregation: { type: 'string', enum: ['none','count','sum','avg'] },
                              dataType: { type: 'string', enum: ['categorical','numeric','temporal'] }
                            },
                            required: ['xKey', 'aggregation', 'dataType']
                          },
                          explanation: { type: 'string' }
                        },
                        required: ['type','spec','explanation']
                      }
                    }
                  },
                  required: ['groupTitle','groupNarrative','plots']
                }
              }
            },
            required: ['plotGroups']
          }
        };
        const expansionPrompt = `Expand the following partial data story into EXACTLY 4-5 coherent plot groups (each with 2-5 plots). Use proper chart types based on data types.

CHART RULES:
- SCATTER: two numeric columns (x AND y numeric)  
- LINE: temporal x-axis (dates/time)
- BAR: categorical x-axis 
- HISTOGRAM: single numeric distribution

Keep column names exactly as seen in data. Return only JSON.

COLUMNS: ${columnsText}
ROWS (sample): ${JSON.stringify(promptRows, null, 2)}

EXISTING OUTPUT TO EXPAND:
${JSON.stringify(json).slice(0, 6000)}`;
        const expansion = await (openai as any).responses.create({
          model,
          input: expansionPrompt,
          response_format: { type: 'json_schema', json_schema: expansionSchema },
          max_output_tokens: 4000,
        });
        const expText = (expansion as any).output_text
          || (expansion as any).output?.[0]?.content?.[0]?.text?.value
          || '{}';
        const expJson = tryExtractJson(expText);
        if (expJson && Array.isArray(expJson.plotGroups) && expJson.plotGroups.length >= 4) {
          json.plotGroups = expJson.plotGroups;
        }
      } catch (expErr) {
        console.warn('Plot group expansion failed; using original groups.', expErr);
      }
    }
  } catch (err: any) {
    const detail = (err?.response?.data?.error?.message) || err?.message || String(err);
    return NextResponse.json({ error: "OpenAI error", detail }, { status: 500 });
  }

  const created = await prisma.$transaction(async (tx) => {
    if (regenerate) {
      await tx.insight.deleteMany({ where: { datasetId: dataset.id } });
      await tx.chart.deleteMany({ where: { datasetId: dataset.id } });
      await tx.report.deleteMany({ where: { datasetId: dataset.id } });
    }
    const insightCreates = (Array.isArray(json.insights) ? json.insights : []).map((i: any) =>
      tx.insight.create({ data: { datasetId: dataset.id, title: i?.title ?? "Insight", content: i?.content ?? "" } })
    );
    // Flatten plots from groups to store individually (compatibility and browsing)
    const flatPlots: any[] = Array.isArray(json.plotGroups)
      ? json.plotGroups.flatMap((g: any) => (Array.isArray(g?.plots) ? g.plots : []))
      : (Array.isArray(json.charts) ? json.charts : []);
    const chartCreates = flatPlots.map((c: any) =>
      tx.chart.create({
        data: {
          datasetId: dataset.id,
          type: c?.type ?? 'bar',
          spec: { 
            xKey: c?.spec?.xKey ?? '',
            yKey: c?.spec?.yKey ?? null,
            aggregation: c?.spec?.aggregation ?? 'count',
            dataType: c?.spec?.dataType ?? 'categorical',
            explanation: c?.explanation ?? "" 
          },
        },
      })
    );
    const reportCreate = tx.report.create({
      data: {
        datasetId: dataset.id,
        markdown: json?.summaryMarkdown ?? json?.summary ?? "",
        html: JSON.stringify({ plotGroups: Array.isArray(json.plotGroups) ? json.plotGroups : [] }),
      },
    });
    const results = await Promise.all([...insightCreates, ...chartCreates, reportCreate]);
    return results.length;
  });

  return NextResponse.json({ ok: true, created });
}
