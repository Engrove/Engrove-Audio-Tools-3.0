export type BehaviorRiskLevel = 'lower' | 'medium' | 'elevated';

export type BehaviorInterpretation = {
  title: string;
  summary: string;
  warnings: string[];
  truthStatus: 'MODEL';
  blockedClaims: string[];
};

export function classifyRisk(score: number): BehaviorRiskLevel {
  if (score >= 0.67) return 'elevated';
  if (score >= 0.34) return 'medium';
  return 'lower';
}

export function buildBehaviorInterpretation(args: {
  rmsTrackingErrorDeg: number;
  maxTrackingErrorDeg: number;
  offsetBurden: number;
  totalRisk: number;
  hasNulls: boolean;
  overhangMm: number;
}): BehaviorInterpretation {
  const level = classifyRisk(args.totalRisk);
  const score = Math.round(args.totalRisk * 100);
  const isUnderhung = args.overhangMm < 0;
  const isZeroOverhang = args.overhangMm === 0;

  const levelLabel =
    level === 'elevated'
      ? 'Elevated modelled context risk'
      : level === 'medium'
        ? 'Medium modelled context risk'
        : 'Lower modelled context risk';

  const warnings: string[] = [];

  const nullDependenceWarning =
    args.rmsTrackingErrorDeg < 1.2 &&
    args.totalRisk > 0.60 &&
    args.offsetBurden * 25 > 18;

  if (nullDependenceWarning) {
    warnings.push(
      'This alignment is geometrically strong, but its behavior context still depends heavily on offset-angle and inner-groove assumptions.',
    );
  }

  if (isUnderhung) {
    warnings.push(
      'This is a tradeoff: higher calculated angular error, lower offset-related burden. Measurement is needed before THD or audible-quality claims.',
    );
  }

  if (isZeroOverhang) {
    warnings.push(
      'Zero overhang removes offset burden but increases angular error toward inner grooves. Measurement is needed before THD or audible-quality claims.',
    );
  }

  if (args.maxTrackingErrorDeg > 3) {
    warnings.push(
      'Angular error exceeds 3° at some groove radii. This is a geometrically significant deviation.',
    );
  }

  return {
    title: `${levelLabel} (${score}/100)`,
    summary: isUnderhung
      ? 'This setup trades lower offset burden against higher angular error.'
      : `This alignment is ${level === 'lower' ? 'within lower' : level === 'medium' ? 'at medium' : 'at elevated'} modelled context risk. This is not measured distortion.`,
    warnings,
    truthStatus: 'MODEL',
    blockedClaims: [
      'predicted THD',
      'predicted audible distortion',
      'this alignment sounds better',
    ],
  };
}
