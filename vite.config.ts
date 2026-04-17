/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

const commitHash = execSync('git rev-parse --short HEAD').toString().trim()

// https://vite.dev/config/
export default defineConfig({
	plugins: [svelte(), viteSingleFile()],
	base: '/skatting/',
	define: {
		'process.env': {},
		global: 'globalThis',
		__BUILD_HASH__: JSON.stringify(commitHash),
	},
	resolve: {
		conditions: process.env.VITEST ? ['browser'] : undefined,
	},
	test: {
		environment: 'jsdom',
		setupFiles: ['src/test-setup.ts'],
	},
})
