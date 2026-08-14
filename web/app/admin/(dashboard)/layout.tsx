import { cookies } from 'next/headers';
import { ADMIN_COOKIE, readSessionValue } from '@/lib/adminAuth';
import Sidebar from './Sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = (await cookies()).get(ADMIN_COOKIE)?.value;
  const user = await readSessionValue(session);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar user={user} />
      <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-7 px-5 pb-20 pt-8 lg:px-8 lg:pt-10">
        {children}
      </main>
    </div>
  );
}
