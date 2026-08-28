import { describe, expect, it } from 'vitest';
import { costOf, listCostOf, negotiatedCostOf } from '@/lib/franzenCost';
import { InputError, parseVariantInput } from '@/lib/productsInput';

// SKU:t är belaget mot artikel 2649301, Frotté Nevada vit 450g 50x70, som står
// på 14 kr i Franzéns artikelfil. Går den siffran sönder är det filen som bytts.
const SKU = 'HAN-NEV-VIT-5070';

describe('inköpspriset som marginalen räknas mot', () => {
  it('faller tillbaka på artikelfilen när inget förhandlat pris är inskrivet', () => {
    expect(listCostOf(SKU)).toBe(14);
    expect(costOf({ sku: SKU, supplierCostMinor: null })).toBe(14);
    expect(negotiatedCostOf({ sku: SKU, supplierCostMinor: null })).toBeNull();
  });

  // Hela poängen med kolumnen: Franzén ger oss bättre priser än de som står i
  // filen, och de priserna ligger bakom deras inloggning.
  it('låter ett inskrivet pris gå före artikelfilens', () => {
    expect(costOf({ sku: SKU, supplierCostMinor: 1150 })).toBe(11.5);
  });

  // En variant som inte är belagd mot någon artikel har inget pris alls — där
  // är det handskrivna talet det enda som finns.
  it('ger obelagda varianter ett pris först när det skrivs in', () => {
    expect(costOf({ sku: 'FINNS-INTE', supplierCostMinor: null })).toBeNull();
    expect(costOf({ sku: 'FINNS-INTE', supplierCostMinor: 4200 })).toBe(42);
  });

  // Noll kronor är ett giltigt pris och får inte tolkas som "inget angivet".
  it('skiljer noll kronor från inget pris', () => {
    expect(costOf({ sku: SKU, supplierCostMinor: 0 })).toBe(0);
  });
});

describe('parseVariantInput — inköpsvillkoren', () => {
  it('rör inte fälten som inte skickades med', () => {
    const input = parseVariantInput({ priceMinor: 12000 }, { partial: true });
    expect(input).not.toHaveProperty('supplierCostMinor');
    expect(input).not.toHaveProperty('purchaseBatchSize');
  });

  it('tar emot ett förhandlat pris och en beställningspost', () => {
    const input = parseVariantInput(
      { supplierCostMinor: 1150, purchaseBatchSize: 100 },
      { partial: true }
    );
    expect(input.supplierCostMinor).toBe(1150);
    expect(input.purchaseBatchSize).toBe(100);
  });

  // Tomt fält betyder "inget angivet". Utan den skillnaden går ett inskrivet
  // pris inte att ta bort igen.
  it('tolkar ett tomrensat fält som null och inte som noll', () => {
    const cleared = parseVariantInput(
      { supplierCostMinor: '', purchaseBatchSize: null },
      { partial: true }
    );
    expect(cleared.supplierCostMinor).toBeNull();
    expect(cleared.purchaseBatchSize).toBeNull();
  });

  it('avvisar en beställningspost om noll', () => {
    expect(() => parseVariantInput({ purchaseBatchSize: 0 }, { partial: true })).toThrow(InputError);
  });

  it('avvisar ett negativt inköpspris', () => {
    expect(() => parseVariantInput({ supplierCostMinor: -1 }, { partial: true })).toThrow(InputError);
  });

  // Inköpssidan får inte skriva över kundens steg i kassan — de är två tal.
  it('lämnar orderIncrement i fred', () => {
    const input = parseVariantInput({ purchaseBatchSize: 100 }, { partial: true });
    expect(input).not.toHaveProperty('orderIncrement');
  });
});
