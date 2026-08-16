// Main window renderer logic
const INTERVAL_PRESETS = [30, 60, 90, 120];

let currentSettings = {
  interval: 60,
  soundEnabled: true,
  theme: 'dark',
  postponeMinutes: 10,
  exerciseMinutes: 5,
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
    setIntervalControls(data.interval);
    document.getElementById('sound-enabled').checked = data.soundEnabled ?? true;
    document.getElementById('postpone-minutes').value = data.postponeMinutes ?? 10;
    document.getElementById('exercise-minutes').value = data.exerciseMinutes ?? 5;
    applyTheme(data.theme || 'dark');
  });

  // Load persisted stats from disk
  window.electronAPI.getStats();

  window.electronAPI.onStatsData((data) => {
    stats = data;
    updateStatsDisplay();
  });

  // Show/hide the custom minutes field based on dropdown selection
  document.getElementById('interval-select').addEventListener('change', (e) => {
    const customInput = document.getElementById('interval-custom');
    if (e.target.value === 'custom') {
      customInput.classList.add('visible');
      customInput.focus();
    } else {
      customInput.classList.remove('visible');
    }
  });

  // Save settings button (theme saves instantly via its own toggle, everything else here)
  document.getElementById('save-settings').addEventListener('click', () => {
    const intervalSelectValue = document.getElementById('interval-select').value;
    const interval = intervalSelectValue === 'custom'
      ? clampMinutes(document.getElementById('interval-custom').value, 1, 720, 60)
      : parseInt(intervalSelectValue);
    const soundEnabled = document.getElementById('sound-enabled').checked;
    const postponeMinutes = clampMinutes(document.getElementById('postpone-minutes').value, 1, 60, 10);
    const exerciseMinutes = clampMinutes(document.getElementById('exercise-minutes').value, 1, 30, 5);

    // Reflect any clamping back into the inputs immediately
    if (intervalSelectValue === 'custom') {
      document.getElementById('interval-custom').value = interval;
    }
    document.getElementById('postpone-minutes').value = postponeMinutes;
    document.getElementById('exercise-minutes').value = exerciseMinutes;

    currentSettings = { ...currentSettings, interval, soundEnabled, postponeMinutes, exerciseMinutes };
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
  // Drives both the text display and the circular progress ring. The main
  // process sends both remaining and total now, since total can temporarily
  // shrink during a postpone - using currentSettings.interval alone would
  // make the ring show the wrong fraction during that shortened cycle.
  const RING_CIRCUMFERENCE = 326.7; // 2 * PI * r(52), matches the SVG circle in index.html

  window.electronAPI.onCountdownTick(({ remaining, total }) => {
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    document.getElementById('countdown-display').textContent =
      `${minutes}:${seconds.toString().padStart(2, '0')}`;

    const fractionRemaining = total > 0 ? remaining / total : 0;
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

  // Any element with a data-url attribute opens in the user's actual browser,
  // not inside the app - covers both DOI citation links and the support/donate links.
  document.querySelectorAll('[data-url]').forEach((el) => {
    el.addEventListener('click', () => {
      window.electronAPI.openExternalLink(el.dataset.url);
    });
  });
});

// Keeps custom minute inputs sane - whole numbers within [min, max], falls
// back to a default if the field is empty or not a number.
function clampMinutes(rawValue, min, max, fallback) {
  const n = parseInt(rawValue, 10);
  if (isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function applyTheme(theme) {
  document.body.classList.toggle('light-theme', theme === 'light');
  document.getElementById('theme-checkbox').checked = theme === 'light';
}

// Sets the interval dropdown to the matching preset, or to "Custom" with the
// custom field populated and visible if the stored value isn't one of the presets.
function setIntervalControls(intervalMinutes) {
  const select = document.getElementById('interval-select');
  const customInput = document.getElementById('interval-custom');

  if (INTERVAL_PRESETS.includes(intervalMinutes)) {
    select.value = intervalMinutes;
    customInput.classList.remove('visible');
  } else {
    select.value = 'custom';
    customInput.value = intervalMinutes;
    customInput.classList.add('visible');
  }
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
    const row = document.createElement('div');
    row.className = 'exercise-check-row';
    row.innerHTML = `
      <label class="exercise-check-label">
        <input type="checkbox" class="exercise-checkbox" data-id="${ex.id}" ${enabledIds.includes(ex.id) ? 'checked' : ''}>
        <span class="exercise-check-icon">${ex.icon}</span>
        <div class="exercise-check-text">
          <span class="exercise-check-name">${ex.name}</span>
          <span class="exercise-check-desc">${ex.shortDesc || ''}</span>
        </div>
      </label>
      ${ex.videoUrl ? `<button type="button" class="checklist-video-link" data-url="${ex.videoUrl}" title="Watch a demo video">▶</button>` : ''}
      <span class="exercise-check-dot dot-${ex.category}"></span>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('.exercise-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', handleExerciseCheckboxChange);
  });

  // Video buttons live outside the <label> now, so they're independent -
  // clicking one can never also toggle the checkbox.
  container.querySelectorAll('.checklist-video-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.electronAPI.openExternalLink(btn.dataset.url);
    });
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
