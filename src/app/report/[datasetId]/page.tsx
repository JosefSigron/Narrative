"use client";

import { useEffect, useMemo, useState, use as useUnwrap } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Reveal from "@/components/Reveal";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  LineChart,
  Line,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  Cell,
} from "recharts";
// Chart configuration and styling constants
const CHART_COLORS = ["#00b4d8", "#0096c7", "#48cae4", "#0077b6", "#023e8a"];
const CHART_HEIGHT = "h-64 md:h-80";
const AXIS_STYLING = {
  stroke: "#89ebff",
  tick: { fill: "#c4f5ff" }
};

type Props = { params: Promise<{ datasetId: string }> };

export default function ReportPage({ params }: Props) {
  const { datasetId } = useUnwrap(params);
  const [loading, setLoading] = useState<boolean>(true);
  const [generating, setGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  
  // Generation timing state
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null);
  const [generationProgress, setGenerationProgress] = useState<string>("");

  async function fetchDetail() {
    const r = await fetch(`/api/insights?datasetId=${encodeURIComponent(datasetId)}`, { cache: "no-store" });
    if (!r.ok) throw new Error("Failed to fetch report");
    const json = await r.json();
    return json;
  }

  async function ensureGenerated() {
    setLoading(true);
    setError(null);
    try {
      let current = await fetchDetail();
      const haveContent = Boolean((current?.insights?.length ?? 0) > 0 || (current?.charts?.length ?? 0) > 0 || current?.report);
      if (!haveContent) {
        await startGeneration(false);
      }
      setDetail(current);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  }

  async function startGeneration(isRegeneration: boolean = false) {
    setGenerating(true);
    setGenerationStartTime(Date.now());
    setGenerationProgress(isRegeneration ? "Regenerating insights..." : "Analyzing your data...");
    
    // Get estimate based on previous generation times if available
    const lastGenerationTime = localStorage.getItem('lastGenerationTime');
    const baseEstimate = lastGenerationTime ? 
      Math.max(30, parseFloat(lastGenerationTime) * 1.1) : // 10% buffer on historical time
      50; // Default for GPT-5 if no history
    
    const dataComplexityMultiplier = Math.min(2, Math.max(0.5, (detail?.dataset?.rowCount || 1000) / 1000));
    const initialEstimate = Math.round(baseEstimate * dataComplexityMultiplier);
    
    setEstimatedTimeRemaining(initialEstimate);

    try {
      const res = await fetch(`/api/insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId, regenerate: isRegeneration }),
      });
      
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg = [j?.error, j?.detail].filter(Boolean).join(': ');
        throw new Error(msg || "Generation failed");
      }

      setGenerationProgress("Processing results...");
      
      // Poll for results with progress updates
      const start = Date.now();
      const timeoutMs = 90_000; // Increased timeout for GPT-5
      let pollCount = 0;
      
      while (Date.now() - start < timeoutMs) {
        await new Promise((r) => setTimeout(r, 2000)); // Check every 2 seconds
        pollCount++;
        
        const current = await fetchDetail();
        const ready = Boolean((current?.insights?.length ?? 0) > 0 || (current?.charts?.length ?? 0) > 0 || current?.report);
        
        if (ready) {
          setGenerationProgress("Complete!");
          setDetail(current);
          
          // Store actual generation time for future estimates  
          const actualTime = (Date.now() - (generationStartTime || start)) / 1000;
          localStorage.setItem('lastGenerationTime', actualTime.toString());
          break;
        }
        
        // Update progress based on polling iterations
        const elapsed = (Date.now() - start) / 1000;
        const remaining = Math.max(5, initialEstimate - elapsed);
        setEstimatedTimeRemaining(Math.round(remaining));
        
        if (pollCount <= 3) {
          setGenerationProgress("Analyzing data structure...");
        } else if (pollCount <= 8) {
          setGenerationProgress("Generating insights...");
        } else if (pollCount <= 15) {
          setGenerationProgress("Creating visualizations...");
        } else {
          setGenerationProgress("Finalizing report...");
        }
      }
    } catch (error) {
      throw error;
    }
  }

  useEffect(() => {
    ensureGenerated();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  const dataset = detail?.dataset;
  const charts = detail?.charts ?? [];
  const plotGroups = detail?.plotGroups ?? [];
  // const insights = detail?.insights ?? []; // Available for future use
  const summaryMarkdown = detail?.report?.markdown ?? "";
  const sampleRows = useMemo(() => Array.isArray(dataset?.sampleRows) ? dataset.sampleRows : [], [dataset]);

  // Extract summary and further ideas from markdown-like content without rendering '#'
  const { summaryText, ideas } = useMemo(() => {
    const text = String(summaryMarkdown || "");
    const lower = text.toLowerCase();
    const markerIdx = lower.indexOf("further exploration ideas");
    let summary = markerIdx >= 0 ? text.slice(0, markerIdx) : text;
    const tail = markerIdx >= 0 ? text.slice(markerIdx) : "";
    // Strip leading markdown '#' and trim
    summary = summary.replace(/^#+\s*/gm, "").trim();
    // Remove redundant leading heading words like "Executive Summary", "Summary", or "Data Summary"
    summary = summary.replace(/^\s*(executive\s+summary|summary|data\s+summary)\s*[:\-]?\s*/i, "");
    // Parse ideas as list items from tail
    const ideaLines: string[] = [];
    tail.split(/\r?\n/).forEach((line) => {
      const cleaned = line.replace(/^#+\s*/g, "").trim();
      if (/^(?:[-*•]|\d+[.)])\s+/.test(cleaned)) {
        ideaLines.push(cleaned.replace(/^(?:[-*•]|\d+[.)])\s+/, ""));
      }
    });
    return { summaryText: summary, ideas: ideaLines };
  }, [summaryMarkdown]);

  const [activeChartIdx, setActiveChartIdx] = useState(0);
  const limitedCharts = (charts ?? []).slice(0, 5);
  // const [activeGroupIdx, setActiveGroupIdx] = useState(0); // Available for future use
  const [activePlotIdxByGroup, setActivePlotIdxByGroup] = useState<Record<number, number>>({});
  function setActivePlot(groupIdx: number, plotIdx: number) {
    setActivePlotIdxByGroup((prev) => ({ ...prev, [groupIdx]: plotIdx }));
  }

  // Utility functions for data processing
  const parseNumber = (value: any): number => {
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const cleaned = value.replace(/[,$%]/g, ''); // Remove common formatting
      const num = parseFloat(cleaned);
      return isFinite(num) ? num : 0;
    }
    return 0;
  };

  const detectDataType = (values: any[]): 'numeric' | 'categorical' | 'temporal' => {
    const sample = values.slice(0, 10).filter(v => v != null && v !== '');
    if (sample.length === 0) return 'categorical';

    // Check for dates
    const dateFormats = sample.filter(v => {
      if (typeof v !== 'string') return false;
      return !isNaN(Date.parse(v)) || /^\d{4}$/.test(v) || /^\d{4}-\d{2}$/.test(v);
    });
    if (dateFormats.length > sample.length * 0.5) return 'temporal';

    // Check for numbers
    const numbers = sample.filter(v => {
      if (typeof v === 'number') return isFinite(v);
      if (typeof v === 'string') {
        const cleaned = v.replace(/[,$%]/g, '');
        return !isNaN(parseFloat(cleaned)) && isFinite(parseFloat(cleaned));
      }
      return false;
    });
    if (numbers.length > sample.length * 0.7) return 'numeric';

    return 'categorical';
  };

  const createHistogramData = (values: any[], xKey: string, bins: number = 10) => {
    const numericValues = values.map(parseNumber).filter(v => isFinite(v));
    if (numericValues.length === 0) return [];

    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);
    if (min === max) return [{ [xKey]: min, value: numericValues.length }];

    const binSize = (max - min) / bins;
    const histogram = new Array(bins).fill(0).map((_, i) => ({
      [xKey]: `${(min + i * binSize).toFixed(1)} - ${(min + (i + 1) * binSize).toFixed(1)}`,
      value: 0,
      binIndex: i
    }));

    numericValues.forEach(value => {
      let binIndex = Math.floor((value - min) / binSize);
      if (binIndex >= bins) binIndex = bins - 1;
      if (binIndex < 0) binIndex = 0;
      histogram[binIndex].value++;
    });

    return histogram.filter(bin => bin.value > 0);
  };

  const processChartData = (sampleRows: any[], spec: any) => {
    const { xKey, yKey, aggregation, dataType, type } = spec;
    const rows = Array.isArray(sampleRows) ? sampleRows : [];
    
    if (rows.length === 0 || !xKey) {
      console.warn('processChartData: No data or missing xKey', { rows: rows.length, xKey });
      return [];
    }

    try {
      // Get values for analysis
      const xValues = rows.map(r => r?.[xKey]).filter(v => v != null && v !== '');
      const yValues = yKey ? rows.map(r => r?.[yKey]).filter(v => v != null && v !== '') : [];
      
      // Debug logging to track data loss
      console.log(`🔍 Data Processing Debug:`, {
        originalRows: rows.length,
        xKey,
        yKey,
        aggregation,
        dataType,
        chartType: spec?.type,
        xValuesAfterFilter: xValues.length,
        yValuesAfterFilter: yValues.length,
        uniqueXValues: new Set(xValues).size,
        sampleXValues: xValues.slice(0, 5),
        sampleRows: rows.slice(0, 3), // Show first 3 full rows
      });
      
      // CRITICAL: Check if we're getting the aggregation we expect
      if (aggregation === 'count' && xValues.length > 50) {
        console.warn(`⚠️ AGGREGATION ISSUE: You have ${xValues.length} data points but using count aggregation will reduce to ${new Set(xValues).size} unique categories!`);
      }
      
      if (xValues.length === 0) {
        console.warn(`❌ No valid X values found for column "${xKey}"`);
        return [];
      }

      // Handle histogram type specifically
      if (spec?.type === 'histogram') {
        return createHistogramData(xValues, xKey, 12);
      }

      // Auto-detect data type if not specified correctly
      const actualXType = detectDataType(xValues);
      const actualYType = yKey ? detectDataType(yValues) : 'numeric';

      // Process based on chart type and aggregation
      if (aggregation === 'count' || (!yKey && type !== 'scatter')) {
        // Count aggregation - group by xKey and count occurrences
        const counts = new Map<string, number>();
        
        for (const row of rows) {
          const xVal = row?.[xKey];
          if (xVal == null || xVal === '') continue;
          
          const key = String(xVal);
          counts.set(key, (counts.get(key) || 0) + 1);
        }

        return Array.from(counts.entries())
          .map(([key, count]) => ({
            [xKey]: actualXType === 'numeric' ? parseNumber(key) : key,
            value: count
          }))
          .sort((a, b) => {
            if (actualXType === 'numeric') {
              return (a[xKey] as number) - (b[xKey] as number);
            }
            return String(a[xKey]).localeCompare(String(b[xKey]));
          });
      }

      if (aggregation === 'sum' && yKey) {
        // Sum aggregation - group by xKey and sum yKey values
        const sums = new Map<string, number>();
        
        for (const row of rows) {
          const xVal = row?.[xKey];
          const yVal = parseNumber(row?.[yKey]);
          if (xVal == null || xVal === '') continue;
          
          const key = String(xVal);
          sums.set(key, (sums.get(key) || 0) + yVal);
        }

        return Array.from(sums.entries())
          .map(([key, sum]) => ({
            [xKey]: actualXType === 'numeric' ? parseNumber(key) : key,
            [yKey]: sum
          }))
          .sort((a, b) => {
            if (actualXType === 'numeric') {
              return (a[xKey] as number) - (b[xKey] as number);
            }
            return String(a[xKey]).localeCompare(String(b[xKey]));
          });
      }

      if (aggregation === 'avg' && yKey) {
        // Average aggregation - group by xKey and average yKey values
        const groups = new Map<string, { sum: number; count: number }>();
        
        for (const row of rows) {
          const xVal = row?.[xKey];
          const yVal = parseNumber(row?.[yKey]);
          if (xVal == null || xVal === '') continue;
          
          const key = String(xVal);
          const existing = groups.get(key) || { sum: 0, count: 0 };
          groups.set(key, { sum: existing.sum + yVal, count: existing.count + 1 });
        }

        return Array.from(groups.entries())
          .map(([key, { sum, count }]) => ({
            [xKey]: actualXType === 'numeric' ? parseNumber(key) : key,
            [yKey]: count > 0 ? sum / count : 0
          }))
          .sort((a, b) => {
            if (actualXType === 'numeric') {
              return (a[xKey] as number) - (b[xKey] as number);
            }
            return String(a[xKey]).localeCompare(String(b[xKey]));
          });
      }

      // If chart is a BAR with non-aggregated categorical x and duplicates, auto-aggregate to avoid repeated x
      if ((spec?.type === 'bar' || spec?.type === 'histogram') && (actualXType === 'categorical' || new Set(xValues).size < xValues.length)) {
        const counts = new Map<string, number>();
        const sums = new Map<string, number>();
        const useSum = Boolean(yKey);
        for (const row of rows) {
          const xVal = row?.[xKey];
          if (xVal == null || xVal === '') continue;
          const key = String(xVal);
          if (useSum) {
            const yVal = parseNumber(row?.[yKey as string]);
            sums.set(key, (sums.get(key) || 0) + yVal);
          } else {
            counts.set(key, (counts.get(key) || 0) + 1);
          }
        }
        const arr = (useSum ? Array.from(sums.entries()).map(([k, v]) => ({ [xKey]: k, [yKey as string]: v }))
                             : Array.from(counts.entries()).map(([k, v]) => ({ [xKey]: k, value: v })));
        return arr.sort((a, b) => String(a[xKey]).localeCompare(String(b[xKey])));
      }

      // No aggregation - return raw data with proper typing and indexing for scatter/line/area plots
      const rawData = rows
        .filter(row => row?.[xKey] != null && row[xKey] !== '')
        .map((row, index) => ({
          [xKey]: actualXType === 'numeric' ? parseNumber(row[xKey]) : row[xKey],
          [yKey || 'value']: yKey ? parseNumber(row[yKey]) : (actualXType === 'numeric' ? parseNumber(row[xKey]) : index + 1),
          _originalIndex: index, // Keep track of original position
          _rowData: row // Keep full row data for debugging
        }));

      // For better visualization of raw data, add some intelligent defaults
      if (!yKey && rawData.length > 0) {
        // If no Y key specified, create meaningful Y values based on data type
        if (actualXType === 'categorical') {
          // For categorical data without Y, spread points vertically for visibility
          rawData.forEach((item, idx) => {
            (item as any).value = Math.random() * 0.8 + 0.1; // Random between 0.1 and 0.9
          });
        }
      }

      return rawData.sort((a, b) => {
        if (actualXType === 'numeric') {
          return (a[xKey] as number) - (b[xKey] as number);
        }
        return String(a[xKey]).localeCompare(String(b[xKey]));
      });

    } catch (error) {
      console.error('Error processing chart data:', error);
      return [];
    }
  };

  function renderChart(card: any, idx: number) {
    const type: string = (card?.type || "").toLowerCase();
    const spec: any = card?.spec || {};
    const xKey: string = spec?.xKey || "";
    const yKey: string = spec?.yKey || null;
    const aggregation: string = spec?.aggregation || "count";
    const explanation: string = spec?.explanation || card?.explanation || "";

    // Validate chart configuration
    if (!xKey) {
      return (
        <div key={idx} className="card p-4">
          <div className="text-sm opacity-70">INVALID CHART</div>
          <div className="font-medium mt-1">Missing X-axis column</div>
          <div className="mt-3 p-4 bg-red-50 border border-red-200 rounded">
            <div className="text-sm text-red-800">
              <div className="font-medium">Configuration Error</div>
              <div className="mt-2 text-xs">No X-axis column specified for this chart.</div>
            </div>

          </div>
        </div>
      );
    }

    // Validate column exists in data
    const availableColumns = sampleRows.length > 0 ? Object.keys(sampleRows[0]) : [];
    if (sampleRows.length > 0 && !availableColumns.includes(xKey)) {
      return (
        <div key={idx} className="card p-4">
          <div className="text-sm opacity-70">{type.toUpperCase()}</div>
          <div className="font-medium mt-1">Column not found</div>
          <div className="mt-3 p-4 bg-red-50 border border-red-200 rounded">
            <div className="text-sm text-red-800">
              <div className="font-medium">Data Error</div>
              <div className="mt-2 text-xs">
                Column "{xKey}" does not exist in the dataset.
                <br />Available columns: {availableColumns.join(', ')}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Validate Y column if specified
    if (yKey && sampleRows.length > 0 && !availableColumns.includes(yKey)) {
      return (
        <div key={idx} className="card p-4">
          <div className="text-sm opacity-70">{type.toUpperCase()}</div>
          <div className="font-medium mt-1">Y-column not found</div>
          <div className="mt-3 p-4 bg-red-50 border border-red-200 rounded">
            <div className="text-sm text-red-800">
              <div className="font-medium">Data Error</div>
              <div className="mt-2 text-xs">
                Column "{yKey}" does not exist in the dataset.
                <br />Available columns: {availableColumns.join(', ')}
              </div>
            </div>
          </div>
        </div>
      );
    }

    let prepared: any[] = [];
    try {
      prepared = processChartData(sampleRows, spec);
    } catch (error) {
      console.error('Chart processing error:', error);
      return (
        <div key={idx} className="card p-4">
          <div className="text-sm opacity-70">{type.toUpperCase()}</div>
          <div className="font-medium mt-1">Processing Error</div>
          <div className="mt-3 p-4 bg-red-50 border border-red-200 rounded">
            <div className="text-sm text-red-800">
              <div className="font-medium">Data Processing Failed</div>
              <div className="mt-2 text-xs">
                Unable to process data for visualization. 
                {error instanceof Error ? ` Error: ${error.message}` : ''}
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    const color = CHART_COLORS[idx % CHART_COLORS.length];

    // Generate chart title
    const getChartTitle = () => {
      if (type === "histogram") return `Distribution of ${xKey}`;
      if (aggregation === "count") return `Count by ${xKey}`;
      if (aggregation === "sum" && yKey) return `Total ${yKey} by ${xKey}`;
      if (aggregation === "avg" && yKey) return `Average ${yKey} by ${xKey}`;
      if (yKey) return `${xKey} vs ${yKey}`;
      return xKey;
    };

    // Show debug info if no data
    if (!prepared || prepared.length === 0) {
      return (
        <div key={idx} className="card p-4">
          <div className="text-sm opacity-70">{type.toUpperCase()}</div>
          <div className="font-medium mt-1">{getChartTitle()}</div>
          <div className="mt-3 p-4 bg-yellow-50 border border-yellow-200 rounded">
            <div className="text-sm text-yellow-800">
              <div className="font-medium">No data to display</div>
              <div className="mt-2 text-xs">
                <div>Sample rows: {sampleRows?.length || 0}</div>
                <div>X Key: {xKey || 'missing'}</div>
                <div>Y Key: {yKey || 'none'}</div>
                <div>Aggregation: {aggregation}</div>
              </div>
            </div>
          </div>
          {explanation && (
            <div className="text-base opacity-90 mt-4 leading-relaxed">{explanation}</div>
          )}
        </div>
      );
    }

    // Limit data points for performance (increased for richer visualizations)
    const limitedData = prepared.slice(0, 500);
    const dataKey = yKey || 'value';

    return (
      <div key={idx} className="card p-4">
        <div className="text-sm opacity-70">{type.toUpperCase()}</div>
        <div className="font-medium mt-1">{getChartTitle()}</div>
        <div className="text-xs opacity-60 mt-1">
          Data points: {prepared.length}{prepared.length > 500 ? ' (showing first 500)' : ''}
        </div>
        <div className={`mt-3 ${CHART_HEIGHT}`}>
          <ResponsiveContainer width="100%" height="100%">
            {(() => {
              try {
                if (type === "bar" || type === "histogram") {
                  return (
                    <BarChart data={limitedData}>
                      <XAxis 
                        dataKey={xKey} 
                        {...AXIS_STYLING}
                        angle={limitedData.length > 10 ? -45 : 0}
                        textAnchor={limitedData.length > 10 ? "end" : "middle"}
                        height={limitedData.length > 10 ? 60 : 30}
                      />
                      <YAxis {...AXIS_STYLING} />
                      <RTooltip 
                        formatter={(value, name) => [value, aggregation === 'count' ? 'Count' : name]}
                        labelFormatter={(label) => `${xKey}: ${label}`}
                      />
                      <Bar 
                        dataKey={dataKey}
                        fill={color} 
                        radius={[4, 4, 0, 0]} 
                      />
                    </BarChart>
                  );
                } else if (type === "line") {
                  return (
                    <LineChart data={limitedData}>
                      <XAxis dataKey={xKey} {...AXIS_STYLING} />
                      <YAxis {...AXIS_STYLING} />
                      <RTooltip 
                        formatter={(value, name) => [value, yKey || 'Value']}
                        labelFormatter={(label) => `${xKey}: ${label}`}
                      />
                      <Line 
                        dataKey={dataKey}
                        stroke={color} 
                        strokeWidth={3} 
                        dot={{ fill: color, strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  );
                } else if (type === "area") {
                  return (
                    <AreaChart data={limitedData}>
                      <XAxis dataKey={xKey} {...AXIS_STYLING} />
                      <YAxis {...AXIS_STYLING} />
                      <RTooltip 
                        formatter={(value, name) => [value, yKey || 'Value']}
                        labelFormatter={(label) => `${xKey}: ${label}`}
                      />
                      <Area 
                        dataKey={dataKey}
                        stroke={color} 
                        fill={color}
                        fillOpacity={0.3}
                        strokeWidth={2}
                      />
                    </AreaChart>
                  );
                } else if (type === "scatter") {
                  return (
                    <ScatterChart data={limitedData}>
                      <XAxis 
                        dataKey={xKey} 
                        {...AXIS_STYLING}
                        type="number"
                        domain={['dataMin', 'dataMax']}
                      />
                      <YAxis 
                        dataKey={yKey} 
                        {...AXIS_STYLING}
                        type="number"
                        domain={['dataMin', 'dataMax']}
                      />
                      <RTooltip 
                        formatter={(value, name) => [value, name]}
                        labelFormatter={() => ''}
                      />
                      <Scatter 
                        data={limitedData} 
                        fill={color}
                      />
                    </ScatterChart>
                  );
                } else if (type === "pie") {
                  return (
                    <PieChart>
                      <RTooltip 
                        formatter={(value, name) => [value, 'Count']}
                      />
                      <Pie 
                        data={limitedData.slice(0, 12)} // Limit pie segments for readability
                        dataKey={dataKey}
                        nameKey={xKey} 
                        outerRadius={100} 
                        innerRadius={45}
                        paddingAngle={2}
                      >
                        {limitedData.slice(0, 12).map((_: any, i: number) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  );
                } else {
                  return (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="text-lg font-medium text-gray-400">Unsupported chart type</div>
                        <div className="text-sm text-gray-400 mt-1">{type}</div>
                      </div>
                    </div>
                  );
                }
              } catch (renderError) {
                console.error('Chart render error:', renderError);
                return (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="text-lg font-medium text-red-400">Rendering Error</div>
                      <div className="text-sm text-gray-400 mt-1">Unable to display chart</div>
                    </div>
                  </div>
                );
              }
            })()}
          </ResponsiveContainer>
        </div>
        {explanation && (
          <div className="text-base opacity-90 mt-4 leading-relaxed border-t pt-4">
            {explanation}
          </div>
        )}
      </div>
    );
  }

  if (loading || generating) {
    return <GenerationLoadingScreen 
      isGenerating={generating}
      progress={generationProgress}
      estimatedTimeRemaining={estimatedTimeRemaining}
      startTime={generationStartTime}
    />;
  }

  if (error) {
    return (
      <div className="min-h-[75vh] flex flex-col items-center justify-center text-center">
        <div className="text-xl font-semibold">Something went wrong</div>
        <div className="text-sm opacity-75 mt-2 whitespace-pre-wrap">{error}</div>
        <Button className="mt-5" onClick={ensureGenerated}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
      <Reveal mode="toggle">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base opacity-80">Report</div>
            <h1 className="text-3xl md:text-5xl font-semibold tracking-tight">{dataset?.name || "Dataset"}</h1>
            <div className="text-sm opacity-80 mt-2">{dataset?.originalFilename} • {dataset?.rowCount} rows</div>
          </div>
          <div className="flex items-center gap-2">
            <ConfirmRegenerate onConfirm={async () => {
              setError(null);
              try {
                await startGeneration(true);
              } catch (e: any) {
                setError(String(e?.message || e));
              } finally {
                setGenerating(false);
                setGenerationStartTime(null);
                setEstimatedTimeRemaining(null);
                setGenerationProgress("");
              }
            }} disabled={generating} />
          </div>
        </div>
      </Reveal>

      <Reveal className="card p-8 md:p-10" mode="toggle">
        <div className="text-2xl md:text-3xl font-semibold">Summary</div>
        <div className="mt-4 whitespace-pre-wrap opacity-95 text-lg leading-8">{summaryText || "No summary available."}</div>
      </Reveal>

      {/* Global single group (fallback for older data - only show if no plotGroups) */}
      {(!Array.isArray(plotGroups) || plotGroups.length === 0) && (
        <Reveal className="space-y-4" mode="toggle">
          <div className="text-2xl md:text-3xl font-semibold">Data Visualizations</div>
          <div className="flex flex-wrap gap-2">
            {limitedCharts.map((c: any, idx: number) => {
              const spec = c?.spec || {};
              const xKey = spec?.xKey;
              const yKey = spec?.yKey;
              const aggregation = spec?.aggregation || 'count';
              
              const getLabel = () => {
                if (aggregation === "count") return `Count by ${xKey}`;
                if (aggregation === "sum" && yKey) return `Total ${yKey}`;
                if (aggregation === "avg" && yKey) return `Average ${yKey}`;
                if (xKey && yKey) return `${xKey} vs ${yKey}`;
                return xKey || 'Chart';
              };
              
              return (
                <Button
                  key={idx}
                  variant={activeChartIdx === idx ? undefined : "outline"}
                  className={`transition ${activeChartIdx === idx ? 'btn-primary' : ''}`}
                  onClick={() => setActiveChartIdx(idx)}
                >
                  {getLabel()}
                </Button>
              );
            })}
          </div>
          <div className="relative">
            <AnimatePresence mode="wait">
              {limitedCharts.length > 0 ? (
                <motion.div
                  key={activeChartIdx}
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.98 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  {renderChart(limitedCharts[activeChartIdx], activeChartIdx)}
                </motion.div>
              ) : (
                <div className="text-sm opacity-70">No charts yet.</div>
              )}
            </AnimatePresence>
          </div>
        </Reveal>
      )}

      {/* Analysis Subjects */}
      {Array.isArray(plotGroups) && plotGroups.map((group: any, gIdx: number) => {
        const plots: any[] = Array.isArray(group?.plots) ? group.plots : [];
        const limitedPlots = plots.slice(0, 5); // Limit to 5 plots per subject
        const activeIdx = activePlotIdxByGroup[gIdx] ?? 0;
        
        // Generate better button labels
        const getPlotLabel = (plot: any, index: number) => {
          const type = plot?.type || 'chart';
          const spec = plot?.spec || {};
          const xKey = spec?.xKey;
          const yKey = spec?.yKey;
          const aggregation = spec?.aggregation || 'count';
          
          if (type === "histogram") {
            return `${xKey} Distribution`;
          } else if (aggregation === "count") {
            return `Count by ${xKey}`;
          } else if (aggregation === "sum" && yKey) {
            return `Total ${yKey}`;
          } else if (aggregation === "avg" && yKey) {
            return `Average ${yKey}`;
          } else if (xKey && yKey) {
            return `${xKey} vs ${yKey}`;
          } else if (xKey) {
            return `${xKey} Analysis`;
          } else {
            return `Chart ${index + 1}`;
          }
        };
        
        return (
          <Reveal key={gIdx} className="space-y-6" mode="toggle">
            <div className="space-y-3">
              <div className="text-2xl md:text-3xl font-semibold">{group?.groupTitle || `Analysis Subject ${gIdx + 1}`}</div>
              {group?.groupNarrative && (
                <div className="opacity-95 text-lg leading-8 card p-4 bg-blue-50/50 border-blue-200/50">
                  {group.groupNarrative}
                </div>
              )}
            </div>
            
            {limitedPlots.length > 1 && (
              <div className="space-y-2">
                <div className="text-sm font-medium opacity-80">
                  Select Visualization ({limitedPlots.length} available):
                </div>
                <div className="flex flex-wrap gap-2">
                  {limitedPlots.map((p: any, pIdx: number) => (
                    <Button
                      key={pIdx}
                      variant={activeIdx === pIdx ? undefined : 'outline'}
                      className={`transition text-sm ${activeIdx === pIdx ? 'btn-primary' : ''}`}
                      onClick={() => setActivePlot(gIdx, pIdx)}
                    >
                      {getPlotLabel(p, pIdx)}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            
            <div className="relative">
              <AnimatePresence mode="wait">
                {limitedPlots.length > 0 ? (
                  <motion.div
                    key={`${gIdx}-${activeIdx}`}
                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -12, scale: 0.98 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {renderChart(limitedPlots[activeIdx], activeIdx)}
                  </motion.div>
                ) : (
                  <div className="text-sm opacity-70">No plots in this subject.</div>
                )}
              </AnimatePresence>
            </div>
          </Reveal>
        );
      })}

      <Reveal className="card p-8 md:p-10" mode="toggle">
        <div className="text-2xl md:text-3xl font-semibold">Further exploration ideas</div>
        {ideas?.length ? (
          <ul className="mt-4 space-y-2 text-lg opacity-95">
            {ideas.map((idea, i) => (
              <li key={i} className="list-disc ml-6">{idea}</li>
            ))}
          </ul>
        ) : (
          <div className="mt-3 text-lg opacity-90">Consider segmenting by categories, comparing time periods, and enriching with external benchmarks.</div>
        )}
      </Reveal>
    </div>
  );
}

function GenerationLoadingScreen({ 
  isGenerating, 
  progress, 
  estimatedTimeRemaining, 
  startTime 
}: { 
  isGenerating: boolean;
  progress: string;
  estimatedTimeRemaining: number | null;
  startTime: number | null;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [currentTimeRemaining, setCurrentTimeRemaining] = useState(estimatedTimeRemaining);

  useEffect(() => {
    if (!startTime) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - startTime) / 1000);
      setElapsed(elapsedSeconds);
      
      if (estimatedTimeRemaining !== null) {
        const remaining = Math.max(0, estimatedTimeRemaining - elapsedSeconds);
        setCurrentTimeRemaining(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, estimatedTimeRemaining]);

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getProgressPercentage = () => {
    if (!estimatedTimeRemaining || !startTime) return 0;
    const progress = (elapsed / estimatedTimeRemaining) * 100;
    return Math.min(95, Math.max(0, progress)); // Cap at 95% until actually complete
  };

  return (
    <div className="min-h-[75vh] flex flex-col items-center justify-center text-center px-6">
      <div className="max-w-md w-full space-y-8">
        {/* Main heading */}
        <div>
          <div className="text-4xl font-semibold tracking-tight">
            {isGenerating ? "Generating Report" : "Loading"}
          </div>
          {isGenerating && (
            <div className="text-lg opacity-75 mt-2">
              Using GPT-5 for advanced analysis
            </div>
          )}
        </div>

        {/* Progress spinner */}
        <div className="relative">
          <img 
            src="/icons/loading.svg" 
            alt="Loading" 
            className="h-16 w-16 mx-auto animate-spin opacity-80" 
          />
        </div>

        {/* Progress information */}
        {isGenerating && (
          <div className="space-y-4">
            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${getProgressPercentage()}%` }}
              />
            </div>

            {/* Current step */}
            <div className="text-base font-medium text-blue-600">
              {progress}
            </div>

            {/* Time information */}
            <div className="space-y-2 text-sm opacity-75">
              <div>Elapsed: {formatTime(elapsed)}</div>
              {currentTimeRemaining !== null && currentTimeRemaining > 0 && (
                <div>
                  Estimated remaining: ~{formatTime(currentTimeRemaining)}
                </div>
              )}
            </div>

            {/* Helpful tip */}
            <div className="text-xs opacity-60 mt-6 p-4 bg-blue-50 rounded-lg">
              <div className="font-medium mb-1">💡 Tip</div>
              GPT-5 takes longer but provides deeper insights and better visualizations. 
              Hang tight while we analyze your data!
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ConfirmRegenerate({ onConfirm, disabled }: { onConfirm: () => void | Promise<void>; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={disabled}>
        {disabled ? "Generating…" : "Regenerate"}
      </Button>
      <div>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Are you sure?"
          description="This will delete the previous summary!"
          confirmText="Yes, regenerate"
          onConfirm={() => {
            setOpen(false);
            onConfirm();
          }}
        />
      </div>
    </>
  );
}



