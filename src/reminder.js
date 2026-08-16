// Reminder window renderer logic
let TOTAL_SECONDS = 300; // default 5 minutes - overwritten once real settings arrive
let timeRemaining = TOTAL_SECONDS;
let postponeAllowed = true;
let timerInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  // Apply the same theme the user picked on the dashboard, and use their
  // configured exercise-window length. Countdown only starts once this
  // arrives, so it never briefly runs with the wrong duration.
  window.electronAPI.getSettings();
  window.electronAPI.onSettingsData((data) => {
    document.body.classList.toggle('light-theme', data.theme === 'light');
    TOTAL_SECONDS = (data.exerciseMinutes || 5) * 60;
    timeRemaining = TOTAL_SECONDS;
    startCountdown();

    const postponeMins = data.postponeMinutes || 10;
    document.getElementById('btn-postpone').textContent = `⏱ Postpone ${postponeMins}min`;
  });

  // Request exercise data
  window.electronAPI.getExercises();

  // Receive exercise data
  window.electronAPI.onExerciseData((exercise) => {
    displayExercise(exercise);
  });

  // Button handlers
  document.getElementById('btn-complete').addEventListener('click', () => {
    clearInterval(timerInterval);
    showSuccessThenClose();
  });

  document.getElementById('btn-postpone').addEventListener('click', () => {
    if (postponeAllowed) {
      postponeAllowed = false;
      document.getElementById('btn-postpone').disabled = true;
      document.getElementById('btn-postpone').textContent = 'Already used today';
      window.electronAPI.postponeReminder();
      setTimeout(() => {
        window.close();
      }, 1000);
    }
  });

  // Video demo link - only visible when this exercise has one (set in displayExercise)
  document.getElementById('video-link').addEventListener('click', (e) => {
    const url = e.currentTarget.dataset.url;
    if (url) window.electronAPI.openExternalLink(url);
  });

  // Play notification sound (optional - comment out if no sound)
  playNotificationSound();
});

const ANIMATION_CLASSES = [
  'anim-squat', 'anim-squat-hold', 'anim-pushup', 'anim-jump', 'anim-march',
  'anim-march-fast', 'anim-plank', 'anim-mountain-climbers', 'anim-lunge', 'anim-burpee', 'anim-bridge',
];

function displayExercise(exercise) {
  document.getElementById('exercise-name').textContent = exercise.name;
  document.getElementById('exercise-description').textContent = exercise.description;
  document.getElementById('exercise-reps').textContent = exercise.reps;
  document.getElementById('exercise-duration').textContent = exercise.duration;

  const categoryEl = document.getElementById('exercise-category');
  categoryEl.textContent = exercise.category;
  categoryEl.className = 'exercise-category category-' + exercise.category;

  // Show the video demo button only if this exercise has a link
  const videoBtn = document.getElementById('video-link');
  if (exercise.videoUrl) {
    videoBtn.style.display = 'flex';
    videoBtn.dataset.url = exercise.videoUrl;
  } else {
    videoBtn.style.display = 'none';
    videoBtn.dataset.url = '';
  }

  // Swap the stick-figure animation to match this exercise's movement pattern
  const stage = document.getElementById('figure-stage');
  stage.classList.remove(...ANIMATION_CLASSES);
  stage.classList.add('anim-' + (exercise.animation || 'march'));
}

function startCountdown() {
  timerInterval = setInterval(() => {
    timeRemaining--;
    updateTimerDisplay();

    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      // Auto-close after 5 minutes if user doesn't interact
      showSuccessThenClose();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  document.getElementById('timer-display').textContent = 
    `${minutes}:${seconds.toString().padStart(2, '0')}`;

  // Visual progress bar - fills as time passes, shifts color as it runs low
  const elapsed = TOTAL_SECONDS - timeRemaining;
  const percent = Math.min((elapsed / TOTAL_SECONDS) * 100, 100);
  const fill = document.getElementById('progress-fill');
  fill.style.width = percent + '%';

  if (timeRemaining <= 30) {
    fill.style.background = '#f87171'; // red - almost done
  } else if (timeRemaining <= 120) {
    fill.style.background = '#fbbf24'; // amber - getting there
  }
}

// Shows a brief checkmark celebration, then tells the main process
// the exercise is complete (which closes this window).
function showSuccessThenClose() {
  document.getElementById('reminder-content').style.display = 'none';
  document.getElementById('success-overlay').classList.add('visible');
  setTimeout(() => {
    window.electronAPI.completeExercise();
  }, 700);
}

function playNotificationSound() {
  // Using Web Audio API to create a simple beep
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 800;
  oscillator.type = 'sine';

  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);
}
