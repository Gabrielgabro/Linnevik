import { NextRequest, NextResponse } from 'next/server';
import { readJson, requireAdmin } from '@/lib/adminRoute';
import { record } from '@/lib/adminActivity';
import { addComment, CommentError, isCommentSubject } from '@/lib/adminComments';

export const runtime = 'nodejs';

/**
 * Skriver en kommentar (§15.6). Det finns ingen PATCH och ingen DELETE: en
 * kommentar kan inte ändras eller raderas.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const parsed = await readJson(request);
  if ('response' in parsed) return parsed.response;
  const { subject, subjectId, body } = parsed.body;
  if (!isCommentSubject(subject)) {
    return NextResponse.json({ error: 'Okänd sak att kommentera.' }, { status: 400 });
  }
  const id = Number(subjectId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });
  }
  try {
    const comment = await addComment({ subject, subjectId: id, author: auth.user, body: String(body ?? '') });
    await record(auth.user, 'comment.added', `${subject}:${id}`, { comment: comment.id });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    if (error instanceof CommentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
