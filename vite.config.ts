import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			injectRegister: false,
			manifest: {
				name: 'Routine',
				short_name: 'Routine',
				description: 'Routine-based skill building with timers',
				theme_color: '#6750A4',
				background_color: '#FFFBFE',
				display: 'standalone',
				orientation: 'portrait',
				id: './',
				start_url: './',
				scope: './',
				icons: [
					{
						src: 'pwa-192x192.png',
						sizes: '192x192',
						type: 'image/png',
						purpose: 'any'
					},
					{
						src: 'pwa-maskable-192x192.png',
						sizes: '192x192',
						type: 'image/png',
						purpose: 'maskable'
					},
					{
						src: 'pwa-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'any'
					},
					{
						src: 'pwa-maskable-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				],
				share_target: {
					action: './',
					method: 'GET',
					enctype: 'application/x-www-form-urlencoded',
					params: {
						title: 'share_title',
						text: 'share_text',
						url: 'share_url'
					}
				}
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
				importScripts: ['sw-notifications.js']
			},
			devOptions: {
				enabled: true,
				type: 'module'
			}
		})
	]
});
