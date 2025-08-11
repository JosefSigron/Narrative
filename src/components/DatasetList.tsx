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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

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

  function openReport(id: string) {
    window.location.href = `/report/${id}`;
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
    } finally {
      setDeletingId(null);
    }
  }

  // Removed inline toggle view; opening report instead

  if (!datasets.length) return <p className="text-sm text-gray-500">No datasets yet.</p>;

  return (
    <div className="space-y-3">
      {datasets.map(ds => (
        <Reveal key={ds.id} className="border rounded p-3 bg-card/60" mode="toggle">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">{ds.name}</div>
              <div className="text-xs text-gray-500">{ds.originalFilename}  {ds.rowCount} rows</div>
            </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  title="View"
                  aria-label="View"
                  onClick={() => openReport(ds.id)}
                  variant='outline'
                  size='icon'
                >
                  <Icon src="/icons/view.svg" className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View summary</TooltipContent>
            </Tooltip>
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
          {/* Inline preview removed; open the full summary page instead */}
        </Reveal>
      ))}
    </div>
  );
}
