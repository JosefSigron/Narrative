import { auth, signIn, signOut } from '@/auth/config';
import UploadForm from '@/components/UploadForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Reveal from '@/components/Reveal';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    return (
      <div className='min-h-[70vh] flex items-center justify-center px-6'>
        <Reveal className='w-full max-w-lg card p-8 text-center hover-scale'>
          <h1 className='text-3xl font-semibold tracking-tight'>Welcome back</h1>
          <p className='opacity-80 mt-2 text-sm'>Sign in to upload datasets and generate insights.</p>
          <form className='mt-6' action={async () => { 'use server'; await signIn('google'); }}>
            <Button className='w-full inline-flex items-center justify-center gap-2'>
              <span
                className='h-4 w-4 inline-block'
                style={{
                  WebkitMask: "url(/icons/google.svg) no-repeat center / contain",
                  mask: "url(/icons/google.svg) no-repeat center / contain",
                  backgroundColor: "currentColor",
                }}
                aria-hidden
              />
              Continue with Google
            </Button>
          </form>
        </Reveal>
      </div>
    );
  }

  return (
    <div className='max-w-6xl mx-auto px-6 py-10 space-y-8 bg-background'>
      <Reveal>
        <div className='flex items-center justify-between'>
          <h1 className='text-3xl font-semibold tracking-tight'>Dashboard</h1>
          <form action={async () => { 'use server'; await signOut(); }}>
            <Button variant='outline' size='sm'>Sign out</Button>
          </form>
        </div>
      </Reveal>

      <Reveal mode='toggle'>
        <Card>
          <CardHeader>
            <CardTitle className='text-lg'>Upload dataset</CardTitle>
          </CardHeader>
          <CardContent>
            <UploadForm />
          </CardContent>
        </Card>
      </Reveal>

      <Reveal>
        <div className='card p-6'>
          <div className='text-sm opacity-80'>Go to Reports to view and manage your datasets.</div>
          <div className='mt-3'>
            <a href='/report' className='btn-primary inline-block px-4 py-2 rounded'>Open Reports</a>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
 
