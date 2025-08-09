import Link from "next/link";

export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">Narrative Data Storyteller</h1>
      <p className="text-gray-600 mt-2">Upload a CSV, get charts and a narrative.</p>
      <div className="mt-6">
        <Link href="/dashboard" className="px-4 py-2 bg-blue-600 text-white rounded">Go to Dashboard</Link>
      </div>
    </main>
  );
}
