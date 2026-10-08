# IoT Quest: Connected World

**Play online:** https://iotprojectapp.github.io/IoTQuest/ · [![Test and deploy](https://github.com/IoTProjectApp/IoTQuest/actions/workflows/pages.yml/badge.svg)](https://github.com/IoTProjectApp/IoTQuest/actions/workflows/pages.yml)

A dependency-free 3D educational RPG. Travel on a geographically mapped globe, explore regional houses and gardens, install and wire components, and use Arduino C++ or MicroPython to control simulated devices. Mission completion depends on executing the student's program against repeatable tests.

## Run and build

Requires Node.js 20 or newer. No dependency installation is required.

```sh
npm run dev
npm test
npm run build
npm run format   # Prettier (fetched with npx; the app itself has no dependencies)
```

Open http://127.0.0.1:5173.

Every push and pull request runs the formatting check, tests and build on Node 22 and 24 (`.github/workflows/pages.yml`). When `main` passes, `dist/client` is published to GitHub Pages. All asset paths are relative, so the same build works at a domain root or under `/IoTQuest/`. Pages has no weather proxy; after one 404 the game calls Open-Meteo directly for the rest of the session. Use `npm run dev -- 5174` for another port. Restart an existing server after changes to `scripts/`.

`public/` contains the source. The build produces static assets in `dist/client/` and a Cloudflare-compatible asset/weather Worker in `dist/server/index.js`. Serve assets over HTTP; module workers do not work from a file URL.

## Explore, install, wire, program, test

Choose a country and city using the rotating, zoomable globe or accessible 2D map. View regional inspiration, sources, weather and progress before travelling. WASD, arrows and on-screen controls move the technician; E interacts. Select rooms or garden areas for detailed views. Device labels select their live circuit entries and related code.

Install components, connect signal/power/ground and required resistors, then edit the starter program. Run, change conditions and watch outputs affect lights, fans, gates, irrigation, tanks and plants. Test checks normal conditions, thresholds and safety failures. Students write every line of code themselves, helped by the **Guide** beside the editor:

- The editor starts with no code: only the quest's title and goal as comments.
- The Guide goes step by step through the whole program. MicroPython: bring in the tools (imports), name your pins, repeat forever (`while True:`). Arduino C++: name your pins, write `setup()`, write `loop()`. Then, in both: read each sensor, write an if/else for each output, and run and test.
- Each step explains what the code does and why (GPIO pins and `const int`, `setup()` and `pinMode`, the loop and `delay`, analogue vs digital reads, variables, comparison operators at the exact threshold, AND/OR, why an `else` is needed) and shows a pattern with blanks to fill in, using the student's own wiring.
- Each step is checked as students type, and explains mistakes: a pin on the wrong GPIO, the wrong read function, a reading outside the loop. Commented-out code does not count. A decision step runs the student's program against the quest scenarios and names any scenario it gets wrong, with the readings (for example, "In At threshold (light 1800) the path lights should be OFF").
- Hints are revealed one at a time. The last hint for a decision is the condition itself, never the full if/else.
- Activities that start from finished code (Try a debugging challenge, Spot the bugs and the fault workshop) unlock only after the student has passed that quest with their own program. Changing language preserves wiring; changing controller remaps pins and reloads starters.

### Check your understanding

After a quest is passed, the Tests panel asks three questions built from that quest's own rule, sensors and scenarios, so every quest has them (in the language the student passed with):

- **Predict:** the output in one of the quest's scenarios, at the exact boundary where possible (for example, "At threshold: the readings are light 1800. Are the path lights ON or OFF?").
- **Read:** what the student's sensor-reading code gives the program (a 0–4095 number, °C, a percentage, centimetres, or HIGH/LOW).
- **Change:** which part of the condition to change to switch at a different reading, or, for quests without a numeric threshold, what the `else` is for.

Every answer, right or wrong, is explained; students keep trying until they get it right. A right first try earns 10 XP. Results are saved with the quest, included in progress reports, and shown in the class view.

### Class progress for teachers

Progress is saved in each student's browser, so students hand it in as a file:

- **Students:** Package → **Hand in your progress**. Type your name (and optionally a class code), then download the progress report (`iotquest-progress-<name>-<date>.json`) and submit it through the LMS or Teams. Nothing is sent online.
- **Teachers:** open `teacher.html` (linked from the Package tab, or `/teacher.html` on the site) and drop in the class's report files. The class view shows:
  - a grid of students × quests for each destination and level: ✓ passed, ? passed but needs review (fewer than half of the understanding questions right first time), … working on it (with the Guide step they are up to), ! needs help (3 or more test attempts or hints on a quest not yet passed), – not started, plus test attempts, hints and understanding per quest;
  - totals: students, quests passed on average, and how many students need help;
  - a **Who needs help** list, most attempts and hints first;
  - each student's details and code when you select a cell;
  - a filter by class code, and **Download CSV** (one row per student and quest) for the gradebook.
- Reports stay in memory on the teacher's computer and are gone when the page closes. Damaged or edited files are rejected or cleaned up; if a student hands in more than once, the newest report is used. Student names in the CSV cannot run spreadsheet formulas.
