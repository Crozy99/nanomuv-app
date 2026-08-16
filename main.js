const { app, BrowserWindow, Menu, ipcMain, Tray, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');

// Persistent storage - saved to disk automatically by electron-store
// Windows location: %APPDATA%\nanomuv-app\config.json
const store = new Store({
  defaults: {
    settings: {
      interval: 60, // minutes
      soundEnabled: true,
      theme: 'dark', // 'dark' or 'light'
      postponeMinutes: 10, // how long a postpone delays the next reminder
      exerciseMinutes: 5,  // how long the exercise window lasts on the reminder screen
    },
    stats: {
      totalCompleted: 0,      // all-time completed exercises
      todayCompleted: 0,      // completed today
      currentStreak: 0,       // consecutive days with >=1 completed exercise
      lastCompletionDate: null, // 'YYYY-MM-DD' string, local time
    },
    // Which exercises are allowed to appear in the reminder rotation.
    // Defaults to all 12 enabled.
    enabledExerciseIds: Array.from({ length: 12 }, (_, i) => i + 1),
  },
});

let mainWindow;
let tray = null;
let timerInterval = null;
let reminderWindow = null;
let timeElapsed = 0;
// The target for the CURRENT cycle - normally equals the interval, but gets
// temporarily shortened by a postpone, then reset back to normal afterward.
let currentCycleTargetSeconds = 60 * 60;

// Tracks the last few exercise ids shown, so we don't repeat one
// too soon. Session-only (resets on app restart) - that's fine,
// a fresh restart is a natural point for the rotation to reset too.
let recentExerciseIds = [];
const NO_REPEAT_WINDOW = 5; // won't repeat any of the last 5 shown

// postponeAllowed is per-session/per-cycle, not persisted
let userSettings = {
  theme: 'dark',
  postponeMinutes: 10,
  exerciseMinutes: 5,
  ...store.get('settings'),
  postponeAllowed: true,
};
currentCycleTargetSeconds = (userSettings.interval || 60) * 60;

// Which exercises the user wants in rotation - kept in memory, synced with store
let enabledExerciseIds = store.get('enabledExerciseIds');

// Returns today's date as YYYY-MM-DD in local time (avoids UTC day-boundary bugs)
function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getYesterdayString() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Computes the stats object to display, without mutating storage.
// If the streak is broken (missed a day), it shows 0 even though the
// stored value isn't cleared until the user completes a new exercise.
function getDisplayStats() {
  const stats = store.get('stats');
  const today = getTodayString();
  const yesterday = getYesterdayString();

  const streakIsAlive = stats.lastCompletionDate === today || stats.lastCompletionDate === yesterday;
  const todayCompleted = stats.lastCompletionDate === today ? stats.todayCompleted : 0;

  return {
    totalCompleted: stats.totalCompleted,
    todayCompleted,
    currentStreak: streakIsAlive ? stats.currentStreak : 0,
  };
}

// Exercise database - categorized for future variety-by-type logic
const exercises = [
  {
    id: 1,
    name: 'Air Squats',
    category: 'strength',
    icon: '🦵',
    animation: 'squat',
    description: 'Stand with feet shoulder-width apart. Bend knees and lower your body as if sitting in a chair. Return to standing.',
    shortDesc: 'Bend knees, sit back, stand up',
    reps: '15-20',
    duration: '1 minute',
    videoUrl: 'https://www.youtube.com/watch?v=a_fb6Kz7FQg',
  },
  {
    id: 2,
    name: 'Push-ups',
    category: 'strength',
    icon: '💪',
    animation: 'pushup',
    description: 'Lie face down, hands under shoulders. Push your body up until arms are straight. Lower back down.',
    shortDesc: 'Lower and press up off the floor',
    reps: '10-15',
    duration: '1-2 minutes',
    videoUrl: 'https://www.youtube.com/watch?v=WDIpL0pjun0',
  },
  {
    id: 3,
    name: 'Jumping Jacks',
    category: 'cardio',
    icon: '🤸',
    animation: 'jump',
    description: 'Stand with feet together. Jump while spreading feet apart and raising arms overhead. Return to start.',
    shortDesc: 'Jump feet apart, arms overhead',
    reps: '20-30',
    duration: '1 minute',
    videoUrl: 'https://www.youtube.com/shorts/bT2iY8IjEU0',
  },
  {
    id: 4,
    name: 'Stair Climbing',
    category: 'cardio',
    icon: '🪜',
    animation: 'march',
    description: 'Walk up and down stairs at a moderate to brisk pace.',
    shortDesc: 'Walk stairs at a brisk pace',
    reps: 'Continuous',
    duration: '2-3 minutes',
  },
  {
    id: 5,
    name: 'Plank',
    category: 'strength',
    icon: '🧘',
    animation: 'plank',
    description: 'Face down, elbows on ground. Keep your body straight from head to heels. Hold.',
    shortDesc: 'Hold a straight-body forearm plank',
    reps: '1 set',
    duration: '30-60 seconds',
    videoUrl: 'https://www.youtube.com/shorts/v25dawSzRTM',
  },
  {
    id: 6,
    name: 'Walking',
    category: 'cardio',
    icon: '🚶',
    animation: 'march',
    description: 'Walk at a comfortable pace around your home or office.',
    shortDesc: 'Walk at a comfortable pace',
    reps: 'Continuous',
    duration: '2-5 minutes',
  },
  {
    id: 7,
    name: 'Lunges',
    category: 'strength',
    icon: '🏋️',
    animation: 'lunge',
    description: 'Step forward with one leg and lower your body until back knee nearly touches floor. Alternate legs.',
    shortDesc: 'Step forward, lower, alternate legs',
    reps: '10 each leg',
    duration: '1-2 minutes',
    videoUrl: 'https://www.youtube.com/shorts/BYe4uyGF-h4',
  },
  {
    id: 8,
    name: 'Burpees',
    category: 'cardio',
    icon: '🔥',
    animation: 'burpee',
    description: 'Squat, kick feet back into plank, push-up, squat, jump up.',
    shortDesc: 'Squat, plank, push-up, jump',
    reps: '8-12',
    duration: '1-2 minutes',
    videoUrl: 'https://www.youtube.com/watch?v=NCqbpkoiyXE',
  },
  {
    id: 9,
    name: 'High Knees',
    category: 'cardio',
    icon: '🏃',
    animation: 'march-fast',
    description: 'Jog in place, driving your knees up toward your chest as high and fast as you comfortably can.',
    shortDesc: 'Jog in place, knees up high',
    reps: '30-40 total',
    duration: '1 minute',
    videoUrl: 'https://www.youtube.com/shorts/LJMrXG_vPQ8',
  },
  {
    id: 10,
    name: 'Mountain Climbers',
    category: 'cardio',
    icon: '⛰️',
    animation: 'mountain-climbers',
    description: 'Start in a plank position. Drive knees alternately toward your chest in a running motion.',
    shortDesc: 'Drive knees in from plank position',
    reps: '20-30 total',
    duration: '1 minute',
    videoUrl: 'https://www.youtube.com/watch?v=ruQ4ZwncXBg',
  },
  {
    id: 11,
    name: 'Wall Sit',
    category: 'strength',
    icon: '🪑',
    animation: 'squat-hold',
    description: 'Lean against a wall and slide down until knees are at a 90-degree angle, as if sitting in an invisible chair. Hold.',
    shortDesc: 'Hold a seated position against a wall',
    reps: '1 set',
    duration: '30-45 seconds',
    videoUrl: 'https://www.youtube.com/watch?v=cWTZ8Am1Ee0',
  },
  {
    id: 12,
    name: 'Glute Bridges',
    category: 'strength',
    icon: '🌉',
    animation: 'bridge',
    description: 'Lie on your back, knees bent, feet flat. Lift your hips toward the ceiling, squeezing your glutes. Lower back down.',
    shortDesc: 'Lift hips from a lying position',
    reps: '15-20',
    duration: '1 minute',
    videoUrl: 'https://www.youtube.com/watch?v=OUgsJ8-Vi0E',
  },
];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src/index.html'));

  // Tray icon - lives in the Windows system tray while the app runs in background
  tray = new Tray(path.join(__dirname, 'assets/icon.ico'));
  tray.setToolTip('NanoMuv - Exercise Reminder');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Dashboard', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: 'Quit NanoMuv', click: () => {
        app.isQuitting = true;
        app.quit();
      }
    },
  ]);
  tray.setContextMenu(contextMenu);

  // Double-click the tray icon to bring the dashboard back up
  tray.on('double-click', () => mainWindow.show());

  // Clicking the X button hides the window instead of quitting.
  // This is what lets NanoMuv keep reminding you in the background -
  // only the tray menu's "Quit" (or app.isQuitting) actually closes it.
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  createWindow();
  startTimer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.on('get-settings', (event) => {
  event.reply('settings-data', userSettings);
});

ipcMain.on('update-settings', (event, settings) => {
  // Keep postponeAllowed (session-only) but persist everything else
  userSettings = { ...userSettings, ...settings };
  store.set('settings', {
    interval: userSettings.interval,
    soundEnabled: userSettings.soundEnabled,
    theme: userSettings.theme,
    postponeMinutes: userSettings.postponeMinutes,
    exerciseMinutes: userSettings.exerciseMinutes,
  });

  // If a postpone isn't currently in effect, apply the new interval to the
  // running timer right away rather than waiting for the next cycle.
  if (userSettings.postponeAllowed) {
    currentCycleTargetSeconds = (userSettings.interval || 60) * 60;
    timeElapsed = Math.min(timeElapsed, currentCycleTargetSeconds);
  }

  event.reply('settings-updated', userSettings);
});

ipcMain.on('get-stats', (event) => {
  event.reply('stats-data', getDisplayStats());
});

ipcMain.on('get-exercises', (event) => {
  event.reply('exercise-data', pickNextExercise());
});

// Sends the full exercise catalog plus which ones are currently enabled,
// so the dashboard can render the checklist.
ipcMain.on('get-exercise-list', (event) => {
  event.reply('exercise-list-data', {
    exercises: exercises.map((ex) => ({
      id: ex.id,
      name: ex.name,
      icon: ex.icon,
      category: ex.category,
      shortDesc: ex.shortDesc,
      videoUrl: ex.videoUrl,
    })),
    enabledIds: enabledExerciseIds,
  });
});

ipcMain.on('update-enabled-exercises', (event, ids) => {
  // Guard against an empty list - always keep at least one exercise available
  if (Array.isArray(ids) && ids.length > 0) {
    enabledExerciseIds = ids;
    store.set('enabledExerciseIds', ids);
  }
  event.reply('enabled-exercises-updated', enabledExerciseIds);
});

// Opens citation/DOI links in the user's actual default browser instead of
// navigating this app window away from the app. Only allow http(s) links.
ipcMain.on('open-external-link', (event, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) {
    shell.openExternal(url);
  }
});

// Picks a random exercise from the user's enabled list, excluding whatever's
// been shown recently. Falls back to the full list if a filter would leave
// nothing to pick from (e.g. the user somehow ends up with 0 enabled, or
// NO_REPEAT_WINDOW is close to the enabled count).
function pickNextExercise() {
  let candidates = exercises.filter((ex) => enabledExerciseIds.includes(ex.id));
  if (candidates.length === 0) {
    candidates = exercises;
  }

  let pool = candidates.filter((ex) => !recentExerciseIds.includes(ex.id));
  if (pool.length === 0) {
    pool = candidates;
  }

  const chosen = pool[Math.floor(Math.random() * pool.length)];

  recentExerciseIds.push(chosen.id);
  if (recentExerciseIds.length > NO_REPEAT_WINDOW) {
    recentExerciseIds.shift();
  }

  return chosen;
}

ipcMain.on('postpone-reminder', (event) => {
  if (userSettings.postponeAllowed) {
    userSettings.postponeAllowed = false;
    timeElapsed = 0;
    // A postpone is a SHORT one-time delay, not the full interval again -
    // this was previously a bug: it just reset to the full interval.
    currentCycleTargetSeconds = (userSettings.postponeMinutes || 10) * 60;
    if (reminderWindow) {
      reminderWindow.close();
    }
    event.reply('postpone-accepted');
  }
});

ipcMain.on('complete-exercise', (event) => {
  if (reminderWindow) {
    reminderWindow.close();
  }
  userSettings.postponeAllowed = true;
  timeElapsed = 0;
  currentCycleTargetSeconds = (userSettings.interval || 60) * 60;

  // Update persistent stats
  const stats = store.get('stats');
  const today = getTodayString();
  const yesterday = getYesterdayString();

  if (stats.lastCompletionDate === today) {
    // Already completed one today - just bump today's count
    stats.todayCompleted += 1;
  } else if (stats.lastCompletionDate === yesterday) {
    // Continuing the streak into a new day
    stats.currentStreak += 1;
    stats.todayCompleted = 1;
    stats.lastCompletionDate = today;
  } else {
    // First ever completion, or the streak was broken
    stats.currentStreak = 1;
    stats.todayCompleted = 1;
    stats.lastCompletionDate = today;
  }
  stats.totalCompleted += 1;

  store.set('stats', stats);

  // IMPORTANT: this message must go to mainWindow, not event.reply().
  // event.reply() would send it back to the reminder window (the sender),
  // which is closing right now - the dashboard would never see the update.
  if (mainWindow) {
    mainWindow.webContents.send('exercise-completed', getDisplayStats());
  }
});

// Timer logic
function startTimer() {
  timerInterval = setInterval(() => {
    timeElapsed += 1;
    const remaining = Math.max(currentCycleTargetSeconds - timeElapsed, 0);

    // Live countdown for the dashboard - only send if it's actually open/visible,
    // no point updating a hidden window. Sends both remaining and the total
    // target so the ring displays correctly even during a shortened postpone cycle.
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.webContents.send('countdown-tick', { remaining, total: currentCycleTargetSeconds });
    }

    if (timeElapsed >= currentCycleTargetSeconds) {
      showReminder();
      timeElapsed = 0;
      currentCycleTargetSeconds = (userSettings.interval || 60) * 60; // back to normal for next cycle
    }
  }, 1000);
}

function showReminder() {
  if (reminderWindow) return;

  reminderWindow = new BrowserWindow({
    fullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
    alwaysOnTop: true,
  });

  reminderWindow.loadFile(path.join(__dirname, 'src/reminder.html'));

  reminderWindow.on('closed', () => {
    reminderWindow = null;
  });
}

// Graceful shutdown
app.on('before-quit', () => {
  if (timerInterval) clearInterval(timerInterval);
});
