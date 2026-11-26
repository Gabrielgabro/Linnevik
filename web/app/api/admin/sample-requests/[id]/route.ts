import { NextRequest, NextResponse } from 'next/server';
import { readJson, requireAdmin, routeId } from '@/lib/adminRoute';
import { record } from '@/lib/adminActivity';
import {
  getSampleRequestById,
  isSampleStatus,
  updateSampleRequest,
} from '@/lib/sampleRequestsDb';

type Params = { params: Promise<{ id: string }> };

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  const sampleRequest = await getSampleRequestById(id);
  return sampleRequest
    ? NextResponse.json({ request: sampleRequest })
    : NextResponse.json({ error: 'Sample request not found.' }, { status: 404 });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });

  const parsed = await readJson(request);
  if ('response' in parsed) return parsed.response;
  const body = parsed.body;
  const status = body.status === undefined ? undefined : body.status;
  if (status !== undefined && !isSampleStatus(status)) {
    return NextResponse.json({ error: 'Ogiltig status.' }, { status: 400 });
  }
  const updated = await updateSampleRequest(id, { status }, auth.user);
  if (!updated) return NextResponse.json({ error: 'Provbeställningen finns inte.' }, { status: 404 });

  await record(auth.user, 'sample_request.updated', `#${id}`, { status });
  return NextResponse.json({ request: updated });
}
