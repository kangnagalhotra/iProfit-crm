import type { DealStage, ForecastCategory, Opportunity } from '../api/types';

export const FORECAST_LABELS: Record<ForecastCategory, string> = {
  COMMIT: 'Commit', BEST_CASE: 'Best Case', PIPELINE: 'Pipeline', OMITTED: 'Omitted',
};

export const FORECAST_ORDER: ForecastCategory[] = ['COMMIT', 'BEST_CASE', 'PIPELINE', 'OMITTED'];

// Optimism ranking — used to decide when an override needs a justification
// (only when MORE optimistic than the stage-derived default).
const OPTIMISM: Record<ForecastCategory, number> = {
  OMITTED: 0, PIPELINE: 1, BEST_CASE: 2, COMMIT: 3,
};

export function deriveForecastCategory(stage: DealStage): ForecastCategory {
  if (stage.isClosedWon) return 'COMMIT';
  if (stage.isClosedLost) return 'OMITTED';
  if (stage.winProbability >= 50) return 'BEST_CASE'; // e.g. SQL at 60%
  return 'PIPELINE'; // e.g. Discovery at 20%
}

export function effectiveForecastCategory(deal: Opportunity): ForecastCategory {
  return deal.forecastCategory ?? deriveForecastCategory(deal.stage);
}

export function isMoreOptimistic(candidate: ForecastCategory, baseline: ForecastCategory): boolean {
  return OPTIMISM[candidate] > OPTIMISM[baseline];
}
