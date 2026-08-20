import { NextResponse } from 'next/server';

/** Commerce-konton hanteras numera under respektive post i Kunder. */
export async function PATCH() {
  return NextResponse.json(
    { error: 'Webbkonton hanteras under /admin/clients.' },
    { status: 410 }
  );
}
