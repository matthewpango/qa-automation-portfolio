import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateQuote } from '../src/quote.ts';

const parcel = {
  weightKg: 2, lengthCm: 10, widthCm: 10, heightCm: 10,
  distanceKm: 15, deliveryType: 'standard' as const, fragile: false,
};

test('обычная доставка: возвращает цену и полную разбивку', () => {
  assert.deepEqual(calculateQuote(parcel), {
    actualWeightKg: 2, volumetricWeightKg: 0.2, chargeableWeightKg: 2,
    billedWeightKg: 2, distanceBlocks: 2, baseCostRub: 100,
    weightCostRub: 100, distanceCostRub: 20, subtotalRub: 220,
    deliveryMultiplier: 1, expressSurchargeRub: 0, fragileSurchargeRub: 0,
    totalRub: 220, currency: 'RUB',
  });
});

test('экспресс умножает сумму до доплаты за хрупкость', () => {
  const express = calculateQuote({ ...parcel, deliveryType: 'express' });
  assert.equal(express.totalRub, 330);
  assert.equal(express.expressSurchargeRub, 110);
  const fragile = calculateQuote({ ...parcel, deliveryType: 'express', fragile: true });
  assert.equal(fragile.totalRub, 430);
  assert.equal(fragile.fragileSurchargeRub, 100);
});

test('объёмный вес не округляется перед выбором оплачиваемых килограммов', () => {
  const result = calculateQuote({ ...parcel, weightKg: 0.1, lengthCm: 51 });
  assert.equal(result.volumetricWeightKg, 1.02);
  assert.equal(result.chargeableWeightKg, 1.02);
  assert.equal(result.billedWeightKg, 2);
});

test('каждый начатый блок 10 км оплачивается целиком', () => {
  assert.equal(calculateQuote({ ...parcel, distanceKm: 10 }).distanceBlocks, 1);
  assert.equal(calculateQuote({ ...parcel, distanceKm: 11 }).distanceBlocks, 2);
});
