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
  Legend,
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
  
  // Initialize analysis mode from URL parameter
  const [useSampling, setUseSampling] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const mode = urlParams.get('mode');
      return mode !== 'deep'; // Default to fast (sampling) unless 'deep' is specified
    }
    return true;
  });
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  
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
    setGenerationProgress(isRegeneration ? 
      `Regenerating insights using ${useSampling ? 'Fast Analysis' : 'Deep Analysis'}...` : 
      `Analyzing your data using ${useSampling ? 'Fast Analysis' : 'Deep Analysis'}...`);
    
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
        body: JSON.stringify({ datasetId, regenerate: isRegeneration, useSampling }),
      });
      
      if (!res.ok) {
        let errorMsg = "Generation failed";
        try {
          const j = await res.json();
          errorMsg = [j?.error, j?.detail].filter(Boolean).join(': ') || errorMsg;
        } catch (jsonError) {
          // If JSON parsing fails, try to get text response
          try {
            const text = await res.text();
            errorMsg = text || `HTTP ${res.status}: ${res.statusText}`;
          } catch {
            errorMsg = `HTTP ${res.status}: ${res.statusText}`;
          }
        }
        throw new Error(errorMsg);
      }

      // Read response details for telemetry of fallback/mode
      let responseJson: any = null;
      try {
        const responseText = await res.text();
        responseJson = responseText ? JSON.parse(responseText) : null;
      } catch (jsonError) {
        console.error('Invalid JSON response from insights API:', jsonError);
        throw new Error('Server returned invalid response format');
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
          // Show mode and fallback information for transparency
          if (responseJson?.mode === 'chat') {
            const why = responseJson?.fallbackReason ? ` (fallback: ${responseJson.fallbackReason})` : '';
            setGenerationProgress(`Complete! Used Chat Completions${why}.`);
          } else if (responseJson?.mode === 'assistants') {
            setGenerationProgress('Complete! Used Assistants API.');
          } else {
            setGenerationProgress('Complete!');
          }
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
          setGenerationProgress(`Analyzing data structure (${useSampling ? 'Fast Analysis' : 'Deep Analysis'})...`);
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (dropdownOpen) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [dropdownOpen]);

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

    const minVal = Math.min(...numericValues);
    const maxVal = Math.max(...numericValues);
    if (minVal === maxVal) return [{ [xKey]: `${minVal} - ${maxVal}`, value: numericValues.length }];

    const range = maxVal - minVal;
    const rawBinWidth = range / bins;
    const pow10 = Math.pow(10, Math.floor(Math.log10(rawBinWidth)));
    const candidates = [1, 2, 5, 10].map(m => m * pow10);
    let binWidth = candidates[0];
    for (const c of candidates) {
      if (range / c <= bins) { binWidth = c; break; }
      binWidth = c; // fallback to the last if none <= bins
    }

    // Snap start to a clean boundary
    const start = Math.floor(minVal / binWidth) * binWidth;
    const binCount = Math.max(1, Math.ceil((maxVal - start) / binWidth));

    const histogram = new Array(binCount).fill(0).map((_, i) => ({
      _lower: start + i * binWidth,
      _upper: start + (i + 1) * binWidth,
      value: 0,
      binIndex: i,
    }));

    numericValues.forEach(value => {
      let idx = Math.floor((value - start) / binWidth);
      if (idx >= binCount) idx = binCount - 1; // include max in last bin
      if (idx < 0) idx = 0;
      histogram[idx].value++;
    });

    const formatNumber = (n: number) => {
      const abs = Math.abs(n);
      if (binWidth >= 1000) return Math.floor(n).toString();
      if (binWidth >= 100) return Math.floor(n).toString();
      if (binWidth >= 10) return Math.floor(n).toString();
      return Number(n.toFixed(1)).toString();
    };

    return histogram
      .filter(bin => bin.value > 0)
      .map(bin => ({
        [xKey]: `${formatNumber(bin._lower)} - ${formatNumber(bin._upper)}${bin.binIndex === binCount - 1 ? '' : ''}`,
        value: bin.value,
      }));
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
      const numericCheck = (v: any) => {
        if (typeof v === 'number') return isFinite(v);
        if (typeof v === 'string') {
          const cleaned = v.replace(/[,$%]/g, '');
          return !isNaN(parseFloat(cleaned));
        }
        return false;
      };
      const looksNumeric = xValues.length > 0 && (xValues.filter(numericCheck).length / xValues.length) >= 0.8;
      
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
        const binCount = xValues.length > 400 ? 30 : xValues.length > 100 ? 20 : 12;
        return createHistogramData(xValues, xKey, binCount);
      }

      // Auto-detect data type if not specified correctly
      const actualXType = detectDataType(xValues);
      const actualYType = yKey ? detectDataType(yValues) : 'numeric';

      // If many unique numeric x with count aggregation, auto-convert to histogram bins for readability
      if ((spec?.type === 'bar' || spec?.type === 'histogram') && !yKey && (actualXType === 'numeric' || looksNumeric)) {
        const uniqueCount = new Set(xValues.map(v => String(v))).size;
        if (uniqueCount > 20) {
          const binCount = xValues.length > 400 ? 30 : xValues.length > 100 ? 20 : 12;
          return createHistogramData(xValues, xKey, binCount);
        }
      }

      // Process based on chart type and aggregation
      if (aggregation === 'count' || (!yKey && type !== 'scatter')) {
        // Count aggregation - group by xKey and count occurrences
        const counts = new Map<string, number>();
        
        for (const row of rows) {
          const xVal = row?.[xKey];
          if (xVal == null || xVal === '') continue;
          
          const key = String(xVal).trim();
          counts.set(key, (counts.get(key) || 0) + 1);
        }

        let arr = Array.from(counts.entries())
          .map(([key, count]) => ({
            [xKey]: looksNumeric ? parseNumber(key) : (actualXType === 'numeric' ? parseNumber(key) : key),
            value: count
          }));
        arr = arr.sort((a, b) => {
          if (looksNumeric || actualXType === 'numeric') {
            return (a[xKey] as number) - (b[xKey] as number);
          }
          return String(a[xKey]).localeCompare(String(b[xKey]));
        });
        // Too many categories -> keep top-N by count and group rest into 'Other'
        const MAX_CATEGORIES = 20;
        if (!looksNumeric && arr.length > MAX_CATEGORIES) {
          const sortedByValue = [...arr].sort((a, b) => (b.value as number) - (a.value as number));
          const top = sortedByValue.slice(0, MAX_CATEGORIES);
          const rest = sortedByValue.slice(MAX_CATEGORIES);
          const otherTotal = rest.reduce((sum, r) => sum + (r.value as number), 0);
          arr = top.concat({ [xKey]: 'Other', value: otherTotal } as any);
          // Keep bars ordered by value desc for readability
          arr = arr.sort((a, b) => (b.value as number) - (a.value as number));
        }
        return arr;
      }

      if (aggregation === 'sum' && yKey) {
        // Sum aggregation - group by xKey and sum yKey values
        const sums = new Map<string, number>();
        
        for (const row of rows) {
          const xVal = row?.[xKey];
          const yVal = parseNumber(row?.[yKey]);
          if (xVal == null || xVal === '') continue;
          
          const key = String(xVal).trim();
          sums.set(key, (sums.get(key) || 0) + yVal);
        }

        let arr = Array.from(sums.entries()).map(([key, sum]) => ({
          [xKey]: looksNumeric ? parseNumber(key) : (actualXType === 'numeric' ? parseNumber(key) : key),
          [yKey]: sum
        }));
        arr = arr.sort((a, b) => {
          if (looksNumeric || actualXType === 'numeric') {
            return (a[xKey] as number) - (b[xKey] as number);
          }
          return String(a[xKey]).localeCompare(String(b[xKey]));
        });
        // Too many categories -> keep top-N by summed metric
        const MAX_CATEGORIES = 20;
        if (!looksNumeric && arr.length > MAX_CATEGORIES) {
          const sortedByMetric = [...arr].sort((a: any, b: any) => (b[yKey] as number) - (a[yKey] as number));
          const top = sortedByMetric.slice(0, MAX_CATEGORIES);
          const rest = sortedByMetric.slice(MAX_CATEGORIES);
          const otherTotal = rest.reduce((sum, r: any) => sum + (r[yKey] as number), 0);
          arr = top.concat({ [xKey]: 'Other', [yKey]: otherTotal } as any);
          arr = arr.sort((a: any, b: any) => (b[yKey] as number) - (a[yKey] as number));
        }
        return arr;
      }

      if (aggregation === 'avg' && yKey) {
        // Average aggregation - group by xKey and average yKey values
        const groups = new Map<string, { sum: number; count: number }>();
        
        for (const row of rows) {
          const xVal = row?.[xKey];
          const yVal = parseNumber(row?.[yKey]);
          if (xVal == null || xVal === '') continue;
          
          const key = String(xVal).trim();
          const existing = groups.get(key) || { sum: 0, count: 0 };
          groups.set(key, { sum: existing.sum + yVal, count: existing.count + 1 });
        }

        let arr = Array.from(groups.entries())
          .map(([key, { sum, count }]) => ({
            [xKey]: looksNumeric ? parseNumber(key) : (actualXType === 'numeric' ? parseNumber(key) : key),
            [yKey]: count > 0 ? sum / count : 0,
            _sum: sum,
            _count: count
          }));
        arr = arr.sort((a, b) => {
          if (looksNumeric || actualXType === 'numeric') {
            return (a[xKey] as number) - (b[xKey] as number);
          }
          return String(a[xKey]).localeCompare(String(b[xKey]));
        });
        // Too many categories -> keep top-N by average and group rest into 'Other' using weighted average
        const MAX_CATEGORIES = 20;
        if (!looksNumeric && arr.length > MAX_CATEGORIES) {
          const sortedByAvg = [...arr].sort((a: any, b: any) => (b[yKey] as number) - (a[yKey] as number));
          const top = sortedByAvg.slice(0, MAX_CATEGORIES);
          const rest = sortedByAvg.slice(MAX_CATEGORIES);
          const otherSum = rest.reduce((s, r: any) => s + (r._sum as number), 0);
          const otherCount = rest.reduce((c, r: any) => c + (r._count as number), 0);
          const otherAvg = otherCount > 0 ? otherSum / otherCount : 0;
          const other: any = { [xKey]: 'Other', [yKey]: otherAvg };
          arr = top.concat(other) as any;
          arr = (arr as any).map((entry: any) => {
            const { _sum: _dropSum, _count: _dropCount, ...rest } = entry as any;
            return rest as any;
          });
        } else {
          arr = (arr as any).map((entry: any) => {
            const { _sum: _dropSum, _count: _dropCount, ...rest } = entry as any;
            return rest as any;
          });
        }
        return arr as any[];
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

      // If x-axis is temporal and too many points, prefer scatter for readability
      if (type === 'line' || type === 'area') {
        if (actualXType === 'temporal' && rawData.length > 20) {
          return rawData.map(d => ({ ...d, _forceScatter: true }));
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
                        formatter={(value, name, props: any) => {
                          const labelKey = dataKey === 'value' ? (aggregation === 'count' ? 'Count' : (yKey || 'Value')) : dataKey;
                          return [value, labelKey];
                        }}
                        labelFormatter={(label, payload) => {
                          const first = Array.isArray(payload) && payload[0] ? payload[0] : null;
                          const raw = first?.payload?._rowData || {};
                          // Prefer raw label if available
                          return `${xKey}: ${label}`;
                        }}
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
                      <XAxis 
                        dataKey={xKey} 
                        {...AXIS_STYLING}
                        tick={{ ...AXIS_STYLING.tick, fontSize: 10 }}
                        interval={limitedData.length > 20 ? Math.ceil(limitedData.length / 10) : 0}
                        angle={limitedData.length > 20 ? -30 : 0}
                        textAnchor={limitedData.length > 20 ? "end" : "middle"}
                        height={limitedData.length > 20 ? 60 : 30}
                      />
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
                      <XAxis 
                        dataKey={xKey} 
                        {...AXIS_STYLING}
                        tick={{ ...AXIS_STYLING.tick, fontSize: 10 }}
                        interval={limitedData.length > 20 ? Math.ceil(limitedData.length / 10) : 0}
                        angle={limitedData.length > 20 ? -30 : 0}
                        textAnchor={limitedData.length > 20 ? "end" : "middle"}
                        height={limitedData.length > 20 ? 60 : 30}
                      />
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
                } else if (type === "scatter" || limitedData.some((d: any) => d?._forceScatter)) {
                  return (
                    <ScatterChart data={limitedData}>
                      <XAxis 
                        dataKey={xKey} 
                        {...AXIS_STYLING}
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        tick={{ ...AXIS_STYLING.tick, fontSize: 10 }}
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
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload[0]) return null;
                          const hovered = payload[0].payload || {};
                          const metricLabel = aggregation === 'count' ? 'Count' : (yKey || 'Value');
                          const summaryPairs = limitedData.slice(0, 12)
                            .map((d: any) => `${d?.[xKey]}: ${d?.[dataKey]}`)
                            .join(' • ');
                          return (
                            <div className="card p-2 text-xs">
                              <div className="font-medium">{xKey}: {hovered?.[xKey]}</div>
                              <div>{metricLabel}: {hovered?.[dataKey]}</div>
                              <div className="opacity-70 mt-1">{summaryPairs}</div>
                            </div>
                          );
                        }}
                      />
                      <Legend 
                        verticalAlign="bottom" 
                        height={24} 
                        formatter={(value: any) => {
                          const match = limitedData.find((d: any) => String(d?.[xKey]) === String(value));
                          const val = match ? match[dataKey] : undefined;
                          const metric = aggregation === 'count' ? 'Count' : (yKey || 'Value');
                          return `${value} (${metric}: ${val ?? '-'})`;
                        }}
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
          <div className="flex items-center gap-3">
            {/* Analysis Mode Dropdown */}
            <div className="relative">
              <Button
                variant="outline"
                className="flex items-center gap-2 text-sm px-3 py-1.5 h-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  setDropdownOpen(!dropdownOpen);
                }}
                disabled={generating}
              >
                <div className="flex items-center gap-2">
                  {useSampling ? (
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <span className="font-medium">
                    {useSampling ? "Fast Analysis" : "Deep Analysis"}
                  </span>
                </div>
                <svg className="w-4 h-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </Button>
              
              {dropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setDropdownOpen(false)}
                  />
                  <motion.div 
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden"
                  >
                    <div 
                      className={`px-4 py-3 cursor-pointer hover:bg-blue-50 transition-colors ${useSampling ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setUseSampling(true);
                        setDropdownOpen(false);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <div>
                          <div className="font-medium text-gray-900">Fast Analysis</div>
                      <div className="text-sm text-gray-600">Full dataset • GPT-4o-mini (faster)</div>
                        </div>
                      </div>
                    </div>
                    <div 
                      className={`px-4 py-3 cursor-pointer hover:bg-green-50 transition-colors ${!useSampling ? 'bg-green-50 border-l-4 border-green-500' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setUseSampling(false);
                        setDropdownOpen(false);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <div className="font-medium text-gray-900">Deep Analysis</div>
                          <div className="text-sm text-gray-600">Full dataset • GPT-5 (deeper)</div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </>
              )}
            </div>
            <ConfirmRegenerate 
              useSampling={useSampling}
              onConfirm={async () => {
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
              }} 
              disabled={generating} 
            />
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

function ConfirmRegenerate({ onConfirm, disabled, useSampling }: { 
  onConfirm: () => void | Promise<void>; 
  disabled?: boolean;
  useSampling: boolean;
}) {
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
          description={`This will delete the previous summary and regenerate using ${useSampling ? 'Fast Analysis (sampled data)' : 'Deep Analysis (full dataset)'}.`}
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



