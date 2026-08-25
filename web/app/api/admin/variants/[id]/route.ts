import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { record } from '@/lib/adminActivity';
import { readBody, requireAdmin, routeId, isUniqueViolation } from '@/lib/adminRoute';
import { diff } from '@/lib/clientsInput';
import { getDb } from '@/lib/db';
import { productVariants } from '@/lib/db/schema';
import { setVariantStock } from '@/lib/inventoryDb';
import { deleteVariant, updateVariant } from '@/lib/productsDb';
import { InputError, parseVariantInput } from '@/lib/productsInput';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });

  const [before] = await getDb()
    .select()
    .from(productVariants)
    .where(eq(productVariants.id, id))
    .limit(1);
  if (!before) return NextResponse.json({ error: 'Varianten finns inte.' }, { status: 404 });

  let input;
  try {
    input = parseVariantInput(await readBody(request), { partial: true });
  } catch (error) {
    const message = error instanceof InputError ? error.message : 'Kunde inte läsa förfrågan.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Lagersaldot skrivs inte som ett fält bland andra. Det får aldrig hamna
  // under vad pågående ordrar har reserverat, och varje ändring ska synas i
  // lagerhistoriken — se setVariantStock. Resten av patchen är vanliga fält.
  const { inventoryQuantity, ...fields } = input;
  const tracked = fields.inventoryTracked ?? before.inventoryTracked;
  const quantity = inventoryQuantity ?? before.inventoryQuantity;
  if (tracked && quantity < before.inventoryReserved) {
    return NextResponse.json(
      {
        error:
          `${before.inventoryReserved} enheter är reserverade av pågående ordrar. Lagret kan ` +
          `inte sättas lägre än så — makulera ordern eller vänta tills reservationen släpps.`,
      },
      { status: 409 }
    );
  }

  let variant;
  try {
    variant = await updateVariant(id, fields);
  } catch (error) {
    if (isUniqueViolation(error, 'product_variants_sku_key')) {
      return NextResponse.json({ error: `SKU ${input.sku} används redan.` }, { status: 409 });
    }
    throw error;
  }

  if (inventoryQuantity !== undefined && inventoryQuantity !== before.inventoryQuantity) {
    // Kontrolleras en gång till under radlås: reservationen kan ha hunnit
    // ändras mellan läsningen ovan och skrivningen.
    const stock = await setVariantStock(id, inventoryQuantity, auth.user, 'Ändrat i /admin');
    if (!stock.ok) {
      return NextResponse.json(
        {
          error:
            `${stock.reserved} enheter är reserverade av pågående ordrar. Lagret kan inte sättas ` +
            `lägre än så — övriga ändringar är sparade.`,
        },
        { status: 409 }
      );
    }
    variant = variant ? { ...variant, inventoryQuantity } : variant;
  }

  await record(auth.user, 'variant.updated', String(id), {
    sku: before.sku,
    ändrat: diff(before, { ...input }),
  });

  return NextResponse.json({ variant });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });

  const [before] = await getDb()
    .select()
    .from(productVariants)
    .where(eq(productVariants.id, id))
    .limit(1);
  if (!before) return NextResponse.json({ error: 'Varianten finns inte.' }, { status: 404 });

  try {
    await deleteVariant(id);
  } catch (error) {
    // En variant som sålts går inte att ta bort. Meddelandet från productsDb
    // säger varför och vad man ska göra i stället.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kunde inte ta bort varianten.' },
      { status: 409 }
    );
  }

  await record(auth.user, 'variant.deleted', String(id), { sku: before.sku });
  return NextResponse.json({ ok: true });
}
