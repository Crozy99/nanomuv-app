const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.send('get-settings'),
  onSettingsData: (callback) => ipcRenderer.on('settings-data', (event, data) => callback(data)),
  
  updateSettings: (settings) => ipcRenderer.send('update-settings', settings),
  onSettingsUpdated: (callback) => ipcRenderer.on('settings-updated', (event, data) => callback(data)),
  
  getExercises: () => ipcRenderer.send('get-exercises'),
  onExerciseData: (callback) => ipcRenderer.on('exercise-data', (event, data) => callback(data)),
  
  postponeReminder: () => ipcRenderer.send('postpone-reminder'),
  onPostponeAccepted: (callback) => ipcRenderer.on('postpone-accepted', callback),
  
  completeExercise: () => ipcRenderer.send('complete-exercise'),
  onExerciseCompleted: (callback) => ipcRenderer.on('exercise-completed', (event, data) => callback(data)),

  getStats: () => ipcRenderer.send('get-stats'),
  onStatsData: (callback) => ipcRenderer.on('stats-data', (event, data) => callback(data)),

  onCountdownTick: (callback) => ipcRenderer.on('countdown-tick', (event, data) => callback(data)),

  getExerciseList: () => ipcRenderer.send('get-exercise-list'),
  onExerciseListData: (callback) => ipcRenderer.on('exercise-list-data', (event, data) => callback(data)),

  updateEnabledExercises: (ids) => ipcRenderer.send('update-enabled-exercises', ids),
  onEnabledExercisesUpdated: (callback) => ipcRenderer.on('enabled-exercises-updated', (event, data) => callback(data)),

  openExternalLink: (url) => ipcRenderer.send('open-external-link', url),
});
