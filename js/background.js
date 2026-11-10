/* Tâche de fond : notification de fin de Pomodoro, même si l'onglet est fermé. */
'use strict';

browser.runtime.onMessage.addListener((msg) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'pomo-schedule' && Number.isFinite(msg.when)) {
    return browser.storage.local
      .set({ pomoNotif: { title: String(msg.title || 'Pomodoro'), body: String(msg.body || 'Session terminée.') } })
      .then(() => browser.alarms.create('pomo', { when: msg.when }));
  }
  if (msg.type === 'pomo-cancel') return browser.alarms.clear('pomo');
});

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'pomo') return;
  const { pomoNotif } = await browser.storage.local.get('pomoNotif');
  browser.notifications.create('pomo', {
    type: 'basic',
    iconUrl: browser.runtime.getURL('img/icon-128.png'),
    title: (pomoNotif && pomoNotif.title) || 'Pomodoro',
    message: (pomoNotif && pomoNotif.body) || 'Session terminée.',
  });
});

browser.notifications.onClicked.addListener(() => browser.tabs.create({}));
