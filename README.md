# ⚡ NanoMuv

A Windows desktop app that reminds you to take brief "exercise snacks" throughout your workday — short, research-backed bursts of movement scattered between long stretches at your desk.

## Why

Research on vigorous intermittent lifestyle physical activity (VILPA) and "exercise snacks" shows that brief, intense movement bouts (a minute or less) — squats, push-ups, a fast flight of stairs — are associated with meaningful improvements in blood sugar control, cardiovascular health, and even reduced mortality risk, without needing a structured workout. NanoMuv builds that idea directly into your workday.

## Features

- ⏱️ Configurable reminder interval (30 min – 3 hrs), with a live countdown ring
- 🏋️ 16 exercises across strength, cardio, and mobility, each with an animated stick-figure demo of the movement
- 🎯 Exercise filter — enable/disable individual exercises from the rotation
- 🔁 Smart rotation — won't repeat the same exercise too soon
- ⏸️ One postpone per cycle (10 min), then locked — nudges follow-through without being punishing
- 🔥 Persistent streak tracking, daily count, and all-time total
- 🌓 Dark/light theme toggle
- 📚 A "want to know more?" panel with real, DOI-linked research on the science behind exercise snacks
- 🖥️ Lives in the system tray — closing the window doesn't quit the app

## Installation

Download the latest installer from the [Releases](../../releases) page, run it, and follow the setup wizard. Windows may show a SmartScreen warning since this isn't a code-signed app — click "More info" → "Run anyway".

## Built with

- [Electron](https://www.electronjs.org/)
- [electron-store](https://github.com/sindresorhus/electron-store) for local persistence
- [electron-builder](https://www.electron.build/) for packaging

## Development

```bash
npm install
npm start        # run in dev mode
npm run dist      # build the Windows installer
```

## License

MIT
