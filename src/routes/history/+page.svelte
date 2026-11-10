<script lang="ts">
	import { onMount } from 'svelte';
	import {
		getSessionHistory,
		getSessionsForMonth,
		getSessionsAndTasksForDate,
		markDayRoutinesCompleted,
		togglePastTaskProgress,
		type DayRoutineDetail
	} from '$lib/db/sessions';
	import { formatDuration } from '$lib/utils/time';
	import type { RoutineSession } from '$lib/db/types';

	interface HistoryEntry extends RoutineSession {
		routineTitle: string;
	}

	interface GroupedHistory {
		date: string;
		dateLabel: string;
		entries: HistoryEntry[];
	}

	interface CalendarDay {
		dateStr: string;
		dayNumber: number;
		isCurrentMonth: boolean;
		isToday: boolean;
		isSelected: boolean;
		status: 'completed' | 'partial' | 'pending' | 'none';
	}

	let viewMode = $state<'calendar' | 'list'>('calendar');
	let loading = $state(true);
	let history = $state<GroupedHistory[]>([]);

	// Calendar state
	const todayObj = new Date();
	const todayDateStr = formatDateKey(todayObj);

	let currentYear = $state(todayObj.getFullYear());
	let currentMonth = $state(todayObj.getMonth() + 1); // 1-12
	let selectedDateStr = $state(todayDateStr);

	let monthSessions = $state<(RoutineSession & { routineTitle: string })[]>([]);
	let selectedDayDetails = $state<DayRoutineDetail[]>([]);
	let detailsLoading = $state(false);
	let markingCompleted = $state(false);

	const monthNames = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];
	const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	function formatDateKey(d: Date): string {
		const year = d.getFullYear();
		const month = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function formatTimeOnly(date?: Date | string): string {
		if (!date) return '';
		const d = new Date(date);
		return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	}

	function formatDisplayDate(dateStr: string): string {
		const [year, month, day] = dateStr.split('-').map(Number);
		const d = new Date(year, month - 1, day);
		return d.toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	onMount(async () => {
		await loadAllData();
	});

	async function loadAllData() {
		loading = true;
		try {
			await Promise.all([loadListHistory(), loadMonthData()]);
			await loadSelectedDayDetails();
		} catch (err) {
			console.error('Failed to load history data:', err);
		} finally {
			loading = false;
		}
	}

	async function loadListHistory() {
		const raw = (await getSessionHistory(60)) as HistoryEntry[];
		const grouped = new Map<string, HistoryEntry[]>();
		for (const entry of raw) {
			const key = entry.date;
			if (!grouped.has(key)) {
				grouped.set(key, []);
			}
			grouped.get(key)!.push(entry);
		}

		history = Array.from(grouped.entries()).map(([date, entries]) => ({
			date,
			dateLabel: formatDateLabel(date),
			entries
		}));
	}

	async function loadMonthData() {
		monthSessions = await getSessionsForMonth(currentYear, currentMonth);
	}

	async function loadSelectedDayDetails() {
		detailsLoading = true;
		try {
			selectedDayDetails = await getSessionsAndTasksForDate(selectedDateStr);
		} finally {
			detailsLoading = false;
		}
	}

	function formatDateLabel(dateStr: string): string {
		const [year, month, day] = dateStr.split('-').map(Number);
		const date = new Date(year, month - 1, day);
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		if (date.toDateString() === today.toDateString()) return 'Today';
		if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
		});
	}

	function prevMonth() {
		if (currentMonth === 1) {
			currentMonth = 12;
			currentYear -= 1;
		} else {
			currentMonth -= 1;
		}
		loadMonthData();
	}

	function nextMonth() {
		if (currentMonth === 12) {
			currentMonth = 1;
			currentYear += 1;
		} else {
			currentMonth += 1;
		}
		loadMonthData();
	}

	function goToToday() {
		const now = new Date();
		currentYear = now.getFullYear();
		currentMonth = now.getMonth() + 1;
		selectedDateStr = todayDateStr;
		loadMonthData();
		loadSelectedDayDetails();
	}

	function selectDay(dateStr: string) {
		selectedDateStr = dateStr;
		loadSelectedDayDetails();
	}

	async function handleMarkDayCompleted() {
		if (markingCompleted) return;
		markingCompleted = true;
		try {
			await markDayRoutinesCompleted(selectedDateStr);
			await Promise.all([loadMonthData(), loadSelectedDayDetails(), loadListHistory()]);
		} catch (err) {
			console.error('Failed to mark day completed:', err);
		} finally {
			markingCompleted = false;
		}
	}

	async function handleToggleTask(
		detail: DayRoutineDetail,
		progressId: number | undefined,
		taskId: number,
		currentStatus: string
	) {
		const targetStatus = currentStatus !== 'completed';
		if (!detail.session?.id || !progressId) {
			// If session doesn't exist yet, mark the day or create session
			await markDayRoutinesCompleted(selectedDateStr);
		} else {
			await togglePastTaskProgress(progressId, detail.session.id, detail.routine.id!, targetStatus);
		}
		await Promise.all([loadMonthData(), loadSelectedDayDetails(), loadListHistory()]);
	}

	// Compute Calendar Grid
	const calendarDays = $derived.by(() => {
		const days: CalendarDay[] = [];
		const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

		// Determine weekday of 1st day of month (Monday = 0 ... Sunday = 6)
		const firstDayRaw = new Date(currentYear, currentMonth - 1, 1).getDay();
		const startOffset = (firstDayRaw + 6) % 7;

		// Previous month padding
		const prevMonthDays = new Date(currentYear, currentMonth - 1, 0).getDate();
		for (let i = startOffset - 1; i >= 0; i--) {
			const dNum = prevMonthDays - i;
			const prevM = currentMonth === 1 ? 12 : currentMonth - 1;
			const prevY = currentMonth === 1 ? currentYear - 1 : currentYear;
			const dateStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
			days.push({
				dateStr,
				dayNumber: dNum,
				isCurrentMonth: false,
				isToday: dateStr === todayDateStr,
				isSelected: dateStr === selectedDateStr,
				status: 'none'
			});
		}

		// Current month days
		for (let day = 1; day <= daysInMonth; day++) {
			const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
			const sessionsOnDate = monthSessions.filter((s) => s.date === dateStr);

			let status: 'completed' | 'partial' | 'pending' | 'none' = 'none';
			if (sessionsOnDate.length > 0) {
				const allDone = sessionsOnDate.every((s) => s.status === 'completed');
				const someDone = sessionsOnDate.some((s) => s.status === 'completed' || s.status === 'in-progress');
				status = allDone ? 'completed' : someDone ? 'partial' : 'pending';
			}

			days.push({
				dateStr,
				dayNumber: day,
				isCurrentMonth: true,
				isToday: dateStr === todayDateStr,
				isSelected: dateStr === selectedDateStr,
				status
			});
		}

		// Next month padding to complete 35 or 42 cells
		const totalCells = days.length <= 35 ? 35 : 42;
		const nextPadding = totalCells - days.length;
		for (let i = 1; i <= nextPadding; i++) {
			const nextM = currentMonth === 12 ? 1 : currentMonth + 1;
			const nextY = currentMonth === 12 ? currentYear + 1 : currentYear;
			const dateStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
			days.push({
				dateStr,
				dayNumber: i,
				isCurrentMonth: false,
				isToday: dateStr === todayDateStr,
				isSelected: dateStr === selectedDateStr,
				status: 'none'
			});
		}

		return days;
	});

	function getStatusIcon(status: string): string {
		switch (status) {
			case 'completed': return '✅';
			case 'in-progress': return '⏳';
			case 'skipped': return '⏭';
			default: return '○';
		}
	}

	function getStatusText(status: string): string {
		switch (status) {
			case 'completed': return 'Completed';
			case 'in-progress': return 'In Progress';
			case 'skipped': return 'Skipped';
			default: return 'Pending';
		}
	}
</script>

<div class="history-page">
	<div class="header-row">
		<h2 class="title-large page-title">Completion History</h2>
		<div class="view-toggle">
			<button
				class="toggle-btn"
				class:active={viewMode === 'calendar'}
				onclick={() => (viewMode = 'calendar')}
			>
				📅 Calendar
			</button>
			<button
				class="toggle-btn"
				class:active={viewMode === 'list'}
				onclick={() => (viewMode = 'list')}
			>
				📋 List
			</button>
		</div>
	</div>

	{#if loading}
		<div class="loading-state">
			<p class="body-large">Loading history...</p>
		</div>
	{:else if viewMode === 'calendar'}
		<!-- Month Navigation -->
		<div class="calendar-card">
			<div class="month-nav">
				<button class="nav-arrow-btn" onclick={prevMonth} aria-label="Previous Month">‹</button>
				<div class="month-title-group">
					<h3 class="title-medium month-label">
						{monthNames[currentMonth - 1]} {currentYear}
					</h3>
					<button class="today-jump-btn label-small" onclick={goToToday}>Today</button>
				</div>
				<button class="nav-arrow-btn" onclick={nextMonth} aria-label="Next Month">›</button>
			</div>

			<!-- Weekday Headers (Monday to Sunday) -->
			<div class="weekdays-grid">
				{#each weekDays as wd}
					<div class="weekday-header label-small">{wd}</div>
				{/each}
			</div>

			<!-- Days Grid -->
			<div class="days-grid">
				{#each calendarDays as day (day.dateStr)}
					<button
						class="day-cell"
						class:other-month={!day.isCurrentMonth}
						class:is-today={day.isToday}
						class:is-selected={day.isSelected}
						onclick={() => selectDay(day.dateStr)}
					>
						<span class="day-number label-medium">{day.dayNumber}</span>
						<span
							class="status-indicator"
							class:dot-completed={day.status === 'completed'}
							class:dot-partial={day.status === 'partial'}
							class:dot-pending={day.status === 'pending'}
						></span>
					</button>
				{/each}
			</div>

			<!-- Legend -->
			<div class="calendar-legend">
				<div class="legend-item">
					<span class="legend-dot dot-completed"></span>
					<span class="label-small">All Completed</span>
				</div>
				<div class="legend-item">
					<span class="legend-dot dot-partial"></span>
					<span class="label-small">Partial</span>
				</div>
				<div class="legend-item">
					<span class="legend-dot dot-pending"></span>
					<span class="label-small">Pending</span>
				</div>
			</div>
		</div>

		<!-- Selected Day Detail Sheet -->
		<div class="day-detail-section">
			<div class="detail-header-row">
				<div>
					<h3 class="title-medium detail-date-title">📅 {formatDisplayDate(selectedDateStr)}</h3>
					{#if selectedDateStr === todayDateStr}
						<span class="label-small today-badge">Today</span>
					{/if}
				</div>
				<button
					class="btn-complete-day"
					disabled={markingCompleted}
					onclick={handleMarkDayCompleted}
				>
					{markingCompleted ? 'Updating...' : '✓ Mark whole day completed'}
				</button>
			</div>

			{#if detailsLoading}
				<div class="details-loading">
					<p class="body-medium">Loading routines for this day...</p>
				</div>
			{:else if selectedDayDetails.length === 0}
				<div class="no-routines-box">
					<p class="body-medium" style="color: var(--md-sys-color-on-surface-variant)">
						No active routines were scheduled or recorded for this date.
					</p>
				</div>
			{:else}
				<div class="day-routines-list">
					{#each selectedDayDetails as detail (detail.routine.id)}
						<div class="day-routine-card" class:routine-all-done={detail.isCompleted}>
							<div class="routine-card-top">
								<div>
									<h4 class="title-small routine-title">{detail.routine.title}</h4>
									<span class="label-small routine-status-text">
										{#if detail.isCompleted}
											<span class="badge-done">Completed ✓</span>
										{:else}
											{detail.completedCount}/{detail.totalCount} tasks completed
										{/if}
									</span>
								</div>
							</div>

							<!-- Task Checklist -->
							<div class="day-task-items">
								{#each detail.tasksWithProgress as tp (tp.taskId)}
									<button
										class="day-task-row"
										onclick={() => handleToggleTask(detail, tp.id, tp.taskId, tp.status)}
									>
										<input
											type="checkbox"
											checked={tp.status === 'completed'}
											class="task-chk"
											tabindex="-1"
										/>
										<div class="task-info">
											<span class="body-medium task-name" class:name-completed={tp.status === 'completed'}>
												{tp.task.title}
											</span>
											<span class="label-small task-time-meta">
												{formatDuration(tp.task.duration)}
												{#if tp.status === 'completed'}
													· Done {#if tp.completedAt}({formatTimeOnly(tp.completedAt)}){/if}
												{:else if tp.elapsedSeconds > 0}
													· {formatDuration(tp.elapsedSeconds)} done
												{/if}
											</span>
										</div>
									</button>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{:else}
		<!-- Classic Chronological List View -->
		{#if history.length === 0}
			<div class="empty-state">
				<div class="empty-icon">📊</div>
				<p class="title-medium">No history yet</p>
				<p class="body-medium" style="color: var(--md-sys-color-on-surface-variant)">
					Complete some routines and they'll appear here
				</p>
			</div>
		{:else}
			{#each history as group (group.date)}
				<div class="date-group">
					<h3 class="label-large date-group-header">📅 {group.dateLabel}</h3>
					<div class="entries">
						{#each group.entries as entry (entry.id)}
							<div class="history-entry">
								<span class="entry-icon">{getStatusIcon(entry.status)}</span>
								<div class="entry-info">
									<span class="body-medium entry-title">{entry.routineTitle}</span>
									<span class="label-medium entry-status">{getStatusText(entry.status)}</span>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		{/if}
	{/if}
</div>

<style>
	.history-page {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.header-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.page-title {
		color: var(--md-sys-color-on-surface);
	}

	.view-toggle {
		display: inline-flex;
		background-color: var(--md-sys-color-surface-container);
		border-radius: var(--md-sys-shape-corner-full);
		padding: 3px;
	}

	.toggle-btn {
		padding: 6px 14px;
		border: none;
		border-radius: var(--md-sys-shape-corner-full);
		background: none;
		color: var(--md-sys-color-on-surface-variant);
		font: var(--md-sys-typescale-label-medium);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.toggle-btn.active {
		background-color: var(--md-sys-color-primary);
		color: var(--md-sys-color-on-primary);
		font-weight: 600;
	}

	.loading-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 48px 16px;
		text-align: center;
	}

	.empty-icon {
		font-size: 3rem;
	}

	/* Calendar Card */
	.calendar-card {
		background-color: var(--md-sys-color-surface-container-low);
		border-radius: var(--md-sys-shape-corner-medium);
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		border: 1px solid var(--md-sys-color-outline-variant);
	}

	.month-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.month-title-group {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.month-label {
		font-weight: 700;
		color: var(--md-sys-color-on-surface);
	}

	.today-jump-btn {
		padding: 4px 10px;
		background-color: var(--md-sys-color-surface-container-highest);
		border: none;
		border-radius: var(--md-sys-shape-corner-full);
		color: var(--md-sys-color-primary);
		font-weight: 600;
		cursor: pointer;
	}

	.nav-arrow-btn {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		border: 1px solid var(--md-sys-color-outline-variant);
		background-color: var(--md-sys-color-surface);
		color: var(--md-sys-color-on-surface);
		font-size: 1.4rem;
		cursor: pointer;
		transition: background-color 0.2s ease;
	}

	.nav-arrow-btn:hover {
		background-color: var(--md-sys-color-surface-container-highest);
	}

	.weekdays-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		text-align: center;
	}

	.weekday-header {
		color: var(--md-sys-color-on-surface-variant);
		font-weight: 600;
		padding: 4px 0;
	}

	.days-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 4px;
	}

	.day-cell {
		aspect-ratio: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		border: 1px solid transparent;
		border-radius: var(--md-sys-shape-corner-small);
		background: none;
		color: var(--md-sys-color-on-surface);
		cursor: pointer;
		position: relative;
		transition: all 0.15s ease;
		padding: 2px;
	}

	.day-cell:hover {
		background-color: var(--md-sys-color-surface-container-highest);
	}

	.day-cell.other-month {
		opacity: 0.3;
	}

	.day-cell.is-today {
		border-color: var(--md-sys-color-primary);
		font-weight: 700;
	}

	.day-cell.is-selected {
		background-color: var(--md-sys-color-primary-container);
		color: var(--md-sys-color-on-primary-container);
		font-weight: 700;
	}

	.day-number {
		font-size: 0.9rem;
	}

	.status-indicator {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		margin-top: 2px;
		background: transparent;
	}

	.dot-completed {
		background-color: #2E7D32 !important;
	}

	.dot-partial {
		background-color: #F57C00 !important;
	}

	.dot-pending {
		background-color: var(--md-sys-color-outline) !important;
	}

	.calendar-legend {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding-top: 6px;
		border-top: 1px solid var(--md-sys-color-outline-variant);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--md-sys-color-on-surface-variant);
	}

	.legend-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	/* Day Detail Section */
	.day-detail-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.detail-header-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 12px;
		padding: 4px 0;
	}

	.detail-date-title {
		color: var(--md-sys-color-on-surface);
		display: inline;
	}

	.today-badge {
		margin-left: 8px;
		padding: 2px 8px;
		background-color: var(--md-sys-color-primary-container);
		color: var(--md-sys-color-on-primary-container);
		border-radius: var(--md-sys-shape-corner-full);
		font-weight: 600;
	}

	.btn-complete-day {
		padding: 8px 16px;
		background-color: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
		border: 1px solid var(--md-sys-color-outline-variant);
		border-radius: var(--md-sys-shape-corner-full);
		font: var(--md-sys-typescale-label-medium);
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-complete-day:hover {
		background-color: #E8F5E9;
		color: #1B5E20;
		border-color: #A5D6A7;
	}

	.day-routines-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.day-routine-card {
		background-color: var(--md-sys-color-surface-container);
		border-radius: var(--md-sys-shape-corner-medium);
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		border-left: 4px solid var(--md-sys-color-outline);
	}

	.day-routine-card.routine-all-done {
		border-left-color: #2E7D32;
	}

	.routine-card-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.routine-title {
		color: var(--md-sys-color-on-surface);
		font-weight: 700;
	}

	.badge-done {
		color: #2E7D32;
		font-weight: 600;
	}

	.routine-status-text {
		color: var(--md-sys-color-on-surface-variant);
	}

	.day-task-items {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-top: 6px;
		border-top: 1px solid var(--md-sys-color-outline-variant);
	}

	.day-task-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		background-color: var(--md-sys-color-surface);
		border: 1px solid var(--md-sys-color-outline-variant);
		border-radius: var(--md-sys-shape-corner-small);
		text-align: left;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}

	.day-task-row:hover {
		background-color: var(--md-sys-color-surface-container-highest);
	}

	.task-chk {
		width: 18px;
		height: 18px;
		accent-color: var(--md-sys-color-primary);
		cursor: pointer;
	}

	.task-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.task-name {
		color: var(--md-sys-color-on-surface);
	}

	.task-name.name-completed {
		text-decoration: line-through;
		color: var(--md-sys-color-on-surface-variant);
	}

	.task-time-meta {
		color: var(--md-sys-color-on-surface-variant);
	}

	/* Classic List View Styles */
	.date-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.date-group-header {
		color: var(--md-sys-color-on-surface-variant);
		padding: 4px 0;
	}

	.entries {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.history-entry {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-radius: var(--md-sys-shape-corner-small);
		background-color: var(--md-sys-color-surface-container-low);
	}

	.entry-icon {
		font-size: 1.1rem;
	}

	.entry-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.entry-title {
		color: var(--md-sys-color-on-surface);
	}

	.entry-status {
		color: var(--md-sys-color-on-surface-variant);
	}
</style>
