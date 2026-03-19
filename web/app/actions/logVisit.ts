'use server';

import { headers } from 'next/headers';
import { appendVisitLog } from '@/lib/googleSheets';

export async function logVisit() {
    const headersList = await headers();

    // Extract Geo Info (Vercel headers)
    const country = headersList.get('x-vercel-ip-country') || 'Unknown';
    const region = headersList.get('x-vercel-ip-country-region') || 'Unknown';
    const city = headersList.get('x-vercel-ip-city') || 'Unknown';

    const userAgent = headersList.get('user-agent') || 'Unknown';
    const timestamp = new Date().toISOString();

    // Fire and forget - don't await to avoid slowing down request? 
    // Next.js server actions are usually awaited. But for logging we might want to catch errors.
    // Since we are running this in useEffect, it won't block the initial render much, but we should await it to be safe.

    await appendVisitLog([timestamp, userAgent, country, region, city]);
}
