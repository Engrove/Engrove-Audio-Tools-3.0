export type ResonanceDiagnosis = {
  level: 'good' | 'borderline' | 'poor';
  code: 'poor_low' | 'borderline_low' | 'good' | 'borderline_high' | 'poor_high';
  title: string;
  explanation: string;
  suggestions: string[];
};

export function diagnoseResonance(hz: number): ResonanceDiagnosis {
  if (!Number.isFinite(hz) || hz <= 0) {
    throw new RangeError('resonanceHz must be a positive finite number.');
  }

  if (hz < 7) {
    return {
      level: 'poor',
      code: 'poor_low',
      title: 'Poor — resonance is too low',
      explanation:
        'Resonance is likely too low. Record warps, footfall and subsonic energy may become more visible.',
      suggestions: [
        'Reduce moving mass if the tonearm setup allows it.',
        'Use a lower-compliance cartridge.',
        'Check whether the compliance value has been converted to a 10 Hz estimate.',
      ],
    };
  }

  if (hz < 8) {
    return {
      level: 'borderline',
      code: 'borderline_low',
      title: 'Borderline — slightly low',
      explanation:
        'Resonance is just below the common 8–12 Hz target zone. It may work, but margin is limited.',
      suggestions: [
        'Try a slightly lower-compliance cartridge.',
        'Reduce fastener or headshell mass where practical.',
      ],
    };
  }

  if (hz <= 12) {
    return {
      level: 'good',
      code: 'good',
      title: 'Good match',
      explanation: 'Resonance is inside the common 8–12 Hz target zone.',
      suggestions: [
        'Confirm with the cartridge maker’s recommended tracking force.',
        'Use measured resonance checks later if the setup is critical.',
      ],
    };
  }

  if (hz <= 14) {
    return {
      level: 'borderline',
      code: 'borderline_high',
      title: 'Borderline — slightly high',
      explanation:
        'Resonance is just above the common 8–12 Hz target zone. It may still be usable, but bass and tracking margin should be checked.',
      suggestions: [
        'Increase moving mass slightly if the arm and cartridge allow it.',
        'Try a higher-compliance cartridge.',
      ],
    };
  }

  return {
    level: 'poor',
    code: 'poor_high',
    title: 'Poor — resonance is too high',
    explanation:
      'Resonance is likely too high. Increase moving mass or use a higher-compliance cartridge.',
    suggestions: [
      'Increase moving mass with a heavier headshell or added mass only if safe for the arm.',
      'Use a higher-compliance cartridge.',
      'Check that the compliance value is not a 100 Hz figure used directly.',
    ],
  };
}
