'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Reveal from '@/components/Reveal';

export default function UploadForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/datasets', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) {
        toast.error('Upload failed', { description: String(json?.error || 'unknown') });
        return;
      }
      // Notify other components to refresh their data
      window.dispatchEvent(new CustomEvent('datasets:updated'));
      // Optionally re-render server components
      router.refresh();
      // Reset the form
      form.reset();
      toast.success('Uploaded successfully');
    } catch (e: any) {
      toast.error('Upload error', { description: String(e?.message || e) });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Reveal mode="toggle">
      <form className='space-y-4' onSubmit={onSubmit} encType='multipart/form-data'>
        <div>
          <label className='block text-sm font-medium'>Dataset name</label>
          <Input name='name' className='mt-1' placeholder='e.g. Sales Q1' />
        </div>
        <div>
          <label className='block text-sm font-medium'>CSV file</label>
          <div className='mt-1 flex items-center gap-3'>
            <label className='inline-flex items-center gap-2 px-3 py-2 rounded border border-white/20 hover:bg-white/10 cursor-pointer text-cyan-400'>
              <span
                className='h-4 w-4 inline-block align-middle'
                style={{
                  WebkitMask: "url(/icons/attachment.svg) no-repeat center / contain",
                  mask: "url(/icons/attachment.svg) no-repeat center / contain",
                  backgroundColor: "currentColor",
                }}
                aria-hidden
              />
              <span>Select file</span>
              <input name='file' type='file' accept='.csv' className='hidden' onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
            </label>
            <span className='text-sm opacity-80'>{fileName ?? 'No file selected'}</span>
          </div>
        </div>
        <Button disabled={isSubmitting} type='submit'>
          {isSubmitting ? 'Uploading…' : 'Upload'}
        </Button>
      </form>
    </Reveal>
  );
}


