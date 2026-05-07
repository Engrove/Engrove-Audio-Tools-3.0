import type { AudioDataQuality, ComplianceInfo, TrackingForceRange } from './audioData';

export type CartridgeKind =
  | 'MM'
  | 'MC'
  | 'MI'
  | 'Moving Magnet'
  | 'Moving Coil'
  | 'Moving Iron'
  | 'High Output Moving Coil'
  | 'Induced Magnet'
  | 'Variable Reluctance'
  | 'Ceramic'
  | 'Crystal'
  | 'Strain Gauge'
  | 'Dynamic Coil'
  | 'Electret Condenser'
  | 'Condensor'
  | 'Ribbon'
  | 'Photoelectric'
  | string;

export type CartridgeStylusInfo = {
  readonly type?: string;
  readonly family?: string;
  readonly cantilever_material?: string;
  readonly cantilever_class?: string;
};

export type CartridgeElectricalInfo = {
  readonly output_mv?: number;
  readonly load_impedance_ohm?: number;
  readonly load_capacitance_pf?: {
    readonly min?: number;
    readonly max?: number;
  };
};

export type CartridgeSonicProfile = {
  readonly character_en?: string;
  readonly review_summary_en?: string;
  readonly notes_en?: string;
};

export type CartridgeRecord = {
  readonly id: string;
  readonly legacy_id?: number | string;
  readonly manufacturer?: string;
  readonly model?: string;
  readonly display_name: string;
  readonly type?: CartridgeKind;
  readonly mass_g?: number;
  readonly tracking_force_g?: TrackingForceRange;
  readonly compliance?: ComplianceInfo;
  readonly stylus?: CartridgeStylusInfo;
  readonly electrical?: CartridgeElectricalInfo;
  readonly frequency_response_hz?: {
    readonly min?: number;
    readonly max?: number;
  };
  readonly channel_separation_db?: number;
  readonly sonic_profile?: CartridgeSonicProfile;
  readonly image_url?: string;
  readonly tags?: readonly string[];
  readonly data_quality: AudioDataQuality;
};

export type CartridgeRuntimeIndexRecord = {
  readonly id: string;
  readonly display_name: string;
  readonly manufacturer?: string;
  readonly model?: string;
  readonly type?: CartridgeKind;
  readonly mass_g?: number;
  readonly compliance_10hz_cu?: number;
  readonly compliance_10hz_source?: string;
  readonly tracking_force_g?: TrackingForceRange;
  readonly match_ready: boolean;
  readonly tags?: readonly string[];
};
