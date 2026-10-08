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

Each destination has eight mission families with beginner and advanced versions, including climate-specific irrigation, ventilation, frost, rain or storage challenges. Missions unlock destinations and upgrades; free exploration opens every destination. The original home and its saved projects remain available.

## Destinations and architecture

These are regional teaching adaptations with contemporary utility spaces, not historic reconstructions or representations of every house in a country. The location panels provide educational descriptions and researched reference links. Reusable procedural geometry supplies different roofs, courtyards, materials, planting and layouts.

| Country        | Weather location         | Architectural inspiration                     |
| -------------- | ------------------------ | --------------------------------------------- |
| Japan          | Kyoto                    | Kyoto machiya-inspired timber home            |
| Morocco        | Marrakech                | Marrakech riad-inspired courtyard home        |
| Australia      | Brisbane                 | Brisbane Queenslander-inspired veranda home   |
| Kenya          | Lamu                     | Swahili coastal courtyard house               |
| Ghana          | Bolgatanga               | Northern Ghana compound-inspired home         |
| South Africa   | Stellenbosch             | Cape Dutch-inspired kitchen-garden home       |
| Ethiopia       | Hawassa                  | Sidama-region tukul-inspired circular home    |
| Egypt          | Aswan                    | Nubian-inspired shaded courtyard home         |
| India          | Chendamangalam           | Kerala nalukettu-inspired courtyard home      |
| India          | Mandawa                  | Shekhawati haveli-inspired shaded home        |
| India          | Shimla                   | Kath-kuni-inspired timber-and-stone home      |
| China          | Beijing                  | Siheyuan-inspired courtyard home              |
| Indonesia      | Yogyakarta               | Javanese joglo-inspired timber home           |
| Vietnam        | Hue                      | Thuy Bieu garden-house-inspired rural home    |
| Türkiye        | Safranbolu               | Ottoman-inspired timber-frame home            |
| Saudi Arabia   | Diriyah                  | Najdi-inspired earthen courtyard home         |
| Italy          | Pontremoli               | Lunigiana stone-farmhouse-inspired home       |
| Spain          | Córdoba                  | Andalusian patio-inspired courtyard home      |
| United Kingdom | Falmouth                 | Cornish cottage-inspired garden home          |
| Peru           | Cusco                    | Andean adobe-inspired terraced-garden home    |
| Mexico         | Mérida                   | Yucatecan courtyard-inspired garden home      |
| Brazil         | Paraty                   | Paraty coastal-house-inspired tropical home   |
| New Zealand    | Auckland                 | Auckland timber-cottage-inspired mixed garden |
| Norway         | Bergen                   | Bergen timber-house-inspired seasonal garden  |
| Australia      | Melbourne · Fitzroy      | Victorian terrace with cast-iron lace veranda |
| Australia      | Melbourne · Brunswick    | Federation red-brick villa                    |
| Australia      | Melbourne · Footscray    | Weatherboard workers' cottage                 |
| Australia      | Melbourne · Richmond     | Contemporary infill townhouse                 |
| Australia      | Melbourne · Box Hill     | Post-war cream-brick home                     |
| Australia      | Melbourne · St Kilda     | Interwar Art Deco home                        |
| Australia      | Melbourne · Broadmeadows | Post-war weatherboard family home             |
| Australia      | Melbourne · Frankston    | Bayside weatherboard beach house              |

The eight Melbourne suburbs share one "Melbourne · 8 suburbs" marker on the globe and appear under Australia as a Melbourne suburbs group. Choosing one opens a schematic map of Melbourne over the globe (Port Phillip Bay, the Yarra and Maribyrnong rivers, the CBD and a pin per suburb at its real coordinates); pins can be chosen by mouse or keyboard, and "World globe" returns to the globe. Each suburb has its own live weather and is open from the start. Choosing a suburb opens its street view: the real streets (main roads named), every building footprint and the IoT home at the centre, about 500 m in each direction; the Melbourne / streets switch moves between the city map and the suburb. Street and building data © OpenStreetMap contributors (ODbL), bundled in `public/data/melbourne/` by `node scripts/fetch-osm.mjs`, so the game never contacts OpenStreetMap while playing.

In the 3D world, each Melbourne suburb sits on a real street: a footpath, nature strip and kerb along the front, an asphalt road with a centre line, street trees and street lights that switch on at night, and neighbouring houses in the suburb's own style across the road and on either side (attached rows in Fitzroy and Richmond). Neighbours' windows glow at night, and the sky sits further out so clouds never sit among the houses.

## Weather and simulation clock

Live Weather retrieves Open-Meteo modelled current conditions for the selected city's coordinates. The header identifies the city, timezone/local time, temperature, humidity, precipitation, wind, day/night, source and update time. These measurements are distinct from simulated indoor temperature, soil moisture, pond and tank readings.

The Node server and built Worker provide a fixed-location, keyless weather proxy with a 15-minute cache, request coalescing and failure cooldown. Static previews can call the public Open-Meteo endpoint directly. Browser responses are cached too. Retrieval failure shows a labelled simulated fallback and connection explanation. Retry live weather is available on the globe and in the location panel. Recovery checks run every minute; successful responses remain cached for 15 minutes. Direct API recovery uses its own timeout and never bypasses explicit access/rate-limit responses. Provider Retry-After limits are respected. No API secrets are embedded.

Rain, sunlight, wind and temperature gradually affect the environment. The 3D world shows the weather too: live cloud cover sets how many clouds are in the sky, day/night follows the city's real sun, precipitation sets how many raindrops fall and wind slants them, and the live weather type adds lightning for thunderstorms, haze for fog, and drifting snowflakes with a light ground covering for snow (snow also falls when it rains at or below 1 °C). Practice Weather has no weather type, so it uses the same rain, wind and temperature rules without those extras. Practice Weather offers editable conditions and repeatable heatwave, storm, drought, frost and heavy-rain scenarios. Pause and 1×, 4×, 60× and 360× speeds use the same simulated clock for code, environment, routines and consumption. At 360× a full day takes about four minutes. High-speed day scenarios are explicitly Practice Weather, never a prediction of future live weather. The simulation uses fixed 200 ms substeps with worker backpressure.

## Learning tools

- **Fault workshop:** isolated projects with disconnected ground, wrong GPIO, stuck sensor and reversed comparison. Inspect readings, repair, and pass real tests. Hints explain the repair.
- **Spot the bugs:** from the Tests panel or the Fault workshop, the current mission's worked example comes back with three bugs planted on different lines: a wrong pin, a reversed comparison, wrong threshold or swapped and/or, a wrong output command, or a wrong pin mode. Each bug is chosen only if the mission tests catch it on its own. Flag lines (click a line number or use Flag line), then Check to see what you found, what you missed and why. Then fix the code and pass the real tests to earn 40 XP once per mission and language. Code checks and Explain are paused while spotting; New bugs generates a different set. Hunts are isolated workshop projects and do not count as quests.
- **Explain code:** the editor's Explain button adds plain-English `» ` comments above setup, readings, conditions and output commands, naming the wired devices (for example `// » If light is below 1800 (darker), run the block below`). Press it again to remove them; your own comments are kept, and lines you already commented are left alone. Comments do not change behaviour, so test results are kept.
- **Code checks:** while you type, the editor compares the program with the installed wiring. Wavy underlines and a line marker flag pins that are not wired (suggesting the matching component), writes to sensors, reads from outputs, outputs written without `pinMode(pin, OUTPUT)`, and comparisons a sensor can never satisfy, such as `light > 5000` or a °C temperature compared with raw ADC counts. Dotted underlines are tips: analogue reads of digital sensors and MicroPython pins created without `Pin.OUT`. The check for the caret's line is shown under the editor; the status-bar count opens the full list, and F8 jumps to the next one. Checks are advisory and never block Run.
- **Serial plotter:** below the code editor. Analogue readings get their own lane and scale, digital inputs and outputs show as on/off bars (PWM as brightness), and numeric `Serial.println`/`print` lines are plotted using the Arduino Serial Plotter format (`label:value` pairs separated by spaces or commas). Dashed lines mark thresholds found in the code (`light < 1800`, including named constants). Choose a time window, pause, hide series from the legend, hover for values, or download CSV. At accelerated speeds each update is condensed to 12 evenly spaced samples.
- **Live circuit:** assigned pins, sampled analogue/digital inputs, HIGH/LOW and PWM outputs, missing connections, conflicts and faulty probes. Unsampled values are identified.
- **Resources:** estimated electricity/water totals, history, device contributions and mission test budgets. Consumption follows executed actuator states and available water.
- **Debugger:** pause actual execution, inspect variables and step statements/branch decisions. User-function calls are atomic steps. Errors include source lines. Resume finishes the pending tick without counting time twice.
- **Upgrades:** sunlight-dependent solar, capacity-limited batteries, rainwater storage, sampled weather station and an additional controller.
- **Resident routines:** simulated daily movement, doors, occupancy, motion and kitchen appliance activity affect sensors and consumption.
- **Networking lab:** two actual interpreted controller programs exchange scalar messages through a local simulated MQTT broker. Topics, delivery and connection loss/reconnection are visible; this is not a connection to an external broker.
- **Teacher dashboard:** explicitly a local demonstration. Assign difficulty/scenarios and download code, wiring, test, resource and debugging evidence; no accounts or shared storage.
- **Cooperative roles:** explicitly local Installer/Programmer/Tester mode with edit ownership. No remote multiplayer synchronisation is implemented.

Advanced tools appear on demand so beginner missions remain approachable.

## Execution and supported code

`runtime.js` parses code into an AST and interprets it in `sim-worker.js`. No `eval`, `Function`, keyword-based success or predetermined output animation is used. Mission tests use the same interpreter. Each tick has a 20,000-operation budget, source is limited to 30,000 characters and recursion to 30 calls. A worker watchdog handles stalled live execution. Student programs cannot access host objects, arbitrary network APIs or files.

Both subsets support scalar numbers/booleans/strings, arithmetic, comparisons, logic, variables, assignments, if/else, while, functions and returns. Integer-typed C variables truncate and wrap like 32-bit integers, and `/` between integers truncates. Python supports `//`, floored `%` and `global`; top-level code after the main `while True:` loop is unreachable. Arduino uses `setup()` and `loop()`; Python supports `elif` and four-space blocks. Arrays/collections, classes, pointers, for loops, preprocessing and arbitrary libraries are unsupported and produce errors.

Arduino APIs include `pinMode`, digital/analogue read/write, virtual pin-based `ledcWrite`, `servoWrite`, `millis`, `delay` and Serial output. MicroPython supports the documented `machine` Pin/ADC/PWM and `time` imports, pin value/on/off, ADC read/read_u16, PWM duty/duty_u16/freq, ticks_ms/sleep/sleep_ms and print. Scalar helpers include abs/min/max/int. The networking lab documents its virtual MQTT helpers and Python `iotquest` import.

**A delay or sleep suspends the program until the next tick, then resumes on the following statement; its argument does not set the simulated wait length.** Use `millis()` or `time.ticks_ms()` with elapsed-time comparisons for accurate non-blocking timing. This is an educational subset, not a full firmware runtime.

## Hardware and resource assumptions

Light, soil, rain, level and potentiometer channels use virtual 0–4095 readings (0–65520 through read_u16). Temperature/humidity are calibrated teaching channels and distance is in centimetres. Digital sensors represent contacts, buttons, occupancy and motion. Real temperature/distance modules need suitable libraries and physical connections.

ESP32 inputs 34–39 cannot drive outputs; flash pins 6–11 are unavailable. Supported ADC pins are 32, 33, 34, 35, 36 and 39. Pico exposes GPIO 0–28 with ADC on 26–28. Wiring validation checks capabilities, conflicts and missing connections. LEDs require a 220 Ω series resistor and LDRs a 10 kΩ divider. Simulated actuator modules include drivers; physical motors must use rated external power and appropriate drivers/protection, not direct GPIO.

The teaching model uses a 100 L tank, pump flow 1.1 L/s, valve flow 0.4 L/s, controller 1 W, LED 3 W, porch light 5 W, fan 15 W, AC 800 W, pump 25 W and valve 3 W. Appliance use adds 120 W. PWM scales estimated electrical power. Water draw is bounded by supply. Rain storage doubles tank capacity; solar peaks at 50 W scaled by simulated sunlight; battery capacity is 100 Wh. The exported assumptions include other actuator ratings. These estimates and the gradual single-zone thermal/soil model are not engineering predictions.

## Saved progress and export

The existing `iotquest-v1` localStorage key is retained. Legacy projects, regional projects, each language's code, wiring, XP, completion, character settings and lab evidence are preserved. Rewards are awarded once; editing a solution requires retesting. Storage errors are visible. History and telemetry retain the latest 240 samples; serial/MQTT logs are bounded.

Project export downloads a ZIP containing the selected source, SVG wiring diagram, pin CSV, components, mission results, debugging/test/resource evidence, simulation assumptions, setup instructions and hardware notes. It reflects the installed wiring and selected controller. Virtual calibrated sensors, PWM/servo helpers, weather and MQTT APIs require adaptation before physical use. The export identifies 3.3 V logic, resistors and actuator-driver requirements; it does not claim plug-and-play firmware compatibility.

## Importing projects

Import project… (Settings, or the Export tab) opens an exported ZIP, including one re-compressed or placed in a folder by an operating system. Exports now include a machine-readable `project.json`; older exports are recovered from their source, `components.json`, pin table and mission results (the mission is matched by title and opens at beginner difficulty). A preview shows the technician, mission, destination, controller, components, exported test results, and any wiring problems before anything changes.

Every field is validated: components are rebuilt from the built-in catalogue (only pins and wiring state come from the file), code is limited to 30,000 characters, ZIPs to 4 MB and 64 files, checksums must match, and encrypted or ZIP64 archives are refused. Importing never grants badges or XP. Existing work on the same mission is kept as a backup in the Teacher dashboard, the import is recorded in the project's evidence, and a pass achieved with unedited imported code is shown as "Passed · imported code".

## Unique homes and Victorian farms

Every destination has its own property: a seeded combination of mirrored layout, greenhouse (glasshouse, polytunnel or lean-to), bed edging (timber, stone or corten), water tank (poly, corrugated steel or timber), fence (post-and-rail, picket, stone wall or hedge), path (gravel, brick, slate or sandstone), garden feature (birdbath, swing, fire pit, bench or sculpture), tree layout and climate foliage. No two destinations share a combination (checked by the tests), and the original Willowbrook home keeps its original look. Mission areas stay in the same places, so quests work everywhere. Mirrored homes are drawn through a left-right flip after the view transform, with movement keys and the minimap matching the screen.

Four Victorian farms are grouped under Australia and on the globe: a Gippsland dairy farm (Warragul) with cows, a milking shed, a windmill and a dam; a Western District sheep farm (Hamilton) with a flock, a kelpie, a shearing shed and a windmill trough; a Yarra Valley orchard (Healesville) with apple rows, a hen house, chickens and ducks on the dam; and a Macedon Ranges horse property (Woodend) with horses, goats, stables and a round yard. Each farm has post-and-wire paddocks around the property, its own homestead, farm-themed quests and live weather. Animals wander, graze and stay inside their paddocks; windmills turn with the wind; both hold still with reduced motion.

Each farm also has a signature quest whose circuit the animals respond to:

| Farm                 | Quest                  | Circuit                                                                           | What the animals do                                                                        |
| -------------------- | ---------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Yarra Valley orchard | Hen-House Door at Dusk | Light sensor opens the motorised door; advanced adds a doorway motion sensor (OR) | Hens go in to roost at dusk through an open door, or wait outside a shut one               |
| Western District     | Fill the Stock Trough  | Pond probe as the trough level drives the bore pump; advanced adds a tank reserve | The flock drinks the trough down; thirsty sheep crowd an empty trough; the pump refills it |
| Gippsland dairy      | Open the Dairy Gate    | Motion sensor opens the gate; advanced adds a milking-time switch (AND)           | Cows walk through the open gates to the milking shed and return when they close            |
| Macedon Ranges       | Cool the Horses        | Temperature above 30°C opens the misting valve; advanced adds a tank reserve      | Horses shelter on hot days; misting sprinklers run and cool the paddock                    |

## Day and night

The ☀ Daytime / ☾ Nighttime button above the 3D world switches between day and night: it sets the simulated light level (85 % or 4 %) and moves the simulated clock to 12:00 or 22:00, so path-light quests can be checked instantly. At a destination with live weather it first switches to Practice Weather; on the accelerated daily cycle the clock jump makes the cycle continue from noon or night. The 3D world follows the light level: a sky-blue sky with the sun by day; a navy sky with the moon, twinkling stars, darker clouds and warmly lit windows at night. The sun, moon, stars and clouds sit beyond the far edge of the property from wherever the camera looks. Weather works with the night sky: cloud cover hides the stars first and then dims the moon (which has a soft glow and craters on clear nights), rain hides the stars and catches the light so it stays visible after dark, and storms (heavy rain with strong wind or near-total cloud) flash with lightning that briefly lights the scene and the clouds. Lightning follows real time, so it does not speed up with the simulation clock, and it is off with reduced motion.

## Layout

On screens at least 1100 × 640 px, each screen fits the window: headings use one line, long panels (workbench, quest column, destination details) scroll inside themselves, and the page itself does not scroll. Split / World / Code in the adventure heading shares the column or enlarges the 3D world or the workbench. In Split, the 3D world gets 60% of the height by default; drag the handle between the world and the workbench (or focus it and use the arrow keys, Home and End) to resize, and double-click it to reset; the choice is saved, and opening a workbench tab from World view returns to Split. Smaller screens and phones keep the flowing layout. The layout rules live in `public/layout.css`.

## Accessibility and verification

Use the sun/moon button in the header to switch Light/Dark appearance, or choose System default in Settings. Appearance is saved with existing progress and follows device changes in System mode. Theme changes do not affect weather, simulation daylight or running code.

The code editor highlights keywords, types, Arduino/MicroPython built-ins, constants, functions, strings and comments, marks the caret line, matching brackets and the line of the last runtime error. Format (Shift+Alt+F) re-indents (2 spaces for C++, 4 for Python) and normalises spacing; it only changes whitespace and refuses to guess at inconsistent Python indentation. Tab and Shift+Tab indent and outdent; press Escape, then Tab, to move focus out. Settings includes a confirmed Reset local progress action, and saved data with an unexpected shape falls back to defaults field by field.

The app includes keyboard/touch movement, labelled controls, focus indicators, reduced motion, optional sound and a 2D globe alternative. WebGL is required for playable 3D environments. Meshes and country boundaries are local assets; optional fonts have system fallbacks. Country geography is derived from Natural Earth boundaries.

The automated suite checks mission solutions and incorrect programs in both languages/controllers, wiring faults, persistence, all destination variants, weather coordinates/cache/proxy, clock/debugger consistency, resource bounds, project ZIP contents, MQTT and renderer state. Editor checks exercise the production simulation worker in a separate execution context, including edited code, serial output, errors, recovery, stepping and both controllers/languages. Application tests use a DOM harness; renderer tests use a WebGL test double. Passing these checks does **not** establish actual browser/GPU visual validation. A connected browser session is still needed for visual and touch playtesting.
