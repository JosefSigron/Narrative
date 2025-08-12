'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Reveal from '@/components/Reveal';
import { motion } from 'framer-motion';

export default function UploadForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [useSampling, setUseSampling] = useState<boolean>(true);
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);

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
      // Immediately open the report page and start generation with chosen analysis mode
      const datasetId = json?.datasetId as string | undefined;
      if (datasetId) {
        const analysisMode = useSampling ? 'fast' : 'deep';
        window.location.href = `/report/${datasetId}?mode=${analysisMode}`;
      }
      window.dispatchEvent(new CustomEvent('datasets:updated'));
      router.refresh();
      form.reset();
      toast.success('Dataset received. Generating…');
    } catch (e: any) {
      toast.error('Upload error', { description: String(e?.message || e) });
    } finally {
      setIsSubmitting(false);
    }
  }

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
            <label className='inline-flex items-center gap-2 px-3 py-2 rounded border border-burnt_sienna-500/30 hover:bg-burnt_sienna-500/10 cursor-pointer text-burnt_sienna-500'>
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
        
        {/* Analysis Mode Selection */}
        <div>
          <label className='block text-sm font-medium mb-2'>Analysis Mode</label>
          <div className="relative">
            <Button
              type="button"
              variant="outline"
              className="w-full flex items-center justify-between text-sm px-3 py-2 h-auto"
              onClick={(e) => {
                e.stopPropagation();
                setDropdownOpen(!dropdownOpen);
              }}
              disabled={isSubmitting}
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
                  className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden"
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
                        <div className="text-sm text-gray-600">Sampled data • Optimized for speed</div>
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
                        <div className="text-sm text-gray-600">Full dataset • Comprehensive insights</div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </div>
        </div>

        <Button disabled={isSubmitting} type='submit'>
          {isSubmitting ? 'Generating…' : `Generate with ${useSampling ? 'Fast' : 'Deep'} Analysis`}
        </Button>
      </form>
    </Reveal>
  );
}


