import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig({
	plugins: [svelte(), viteSingleFile()],
	base: '/estimate/',
	resolve: {
		conditions: process.env.VITEST ? ['browser'] : [],
	},
	test: {
		environment: 'jsdom',
		setupFiles: ['src/test-setup.ts'],
	},
})
