const DEFAULT_NEUTRAL_TOLERANCE = 0.25;

function parseNeutralTolerance(value: string | undefined): number {
  if (!value) return DEFAULT_NEUTRAL_TOLERANCE;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_NEUTRAL_TOLERANCE;
  }

  return parsed;
}

export const APP_CONFIG = {
  neutralTolerance: parseNeutralTolerance(import.meta.env.VITE_NEUTRAL_TOLERANCE),
};
