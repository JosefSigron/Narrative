'use client';

import { useEffect, useState } from 'react';
import Icon from './Icon';
import Reveal from '@/components/Reveal';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/ui/dialog';

export default function DatasetList() {
  const [datasets, setDatasets] = useState<any[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [resultsByDataset, setResultsByDataset] = useState<Record<string, any>>({});

  async function refresh() {
    const res = await fetch('/api/datasets');
    const json = await res.json();
    setDatasets(json.datasets ?? []);
  }

  useEffect(() => { refresh().catch(() => {}); }, []);
  useEffect(() => {
    function handleUpdated() { refresh().catch(() => {}); }
    window.addEventListener('datasets:updated', handleUpdated);
    return () => window.removeEventListener('datasets:updated', handleUpdated);
  }, []);

  async function generateInsights(id: string) {
    setLoadingId(id);
    try {
      const res = await fetch('/api/insights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datasetId: id }) });
      const json = await res.json();
      if (!json.ok) {
        toast.error('Insight generation failed', { description: String(json.error || 'unknown') });
        return;
      }
      // Fetch and display results
      const r = await fetch('/api/insights?datasetId=' + encodeURIComponent(id));
      const detail = await r.json();
      setResultsByDataset(prev => ({ ...prev, [id]: detail }));
      window.dispatchEvent(new CustomEvent('datasets:updated'));
    } finally {
      setLoadingId(null);
    }
  }

  async function deleteDataset(id: string) {
    setConfirmId(null);
    setDeletingId(id);
    try {
      const res = await fetch('/api/datasets?id=' + encodeURIComponent(id), { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error('Delete failed', { description: String(json.error || 'unknown') });
        return;
      }
      toast.success('Dataset deleted');
      await refresh();
      setResultsByDataset(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleView(id: string) {
    if (resultsByDataset[id]) {
      setResultsByDataset(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
      return;
    }
    setViewingId(id);
    try {
      const r = await fetch('/api/insights?datasetId=' + encodeURIComponent(id));
      const detail = await r.json();
      setResultsByDataset(prev => ({ ...prev, [id]: detail }));
    } finally {
      setViewingId(null);
    }
  }

  if (!datasets.length) return <p className="text-sm text-gray-500">No datasets yet.</p>;

  return (
    <div className="space-y-3">
      {datasets.map(ds => (
        <Reveal key={ds.id} className="border rounded p-3 bg-card/60">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">{ds.name}</div>
              <div className="text-xs text-gray-500">{ds.originalFilename}  {ds.rowCount} rows</div>
            </div>
            <div className="flex items-center gap-2">
              {((ds._count?.insights ?? 0) > 0) ? (
                <>
                  <Tooltip>
                  <TooltipTrigger asChild>
                  <Button
                    type="button"
                    title={resultsByDataset[ds.id] ? 'Hide' : 'View'}
                    aria-label={resultsByDataset[ds.id] ? 'Hide' : 'View'}
                    disabled={viewingId === ds.id}
                    onClick={() => toggleView(ds.id)}
                    variant='outline'
                    size='icon'
                  >
                    {resultsByDataset[ds.id] ? (
                      <Icon src="/icons/hide.svg" className="h-4 w-4" />
                    ) : viewingId === ds.id ? (
                      <Icon src="/icons/view-loading.svg" className="h-4 w-4 animate-spin" />
                    ) : (
                      <Icon src="/icons/view.svg" className="h-4 w-4" />
                    )}
                  </Button>
                  </TooltipTrigger>
                  <TooltipContent>{resultsByDataset[ds.id] ? 'Hide' : (viewingId === ds.id ? 'Loading...' : 'View')}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                  <TooltipTrigger asChild>
                  <Button
                    type="button"
                    title="Generate New"
                    aria-label="Generate New"
                    disabled={loadingId === ds.id}
                    onClick={() => generateInsights(ds.id)}
                    variant='outline'
                    size='icon'
                  >
                    <Icon src="/icons/regenerate.svg" className={`h-4 w-4 ${loadingId === ds.id ? 'animate-spin' : ''}`} />
                  </Button>
                  </TooltipTrigger>
                  <TooltipContent>Generate New</TooltipContent>
                  </Tooltip>
                  
                </>
              ) : (
                <Tooltip>
                <TooltipTrigger asChild>
                <Button
                  type="button"
                  title="Generate"
                  aria-label="Generate"
                  disabled={loadingId === ds.id}
                  onClick={() => generateInsights(ds.id)}
                  variant='outline'
                  size='icon'
                >
                  <Icon src="/icons/sparkles.svg" className={`h-4 w-4 ${loadingId === ds.id ? 'animate-spin' : ''}`} />
                </Button>
                </TooltipTrigger>
                <TooltipContent>Generate</TooltipContent>
                </Tooltip>
                
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    title="Delete"
                    aria-label="Delete"
                    disabled={deletingId === ds.id}
                    onClick={() => setConfirmId(ds.id)}
                    variant='outline'
                    size='icon'
                  >
                    <Icon src="/icons/trash.svg" className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete</TooltipContent>
              </Tooltip>

              <ConfirmDialog
                open={confirmId === ds.id}
                onOpenChange={(v) => { if (!v) setConfirmId(null); }}
                title="Delete dataset?"
                description="This will permanently remove the dataset and generated content."
                confirmText="Delete"
                onConfirm={() => deleteDataset(ds.id)}
              />
              
            </div>
          </div>
          {resultsByDataset[ds.id] && (
            <div className="mt-3 text-sm">
              {resultsByDataset[ds.id].insights?.length ? (
                <ul className="list-disc pl-5 space-y-1">
                  {resultsByDataset[ds.id].insights.map((i: any, idx: number) => (
                    <li key={idx}><span className="font-medium">{i.title}:</span> {i.content}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-gray-500">No insights found.</div>
              )}
            </div>
          )}
        </Reveal>
      ))}
    </div>
  );
}
