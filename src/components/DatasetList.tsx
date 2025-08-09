'use client';

import { useEffect, useState } from 'react';

export default function DatasetList() {
  const [datasets, setDatasets] = useState<any[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch('/api/datasets');
    const json = await res.json();
    setDatasets(json.datasets ?? []);
  }

  useEffect(() => { refresh().catch(() => {}); }, []);

  async function generateInsights(id: string) {
    setLoadingId(id);
    try {
      const res = await fetch('/api/insights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datasetId: id }) });
      const json = await res.json();
      alert(json.ok ? 'Insights generated!' : ('Failed: ' + (json.error || 'unknown')));
    } finally {
      setLoadingId(null);
    }
  }

  if (!datasets.length) return <p className="text-sm text-gray-500">No datasets yet.</p>;

  return (
    <div className="space-y-3">
      {datasets.map(ds => (
        <div key={ds.id} className="border rounded p-3 flex items-center justify-between">
          <div>
            <div className="font-medium">{ds.name}</div>
            <div className="text-xs text-gray-500">{ds.originalFilename}  {ds.rowCount} rows</div>
          </div>
          <button disabled={loadingId === ds.id} onClick={() => generateInsights(ds.id)} className="px-3 py-1.5 bg-emerald-600 text-white rounded disabled:opacity-50">{loadingId === ds.id ? 'Working' : 'Generate insights'}</button>
        </div>
      ))}
    </div>
  );
}
