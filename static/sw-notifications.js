// Handles interactive notification action clicks for Routine PWA
self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const action = event.action;
	const taskId = event.notification.data ? event.notification.data.taskId : null;

	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
			let client = clientList.find((c) => 'focus' in c);

			if (action === 'add-2' || action === 'add-5') {
				const minutes = action === 'add-2' ? 2 : 5;
				if (client) {
					client.postMessage({
						type: 'NOTIFICATION_ADD_EXTRA_MINUTES',
						minutes,
						taskId
					});
					return client.focus();
				} else {
					return self.clients.openWindow(`./?action=add-extra&minutes=${minutes}`);
				}
			} else {
				// 'done' action or clicking notification body directly
				if (client) {
					client.postMessage({
						type: 'NOTIFICATION_TASK_DONE',
						taskId
					});
					return client.focus();
				} else {
					return self.clients.openWindow('./');
				}
			}
		})
	);
});
