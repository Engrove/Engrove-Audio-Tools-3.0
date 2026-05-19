/*
 * Measurement Lab workflow registry and test-record coverage calculation.
 * Each workflow entry describes a named measurement with its required
 * analyzer module, fallback band purposes, and implementation status.
 * Coverage is computed per selected test record: the analyzer module
 * roster drives availability — not the record name or manufacturer.
 */

import type { TestBand, TestBandAnalyzerModule, TestBandPurpose, TestRecord } from './loadTestRecords';

export type WorkflowImplementationStatus =
  | 'supported'   // engine exists; measurement is fully runnable
  | 'planned';    // signal mapping present in data; engine not yet built

export type WorkflowAvailability =
  | 'available'   // record has matching bands AND engine is supported
  | 'planned'     // record has matching bands but engine is planned/pending
  | 'partial'     // record has related bands (by purpose) but analyzer_module not mapped
  | 'unavailable'; // record has no relevant bands for this workflow

export type MeasurementWorkflow = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly requiredAnalyzerModule: TestBandAnalyzerModule;
  readonly fallbackPurposes: readonly TestBandPurpose[];
  readonly implementationStatus: WorkflowImplementationStatus;
  readonly unavailableReason: string;
};

export type WorkflowCoverage = {
  readonly workflowId: string;
  readonly availability: WorkflowAvailability;
  readonly matchingBands: readonly string[];
  readonly reason: string;
  readonly missing: readonly string[];
};

export const MEASUREMENT_WORKFLOWS: readonly MeasurementWorkflow[] = [
  {
    id: 'wow_flutter',
    label: 'Speed & Wow / Flutter',
    description: 'Measure platter speed deviation and wow & flutter from a 3150 Hz reference tone.',
    requiredAnalyzerModule: 'wow_flutter',
    fallbackPurposes: ['speed'],
    implementationStatus: 'supported',
    unavailableReason: 'No speed reference band on selected test record.',
  },
  {
    id: 'channel_crosstalk_geometry',
    label: 'Channel / Crosstalk Geometry',
    description: 'Combined Routing/Identity check and Azimuth Step Comparison. Mode A verifies L/R wiring; Mode B compares crosstalk evidence across azimuth steps.',
    requiredAnalyzerModule: 'channel_identity',
    fallbackPurposes: ['crosstalk'],
    implementationStatus: 'supported',
    unavailableReason: 'No channel-specific tone bands on selected test record.',
  },
  {
    id: 'frequency_response',
    label: 'Frequency response',
    description: 'Plot the cartridge response curve from a logarithmic frequency sweep.',
    requiredAnalyzerModule: 'frequency_response',
    fallbackPurposes: ['freq_response'],
    implementationStatus: 'supported',
    unavailableReason: 'No frequency sweep band on selected test record.',
  },
  {
    id: 'reference_level',
    label: 'Reference level calibration',
    description: 'Calibrate ADC input against standard groove level using a reference tone.',
    requiredAnalyzerModule: 'reference_calibration',
    fallbackPurposes: ['freq_response', 'thd'],
    implementationStatus: 'supported',
    unavailableReason: 'No reference calibration band on selected test record.',
  },
  {
    id: 'vta_imd_optimizer',
    label: 'VTA / IMD optimizer',
    description: 'Compare IMD at several tonearm-height settings to identify an experimental lowest-IMD candidate for further validation.',
    requiredAnalyzerModule: 'vta_imd_optimizer',
    fallbackPurposes: ['vta_optimization'],
    implementationStatus: 'planned',
    unavailableReason: 'No VTA optimization band on selected test record.',
  },
  {
    id: 'anti_skate_tracking_stress',
    label: 'Anti-skate / Tracking stress',
    description: 'Detect channel-specific breakup during a high-level escalating-amplitude anti-skate track.',
    requiredAnalyzerModule: 'anti_skate_tracking_stress',
    fallbackPurposes: ['tracking_ability'],
    implementationStatus: 'planned',
    unavailableReason: 'No anti-skate or tracking stress band on selected test record.',
  },
  {
    id: 'pink_noise_spectral',
    label: 'Pink noise / Spectral balance',
    description: 'Verify spectral balance and phono chain noise floor using broadband pink noise.',
    requiredAnalyzerModule: 'pink_noise_diagnostics',
    fallbackPurposes: ['pink_noise'],
    implementationStatus: 'planned',
    unavailableReason: 'No pink noise band on selected test record.',
  },
  {
    id: 'vertical_null',
    label: 'Vertical null / Azimuth',
    description: 'Verify mono-sum null and vertical channel balance with a vertical-modulation tone.',
    requiredAnalyzerModule: 'vertical_modulation',
    fallbackPurposes: ['vertical_modulation'],
    implementationStatus: 'planned',
    unavailableReason: 'No vertical modulation band on selected test record.',
  },
  {
    id: 'vertical_resonance',
    label: 'Vertical resonance',
    description: 'Detect vertical resonance peaks from a descending vertical modulation sweep.',
    requiredAnalyzerModule: 'vertical_resonance',
    fallbackPurposes: ['vertical_modulation'],
    implementationStatus: 'supported',
    unavailableReason: 'No vertical resonance sweep on selected test record.',
  },
  {
    id: 'rumble_isolation',
    label: 'Rumble & noise isolation',
    description: 'Measure bearing rumble and low-frequency noise floor from an unmodulated silent groove.',
    requiredAnalyzerModule: 'rumble_isolation',
    fallbackPurposes: ['rumble'],
    implementationStatus: 'planned',
    unavailableReason: 'No silent groove band on selected test record.',
  },
];

function bandSupportsAnalyzer(band: TestBand, requiredAnalyzerModule: TestBandAnalyzerModule): boolean {
  if (band.analyzerModule === requiredAnalyzerModule) return true;
  if (band.analyzerModules?.includes(requiredAnalyzerModule)) return true;
  return false;
}

/*
 * Computes availability of a single workflow for a given test record.
 *
 * Rules:
 *   available  — record has a band with the exact analyzer_module OR in analyzer_modules, AND engine is supported
 *   planned    — record has a band with the exact analyzer_module OR in analyzer_modules, AND engine is planned
 *   partial    — record has bands with a fallback purpose but analyzer_module not mapped
 *   unavailable — record has no bands relevant to this workflow
 */
export function computeWorkflowCoverage(
  record: TestRecord,
  workflow: MeasurementWorkflow,
): WorkflowCoverage {
  const allBands = record.sides.flatMap(s => [...s.bands]);

  const preciseBands = allBands.filter(b => bandSupportsAnalyzer(b, workflow.requiredAnalyzerModule));
  if (preciseBands.length > 0) {
    const matchingBands = preciseBands.map(b => `${b.index}: ${b.label}`);
    if (workflow.implementationStatus === 'supported') {
      return {
        workflowId: workflow.id,
        availability: 'available',
        matchingBands,
        reason: 'Available with selected test record.',
        missing: [],
      };
    }
    return {
      workflowId: workflow.id,
      availability: 'planned',
      matchingBands,
      reason: 'Signal present — analyzer pending.',
      missing: [],
    };
  }

  const partialBands = allBands.filter(b =>
    (workflow.fallbackPurposes as readonly string[]).includes(b.purpose),
  );
  if (partialBands.length > 0) {
    return {
      workflowId: workflow.id,
      availability: 'partial',
      matchingBands: partialBands.map(b => `${b.index}: ${b.label}`),
      reason: 'Metadata incomplete for this workflow.',
      missing: [`analyzer_module: ${workflow.requiredAnalyzerModule}`],
    };
  }

  return {
    workflowId: workflow.id,
    availability: 'unavailable',
    matchingBands: [],
    reason: workflow.unavailableReason,
    missing: [workflow.requiredAnalyzerModule],
  };
}

export function computeAllWorkflowCoverage(
  record: TestRecord,
): readonly WorkflowCoverage[] {
  return MEASUREMENT_WORKFLOWS.map(w => computeWorkflowCoverage(record, w));
}
