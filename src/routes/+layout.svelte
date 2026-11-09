<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import { requestNotificationPermission } from '$lib/utils/notifications';
	import QuickAttachModal from '$lib/components/QuickAttachModal.svelte';
	import '../app.css';

	let { children } = $props();

	const navItems = [
		{ href: `${base}/`, label: 'Today', icon: '📅' },
		{ href: `${base}/routines`, label: 'Routines', icon: '📋' },
		{ href: `${base}/history`, label: 'History', icon: '📊' }
	];

	onMount(async () => {
		// Request notification permission on first load
		await requestNotificationPermission();

		// Register PWA service worker
		if ('serviceWorker' in navigator) {
			try {
				const { registerSW } = await import('virtual:pwa-register');
				registerSW({
					immediate: true,
					onNeedRefresh() {
						if (confirm('New version available. Reload?')) {
							window.location.reload();
						}
					},
					onOfflineReady() {
						console.log('Routine is ready to work offline');
					}
				});
			} catch (e) {
				console.error('PWA service worker registration error:', e);
			}
		}
	});

	function isActive(path: string, currentPath: string): boolean {
		if (path === `${base}/` || path === `${base}`) {
			return currentPath === `${base}/` || currentPath === `${base}`;
		}
		return currentPath.startsWith(path);
	}
</script>

<div class="app-shell">
	<!-- Top App Bar -->
	<header class="top-bar">
		<h1 class="top-bar-title">Routine</h1>
	</header>

	<!-- Main Content -->
	<main class="main-content">
		{@render children()}
	</main>

	<!-- Quick Attach Modal (for Web Share Target) -->
	<QuickAttachModal />

	<!-- Bottom Navigation -->
	<nav class="bottom-nav">
		{#each navItems as item}
			<a
				href={item.href}
				class="nav-item"
				class:active={isActive(item.href, $page.url.pathname)}
			>
				<span class="nav-icon">{item.icon}</span>
				<span class="nav-label">{item.label}</span>
			</a>
		{/each}
	</nav>
</div>

<style>
	.app-shell {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		max-width: 600px;
		margin: 0 auto;
	}

	.top-bar {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		height: 64px;
		padding: 0 16px;
		background-color: var(--md-sys-color-surface);
		box-shadow: var(--md-sys-elevation-1);
	}

	.top-bar-title {
		font: var(--md-sys-typescale-title-large);
		color: var(--md-sys-color-on-surface);
	}

	.main-content {
		flex: 1;
		padding: 16px;
		padding-bottom: 80px; /* Space for bottom nav */
		overflow-y: auto;
	}

	.bottom-nav {
		position: fixed;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 100%;
		max-width: 600px;
		display: flex;
		justify-content: space-around;
		align-items: center;
		height: 64px;
		background-color: var(--md-sys-color-surface-container);
		border-top: 1px solid var(--md-sys-color-outline-variant);
		z-index: 10;
	}

	.nav-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 8px 20px;
		border-radius: var(--md-sys-shape-corner-full);
		text-decoration: none;
		color: var(--md-sys-color-on-surface-variant);
		transition: all 0.2s ease;
	}

	.nav-item.active {
		color: var(--md-sys-color-on-secondary-container);
		background-color: var(--md-sys-color-secondary-container);
	}

	.nav-icon {
		font-size: 1.25rem;
	}

	.nav-label {
		font: var(--md-sys-typescale-label-medium);
	}
</style>
