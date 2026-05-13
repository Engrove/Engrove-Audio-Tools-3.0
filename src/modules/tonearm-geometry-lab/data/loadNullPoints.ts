import type {
  AlignmentMethod,
  AlignmentStandard,
  NullPointPair,
  StandardRadii,
} from '../engine/geometry';

type RawNullPointPair = {
  n1_mm: number;
  n2_mm: number;
  source: string;
};

type RawStandardRadii = {
  inner_mm: number;
  outer_mm: number;
  source: string;
};

type RawNullPointsTable = {
  version: string;
  table: Record<AlignmentStandard, Record<AlignmentMethod, RawNullPointPair>>;
  radii: Record<AlignmentStandard, RawStandardRadii>;
};

export type NullPointsRuntimeData = {
  version: string;
  table: Record<AlignmentStandard, Record<AlignmentMethod, NullPointPair>>;
  radii: Record<AlignmentStandard, StandardRadii>;
};

const nullPointsRuntimeUrl = '/data/audio/v3/runtime/null-points.json';

let cached: Promise<NullPointsRuntimeData> | null = null;

function transform(raw: RawNullPointsTable): NullPointsRuntimeData {
  const standards: AlignmentStandard[] = ['IEC', 'DIN'];
  const methods: AlignmentMethod[] = ['Baerwald', 'LofgrenA', 'LofgrenB', 'Stevenson'];

  const table = {} as NullPointsRuntimeData['table'];
  const radii = {} as NullPointsRuntimeData['radii'];

  for (const std of standards) {
    const methodMap = {} as Record<AlignmentMethod, NullPointPair>;
    for (const method of methods) {
      const entry = raw.table[std][method];
      methodMap[method] = {
        n1Mm: entry.n1_mm,
        n2Mm: entry.n2_mm,
        source: entry.source,
      };
    }
    table[std] = methodMap;

    const r = raw.radii[std];
    radii[std] = { innerMm: r.inner_mm, outerMm: r.outer_mm };
  }

  return { version: raw.version, table, radii };
}

export function loadNullPointsRuntimeData(): Promise<NullPointsRuntimeData> {
  if (!cached) {
    cached = fetch(nullPointsRuntimeUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load null-points dataset: ${response.status}`);
        }
        return response.json() as Promise<RawNullPointsTable>;
      })
      .then(transform)
      .catch((error: unknown) => {
        cached = null;
        throw error;
      });
  }

  return cached;
}
