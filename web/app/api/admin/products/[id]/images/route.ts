/**
 * Produktbilder. Filerna hamnar i Vercel Blob och inte hos Shopify — en bild
 * som ligger kvar på cdn.shopify.com gör butiken omöjlig att stänga.
 *
 * Till skillnad från prisbotens snapshots är de här publika: de renderas av
 * next/image ute på sajten och måste gå att hämta utan signering.
 */

import { NextRequest, NextResponse } from 'next/server';
import { del, put } from '@vercel/blob';
import { record } from '@/lib/adminActivity';
import { readBody, requireAdmin, routeId } from '@/lib/adminRoute';
import { addImage, getImage, removeImage, reorderImages, updateImage } from '@/lib/productsDb';
import { InputError, parseIdList } from '@/lib/productsInput';

export const runtime = 'nodejs';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const productId = routeId((await params).id);
  if (productId === null) return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Bildlagringen är inte konfigurerad.' }, { status: 503 });
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Ingen fil skickades med.' }, { status: 400 });
  }
  // Typ och storlek kontrolleras här och inte bara i formuläret: filen blir
  // publikt läsbar, så vad som helst får inte laddas upp.
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: 'Bilden måste vara JPEG, PNG, WebP eller AVIF.' },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Bilden får vara högst 8 MB.' }, { status: 400 });
  }

  const pathname = `products/${productId}/${Date.now()}.${EXTENSIONS[file.type]}`;
  const blob = await put(pathname, file, {
    access: 'public',
    contentType: file.type,
    addRandomSuffix: true,
  });

  const image = await addImage({
    productId,
    url: blob.url,
    blobPathname: blob.pathname,
    altText: typeof form.get('altText') === 'string' ? String(form.get('altText')) : null,
  });

  await record(auth.user, 'product.image_added', String(productId), { fil: blob.pathname });
  return NextResponse.json({ image }, { status: 201 });
}

/** Ny ordning, eller ny alt-text på en enskild bild. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const productId = routeId((await params).id);
  if (productId === null) return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });

  let body;
  try {
    body = await readBody(request);
  } catch {
    return NextResponse.json({ error: 'Kunde inte läsa förfrågan.' }, { status: 400 });
  }

  if (body.order !== undefined) {
    try {
      await reorderImages(productId, parseIdList(body, 'order'));
    } catch (error) {
      const message = error instanceof InputError ? error.message : 'Kunde inte spara ordningen.';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (body.imageId !== undefined && body.altText !== undefined) {
    const imageId = Number(body.imageId);
    const image = Number.isInteger(imageId) ? await getImage(imageId) : null;
    if (!image || image.productId !== productId) {
      return NextResponse.json({ error: 'Bilden finns inte.' }, { status: 404 });
    }
    await updateImage(imageId, {
      altText: body.altText === null ? null : String(body.altText).slice(0, 300),
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const productId = routeId((await params).id);
  if (productId === null) return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });

  const imageId = Number(new URL(request.url).searchParams.get('imageId'));
  const image = Number.isInteger(imageId) ? await getImage(imageId) : null;
  // Kontrollen att bilden hör till produkten i URL:en är inte formalia: utan
  // den kan ett id räcka för att radera vilken bild som helst.
  if (!image || image.productId !== productId) {
    return NextResponse.json({ error: 'Bilden finns inte.' }, { status: 404 });
  }

  await removeImage(imageId);
  // Raden är borta oavsett vad Blob svarar. En kvarglömd fil kostar några
  // ören; ett fel här får inte lämna en bild som visas men inte går att ta bort.
  try {
    await del(image.url);
  } catch (error) {
    console.error('[admin] kunde inte radera bildfilen:', error);
  }

  await record(auth.user, 'product.image_removed', String(productId), { fil: image.blobPathname });
  return NextResponse.json({ ok: true });
}
