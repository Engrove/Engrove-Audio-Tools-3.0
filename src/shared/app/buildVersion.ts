import packageJson from '../../../package.json';

const fallbackVersion = '0.0.0';

function readPackageVersion(): string {
  if (typeof packageJson === 'object' && packageJson !== null) {
    const value = (packageJson as { version?: unknown }).version;
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return fallbackVersion;
}

export const buildVersion: string = readPackageVersion();

export function buildVersionLabel(): string {
  return `Build v${buildVersion}`;
}
