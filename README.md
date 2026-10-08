# IoT Quest: Connected World

**Play online:** https://iotprojectapp.github.io/IoTQuest/ · [![Test and deploy](https://github.com/IoTProjectApp/IoTQuest/actions/workflows/pages.yml/badge.svg)](https://github.com/IoTProjectApp/IoTQuest/actions/workflows/pages.yml)

A 3D educational RPG. Travel on a geographically mapped globe, explore regional houses and gardens, install and wire components, and use Arduino C++ or MicroPython to control simulated devices. Mission completion depends on executing the student's program against repeatable tests.

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

### Resident conversations

Every room and garden work area has a dedicated resident with requests specific to that section. Farm stations identify crop gardens, livestock shelters, farm water, workshops and stock entrances. Walking within greeting range automatically starts a conversation; closing it keeps the resident quiet until you leave the area. You can also click a character or press **E** nearby to talk again. Ask typed questions or use the suggested replies to learn what the resident wants, which components to install, when outputs should start and stop, and which objects will animate. Choose another request in the conversation, then select **Start this request** to begin building it. Residents stop walking, face the technician and gesture during chat; reduced motion keeps gestures still.

Replies are locally authored and based on the selected quest, regional names, weather mode and relevant failed tests. No chat service or network connection is required. Conversations do not generate finished programs, award XP or complete quests; students still write and test their own code.

### Landscapes and wildlife

Plants use curved leaf blades, side stems, calyxes and fruit clusters; every part follows raised-bed height changes and the existing moisture/wilting feedback. Trees use tapered trunks, roots and branches with irregular foliage, with separate broadleaf, eucalyptus-inspired, conifer, palm-inspired and orchard forms. Detailed leaves are used nearby, while distant forests and orchards use small shared crowns. Livestock have curved bodies, eyes, muzzles, ears, hoof/paw details, contact shadows, wool, manes and feathers, plus walking-leg and tail motion. These are lightweight stylised models with more natural proportions, rather than photorealistic scans.

Every destination includes a seeded scenic landscape outside its house, street and farm paddocks: mountain ridges, foothills forming a river valley, tributaries, a lake with rocky shores, forest edges and roaming wildlife. Alpine, arid, tropical and woodland palettes give destinations different surroundings. These are stylised teaching landscapes, not surveyed terrain or exact habitat maps.

Select **Landscape** for the wider camera view; House and Garden return to the working areas. Seven birds fly overhead with flapping wings and winding flight paths, while water currents and lake ripples move below. Scenery pauses with the game and holds still with reduced motion. Wildlife stays separate from farm animals and their quests, and scenery does not change circuits, sensor readings or movement collision footprints.

### Astronomical sky

Open **Sky** or **Look at the sky** to look above the horizon. Drag to change direction and elevation; scroll to zoom. **Find the moon** centres it when above the horizon. The Night sky panel shows the destination's local date/time, lunar phase and illumination, altitude and azimuth, and visible catalogue stars.

**Real time** uses the current UTC instant at the selected destination. **Simulated time** uses the selected local date plus the game's clock, including accelerated time and date rollover. The original home uses Melbourne as its observer location. Clouds and precipitation obscure celestial objects, and astronomical twilight determines when stars become visible. The sky clock is independent of weather readings, so using practice sliders does not move the moon or stars.

Positions use a locally bundled [Astronomy Engine](https://github.com/cosinekitty/astronomy), with topocentric Sun/Moon positions, refraction and lunar illumination. The 179 stars of magnitude 3 or brighter come from [HYG v4.1](https://github.com/astronexus/HYG-Database/blob/main/hyg/README.md), with J2000 coordinates, proper motion and precession/nutation to the observation date. Ephemerides refresh each minute of the selected clock. Brightness and weather occlusion are stylised for the game; this is not a telescope simulator. Sky calculations need no runtime network requests. See `public/data/SKY-ATTRIBUTION.txt` and the bundled MIT licence for data/library attribution.

### Unique homes and farms

Every destination has its own architectural style, garden combination and interior design. Furniture arrangements, floor finishes and material palettes are derived from the destination ID, so adding destinations does not reshuffle existing interiors. Melbourne neighbours vary their building proportions and entry/window details. The four farms have different animals and working facilities: milk silos at the dairy, open sorting pens at the sheep farm, fruit crates and a packing station at the orchard, and tack racks at the horse property. Automated checks compare actual house geometry without counting colours or labels and verify safe quest installation points across every destination.

### Weather quests

Five additional quests use the destination's live local weather: **Storm Watch**, **Garden Frost Alert**, **Heat & Humidity Response**, **Rain-Smart Sprinklers**, and **Cloudy-Day Grow Lights**. Each destination has beginner and advanced versions. Wind reads km/h and cloud cover reads 0–100%; outdoor temperature and humidity retain their calibrated units. The rain sensor uses the existing simulated 0–4095 scale, derived from the weather service's precipitation data.

Choose **Use live weather** in a weather quest to run your program against local readings, or use Practice Weather to explore conditions. The existing weather panel identifies cached or fallback data. Assessment always uses fixed scenarios with boundaries, interlocks and changing weather, so students never need to wait for a storm or cold night. The original eight quest indices and saved progress remain intact; there are now 17 quests in the original home and 34 across both levels at each destination.

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
