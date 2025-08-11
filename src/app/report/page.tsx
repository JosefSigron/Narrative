"use client";

import Reveal from '@/components/Reveal';
import DatasetList from '@/components/DatasetList';

export default function ReportsIndex() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <Reveal>
        <h1 className="text-3xl font-semibold tracking-tight">Reports</h1>
      </Reveal>
      <Reveal mode='toggle'>
        <div className='space-y-3'>
          <DatasetList />
        </div>
      </Reveal>
    </div>
  );
}


