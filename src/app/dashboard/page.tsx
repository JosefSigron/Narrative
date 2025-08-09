import { auth, signIn, signOut } from "@/auth/config";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold mb-4">Sign in</h1>
        <form action={async () => { 'use server'; await signIn('google'); }}>
          <button className="px-4 py-2 bg-black text-white rounded">Sign in with Google</button>
        </form>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <form action={async () => { 'use server'; await signOut(); }}>
          <button className="px-3 py-2 border rounded">Sign out</button>
        </form>
      </div>

      <UploadForm />
    </div>
  );
}

function UploadForm() {
  return (
    <form className="space-y-4" action="/api/datasets" method="post" encType="multipart/form-data">
      <div>
        <label className="block text-sm font-medium">Dataset name</label>
        <input name="name" className="mt-1 block w-full border rounded px-3 py-2" placeholder="e.g. Sales Q1" />
      </div>
      <div>
        <label className="block text-sm font-medium">CSV file</label>
        <input name="file" type="file" accept=".csv" className="mt-1 block w-full" />
      </div>
      <button className="px-4 py-2 bg-blue-600 text-white rounded">Upload</button>
    </form>
  );
}
