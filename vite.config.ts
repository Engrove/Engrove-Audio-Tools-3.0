
import { defineConfig } from 'vite';
import { execSync } from 'child_process';

function getGitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  appType: 'spa',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  define: {
    __GIT_COMMIT__: JSON.stringify(getGitCommit()),
  },
});
