import tariffs from './tariffs.json' with { type: 'json' };

export interface QuoteInput {
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  distanceKm: number;
  deliveryType: 'standard' | 'express';
  fragile: boolean;
}

export interface QuoteResult {
  actualWeightKg: number;
  volumetricWeightKg: number;
  chargeableWeightKg: number;
  billedWeightKg: number;
  distanceBlocks: number;
  baseCostRub: number;
  weightCostRub: number;
  distanceCostRub: number;
  subtotalRub: number;
  deliveryMultiplier: number;
  expressSurchargeRub: number;
  fragileSurchargeRub: number;
  totalRub: number;
  currency: 'RUB';
}

export function calculateQuote(input: QuoteInput): QuoteResult {
  const volumetricWeightKg = input.lengthCm * input.widthCm * input.heightCm / tariffs.divisor;
  const chargeableWeightKg = Math.max(input.weightKg, volumetricWeightKg);
  const billedWeightKg = Math.ceil(chargeableWeightKg);
  const distanceBlocks = Math.ceil(input.distanceKm / tariffs.distanceBlockKm);
  const weightCostRub = billedWeightKg * tariffs.perKg;
  const distanceCostRub = distanceBlocks * tariffs.perDistanceBlock;
  const subtotalRub = tariffs.base + weightCostRub + distanceCostRub;
  const deliveryMultiplier = input.deliveryType === 'express' ? tariffs.expressMultiplier : 1;
  const expressSurchargeRub = subtotalRub * (deliveryMultiplier - 1);
  const fragileSurchargeRub = input.fragile ? tariffs.fragile : 0;

  return {
    actualWeightKg: input.weightKg, volumetricWeightKg, chargeableWeightKg,
    billedWeightKg, distanceBlocks, baseCostRub: tariffs.base, weightCostRub,
    distanceCostRub, subtotalRub, deliveryMultiplier, expressSurchargeRub,
    fragileSurchargeRub, totalRub: subtotalRub + expressSurchargeRub + fragileSurchargeRub,
    currency: 'RUB',
  };
}
