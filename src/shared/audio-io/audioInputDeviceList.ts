/*
 * Enumerates audio input devices. Device labels are only populated by
 * the browser after the user has granted microphone permission at least
 * once; before that the list still returns entries but with empty labels.
 * The Measurement Lab UI shows an enumeration in both states and uses a
 * placeholder name when the label is missing.
 */

export type AudioInputDeviceInfo = {
  readonly deviceId: string;
  readonly label: string;
  readonly groupId: string;
};

export class AudioDeviceEnumerationError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'AudioDeviceEnumerationError';
    this.cause = cause;
  }
}

function hasEnumerationApi(): boolean {
  return typeof navigator !== 'undefined'
    && typeof navigator.mediaDevices === 'object'
    && navigator.mediaDevices !== null
    && typeof navigator.mediaDevices.enumerateDevices === 'function';
}

export async function listAudioInputDevices(): Promise<AudioInputDeviceInfo[]> {
  if (!hasEnumerationApi()) {
    throw new AudioDeviceEnumerationError(
      'This browser does not expose navigator.mediaDevices.enumerateDevices.',
    );
  }

  let devices: MediaDeviceInfo[];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch (error) {
    throw new AudioDeviceEnumerationError(
      'Failed to enumerate audio input devices.',
      error,
    );
  }

  return devices
    .filter((device) => device.kind === 'audioinput')
    .map((device) => ({
      deviceId: device.deviceId,
      label: device.label,
      groupId: device.groupId,
    }));
}

export function describeDevice(device: AudioInputDeviceInfo | null): string {
  if (!device) return 'No device selected.';
  if (device.label) return device.label;
  if (device.deviceId === 'default') return 'System default input';
  if (device.deviceId === 'communications') return 'Communications input';
  if (device.deviceId.length === 0) return 'Unnamed input';
  return `Audio input (${device.deviceId.slice(0, 8)}…)`;
}
