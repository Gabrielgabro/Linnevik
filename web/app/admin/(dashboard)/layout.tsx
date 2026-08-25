import { cookies } from 'next/headers';
import { ADMIN_COOKIE, readSessionValue } from '@/lib/adminAuth';
import { countOpenAlerts } from '@/lib/opsAlerts';
import Sidebar from './Sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = (await cookies()).get(ADMIN_COOKIE)?.value;
  const user = await readSessionValue(session);
  // Siffran på menyn är hela poängen med larmen: den syns var man än står i
  // /admin. Ett fel här får aldrig fälla adminvyn — då hade larmet blivit
  // orsaken till att man inte kan titta på det.
  const openAlerts = user ? await countOpenAlerts().catch(() => 0) : 0;

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar user={user} openAlerts={openAlerts} />
      <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-7 px-5 pb-20 pt-8 lg:px-8 lg:pt-10">
        {children}
      </main>
    </div>
  );
}
