/**
 * Kommentarer på en order, ett företag eller en provbeställning
 * (source_of_truth §15.6).
 *
 * En kommentar sparas med vem som skrev den och när och kan inte ändras eller
 * raderas. Den här modulen har därför bara två funktioner: lägg till och
 * lista. Databasen stoppar ändringar även utanför koden (drizzle/0048).
 */

import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { adminComments, clients, orders, sampleRequests, type AdminCommentRow } from '@/lib/db/schema';

export type CommentSubject = AdminCommentRow['subject'];

export const COMMENT_SUBJECTS: readonly CommentSubject[] = ['order', 'client', 'sample_request'];

export const COMMENT_MAX_LENGTH = 5_000;

export class CommentError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'CommentError';
  }
}

export function isCommentSubject(value: unknown): value is CommentSubject {
  return typeof value === 'string' && (COMMENT_SUBJECTS as readonly string[]).includes(value);
}

async function subjectExists(subject: CommentSubject, id: number): Promise<boolean> {
  const db = getDb();
  const table = subject === 'order' ? orders : subject === 'client' ? clients : sampleRequests;
  const rows = await db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
  return rows.length > 0;
}

export async function addComment(input: {
  subject: CommentSubject;
  subjectId: number;
  author: string;
  body: string;
}): Promise<AdminCommentRow> {
  const body = input.body.trim();
  if (!body) throw new CommentError('Kommentaren är tom.');
  if (body.length > COMMENT_MAX_LENGTH) {
    throw new CommentError(`Kommentaren får vara högst ${COMMENT_MAX_LENGTH} tecken.`);
  }
  if (!(await subjectExists(input.subject, input.subjectId))) {
    throw new CommentError('Det finns inget att kommentera med det id:t.', 404);
  }
  const [row] = await getDb()
    .insert(adminComments)
    .values({ subject: input.subject, subjectId: input.subjectId, author: input.author, body })
    .returning();
  return row;
}

/** Äldst först, så att en tråd läses uppifrån och ned. */
export async function listComments(subject: CommentSubject, subjectId: number): Promise<AdminCommentRow[]> {
  return getDb()
    .select()
    .from(adminComments)
    .where(and(eq(adminComments.subject, subject), eq(adminComments.subjectId, subjectId)))
    .orderBy(asc(adminComments.createdAt), asc(adminComments.id));
}

/** Antal kommentarer per sak, för listor som vill visa att det finns några. */
export async function commentCounts(subject: CommentSubject, ids: number[]): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map();
  const result = await getDb().execute(sql`
    select subject_id, count(*)::int as n from admin_comments
    where subject = ${subject} and subject_id = any(${ids})
    group by subject_id
  `);
  return new Map((result.rows as { subject_id: number; n: number }[]).map(row => [Number(row.subject_id), Number(row.n)]));
}
