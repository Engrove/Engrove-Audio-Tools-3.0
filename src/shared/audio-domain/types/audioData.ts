export type AudioDataContractVersion = '17.0.0';

export type NumericRange = {
  readonly min?: number;
  readonly max?: number;
};

export type TrackingForceRange = NumericRange & {
  readonly recommended?: number;
};

export type AudioDataQuality = {
  readonly match_ready: boolean;
  readonly missing?: readonly string[];
  readonly estimated?: Readonly<Record<string, boolean>>;
};

export type ComplianceTenHzSource = 'provided' | 'estimated' | 'missing' | string;

export type ComplianceInfo = {
  readonly static_cu?: number;
  readonly dynamic_10hz_cu?: number;
  readonly dynamic_100hz_cu?: number;
  readonly ten_hz_source?: ComplianceTenHzSource;
  readonly level?: string;
};

export type RuntimeDataManifestOutput = {
  readonly path: string;
  readonly records?: number | null;
  readonly size_bytes: number;
  readonly sha256: string;
};

export type AudioDataSummary = {
  readonly generated_at: string;
  readonly source: {
    readonly repo: string;
    readonly ref: string;
    readonly legacy_dir: string;
  };
  readonly inspected_structure?: {
    readonly cartridges_shape?: string;
    readonly tonearms_shape?: string;
  };
  readonly cartridges: {
    readonly input_records: number;
    readonly output_records: number;
    readonly match_ready_records: number;
    readonly by_type?: Readonly<Record<string, number>>;
    readonly compliance_10hz_source?: Readonly<Record<string, number>>;
  };
  readonly tonearms: {
    readonly input_records: number;
    readonly output_records: number;
    readonly match_ready_records: number;
    readonly by_headshell_connector?: Readonly<Record<string, number>>;
  };
  readonly outputs: readonly RuntimeDataManifestOutput[];
};
