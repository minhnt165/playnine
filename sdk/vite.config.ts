/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

// Hai bản build: IIFE (window.PlayNine cho game cũ) và ESM. Bản ESM build bằng --mode esm.
export default defineConfig(({ mode }) => {
  const esm = mode === 'esm'
  return {
    build: {
      emptyOutDir: !esm,
      lib: esm
        ? { entry: 'src/sdk.ts', formats: ['es' as const], fileName: () => 'playnine.mjs' }
        : { entry: 'src/global.ts', formats: ['iife' as const], name: 'PlayNineSdk', fileName: () => 'playnine.js' },
    },
    test: { environment: 'jsdom' },
  }
})