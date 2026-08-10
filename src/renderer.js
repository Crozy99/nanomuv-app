// Main window renderer logic
let currentSettings = {
  interval: 60,
  soundEnabled: true,
  theme: 'dark',
};

let stats = {
  totalCompleted: 0,
  todayCompleted: 0,
  currentStreak: 0,
};

document.addEventListener('DOMContentLoaded', () => {
  // Load current settings
  window.electronAPI.getSettings();

  window.electronAPI.onSettingsData((data) => {
    currentSettings = data;
    document.getElementById('interval-select').value = data.interval;
    document.getElementById('sound-enabled').checked = data.soundEnabled ?? true;
    applyTheme(data.theme || 'dark');
  });

  // Load persisted stats from disk
  window.electronAPI.getStats();

  window.electronAPI.onStatsData((data) => {
    stats = data;
    updateStatsDisplay();
  });

  // Save settings button (interval + sound - theme saves instantly via its own toggle)
  document.getElementById('save-settings').addEventListener('click', () => {
    const interval = parseInt(document.getElementById('interval-select').value);
    const soundEnabled = document.getElementById('sound-enabled').checked;

    currentSettings = { ...currentSettings, interval, soundEnabled };
    window.electronAPI.updateSettings(currentSettings);

    const btn = document.getElementById('save-settings');
    const originalText = btn.textContent;
    btn.textContent = '✓ Settings saved!';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  });

  // Theme toggle - applies and saves immediately, no need to press Save
  document.getElementById('theme-checkbox').addEventListener('change', (e) => {
    const newTheme = e.target.checked ? 'light' : 'dark';
    applyTheme(newTheme);
    currentSettings = { ...currentSettings, theme: newTheme };
    window.electronAPI.updateSettings(currentSettings);
  });

  // Listen for exercise completions - main process sends back fresh stats
  window.electronAPI.onExerciseCompleted((updatedStats) => {
    stats = updatedStats;
    updateStatsDisplay();
  });

  // Live "next reminder in" countdown, pushed from main process every second.
  // Drives both the text display and the circular progress ring.
  const RING_CIRCUMFERENCE = 326.7; // 2 * PI * r(52), matches the SVG circle in index.html

  window.electronAPI.onCountdownTick((secondsRemaining) => {
    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = secondsRemaining % 60;
    document.getElementById('countdown-display').textContent =
      `${minutes}:${seconds.toString().padStart(2, '0')}`;

    const totalSeconds = (currentSettings.interval || 60) * 60;
    const fractionRemaining = totalSeconds > 0 ? secondsRemaining / totalSeconds : 0;
    const offset = RING_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, fractionRemaining)));
    document.getElementById('ring-fill').style.strokeDashoffset = offset;
  });

  // Exercise checklist - which exercises are allowed in the reminder rotation
  window.electronAPI.getExerciseList();

  window.electronAPI.onExerciseListData((data) => {
    renderExerciseChecklist(data.exercises, data.enabledIds);
  });

  // "Want to know more?" deep-dive panel with the underlying research
  const deepDiveToggle = document.getElementById('deep-dive-toggle');
  const deepDivePanel = document.getElementById('deep-dive-panel');
  deepDiveToggle.addEventListener('click', () => {
    const isExpanded = deepDivePanel.classList.toggle('expanded');
    deepDiveToggle.textContent = isExpanded ? '▲ Show less' : '📚 Want to know more?';
  });

  // DOI links open in the user's actual browser, not inside the app
  document.querySelectorAll('.doi-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.electronAPI.openExternalLink(btn.dataset.url);
    });
  });
});

function applyTheme(theme) {
  document.body.classList.toggle('light-theme', theme === 'light');
  document.getElementById('theme-checkbox').checked = theme === 'light';
}

function updateStatsDisplay() {
  document.getElementById('reminders-count').textContent = stats.todayCompleted;
  document.getElementById('streak-count').textContent = stats.currentStreak;
  document.getElementById('total-count').textContent = stats.totalCompleted;
}

function renderExerciseChecklist(exercises, enabledIds) {
  const container = document.getElementById('exercise-checklist');
  container.innerHTML = '';

  exercises.forEach((ex) => {
    const row = document.createElement('label');
    row.className = 'exercise-check-row';
    row.innerHTML = `
      <input type="checkbox" class="exercise-checkbox" data-id="${ex.id}" ${enabledIds.includes(ex.id) ? 'checked' : ''}>
      <span class="exercise-check-icon">${ex.icon}</span>
      <div class="exercise-check-text">
        <span class="exercise-check-name">${ex.name}</span>
        <span class="exercise-check-desc">${ex.shortDesc || ''}</span>
      </div>
      <span class="exercise-check-dot dot-${ex.category}"></span>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('.exercise-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', handleExerciseCheckboxChange);
  });
}

function handleExerciseCheckboxChange(e) {
  const container = document.getElementById('exercise-checklist');
  const checked = Array.from(container.querySelectorAll('.exercise-checkbox:checked'))
    .map((cb) => parseInt(cb.dataset.id));

  const warning = document.getElementById('filter-warning');

  if (checked.length === 0) {
    // Don't allow zero exercises selected - revert this change
    e.target.checked = true;
    warning.classList.add('visible');
    setTimeout(() => warning.classList.remove('visible'), 2000);
    return;
  }

  window.electronAPI.updateEnabledExercises(checked);
}
