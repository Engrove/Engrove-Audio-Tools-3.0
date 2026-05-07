import type { AudioDataQuality, NumericRange } from './audioData';

export type TonearmHeadshellConnector =
  | 'integrated'
  | 'sme_universal'
  | 'proprietary'
  | 'p_mount_t4p'
  | 'unknown'
  | string;

export type TonearmGeometry = {
  readonly effective_length_mm?: number;
  readonly pivot_to_spindle_mm?: number;
  readonly overhang_mm?: number;
  readonly offset_angle_deg?: number;
  readonly alignment_geometry?: string;
  readonly null_points_mm?: readonly number[];
};

export type TonearmConstruction = {
  readonly arm_shape?: string;
  readonly arm_material?: string;
  readonly bearing_type?: string;
  readonly headshell_connector?: TonearmHeadshellConnector;
  readonly tracking_method?: string;
  readonly internal_wiring_material?: string;
  readonly detachable_cable?: boolean;
  readonly external_cable_capacitance_pf?: number;
};

export type TonearmAdjustment = {
  readonly vta?: boolean;
  readonly azimuth?: boolean;
};

export type TonearmCompatibility = {
  readonly cartridge_weight_range_g?: NumericRange;
  readonly tracking_force_range_g?: NumericRange;
};

export type TonearmCalculatorExample = {
  readonly m_headshell_g?: number;
  readonly m_rear_assembly_g?: number;
  readonly m_tube_percentage?: number;
  readonly l2_mm?: number;
  readonly l3_fixed_cw_mm?: number;
};

export type TonearmRecord = {
  readonly id: string;
  readonly legacy_id?: number | string;
  readonly manufacturer?: string;
  readonly model?: string;
  readonly display_name: string;
  readonly effective_mass_g?: number;
  readonly geometry?: TonearmGeometry;
  readonly construction?: TonearmConstruction;
  readonly adjustment?: TonearmAdjustment;
  readonly compatibility?: TonearmCompatibility;
  readonly notes?: string;
  readonly calculator_example?: TonearmCalculatorExample;
  readonly data_quality: AudioDataQuality;
};

export type TonearmRuntimeIndexRecord = {
  readonly id: string;
  readonly display_name: string;
  readonly manufacturer?: string;
  readonly model?: string;
  readonly effective_mass_g?: number;
  readonly effective_length_mm?: number;
  readonly headshell_connector?: TonearmHeadshellConnector;
  readonly cartridge_weight_range_g?: NumericRange;
  readonly match_ready: boolean;
};
