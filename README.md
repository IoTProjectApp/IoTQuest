# IoT Quest: Connected World

**Play online:** https://iotprojectapp.github.io/IoTQuest/ · [![Test and deploy](https://github.com/IoTProjectApp/IoTQuest/actions/workflows/pages.yml/badge.svg)](https://github.com/IoTProjectApp/IoTQuest/actions/workflows/pages.yml)

A 3D educational RPG. Travel on a geographically mapped globe, explore regional houses and gardens, install and wire components, and use Arduino C++ or MicroPython to control simulated devices. Mission completion depends on executing the student's program against repeatable tests.

## Run and build

Requires Node.js 20 or newer. The game itself has no dependencies.

```sh
npm run dev
npm test
npm run build
npm run format   # Prettier (fetched with npx)
```

For development, run `npm install` once. It installs Playwright (a dev dependency) and turns on a pre-commit hook (`.githooks/pre-commit`) that runs the same Prettier check as CI on staged files; skip it once with `git commit --no-verify`. Browser tests drive the real game in headless Chromium to catch overlapping labels, clipped dialogs, theme contrast and reduced-motion problems that the DOM-free unit tests cannot see:

```sh
npx playwright install chromium   # once
npm run test:browser
```

Open http://127.0.0.1:5173.

Every push and pull request runs the formatting check, tests and build on Node 22 and 24, plus the browser tests in a separate job (`.github/workflows/pages.yml`). When `main` passes, `dist/client` is published to GitHub Pages. All asset paths are relative, so the same build works at a domain root or under `/IoTQuest/`. Pages has no weather proxy; after one 404 the game calls Open-Meteo directly for the rest of the session. Use `npm run dev -- 5174` for another port. Restart an existing server after changes to `scripts/`.

`public/` contains the source. The build produces static assets in `dist/client/` and a Cloudflare-compatible asset/weather Worker in `dist/server/index.js`. Serve assets over HTTP; module workers do not work from a file URL.

## Explore, install, wire, program, test

Choose a country and city using the rotating, zoomable globe or accessible 2D map. View regional inspiration, sources, weather and progress before travelling. WASD, arrows and on-screen controls move the technician; E interacts (at a room or garden installation point it installs devices) and T talks to the nearest resident. Select rooms or garden areas for detailed views. Device labels select their live circuit entries and related code. Every installed device gets its own spot in its room: on that room's floor (never through a doorway into the next), clear of furniture, away from where the resident and the technician stand, and about a metre from other devices (closer only in the smallest rooms). Adding a device never moves the others, and crowded labels fan out so each stays readable.

Install components, connect signal/power/ground and required resistors, then edit the starter program. Run, change conditions and watch outputs affect lights, fans, gates, irrigation, tanks and plants. Test checks normal conditions, thresholds and safety failures. Students write every line of code themselves, helped by the **Guide** beside the editor:

- The editor starts with no code: only the quest's title and goal as comments.
- The Guide goes step by step through the whole program. MicroPython: bring in the tools (imports), name your pins, repeat forever (`while True:`). Arduino C++: name your pins, write `setup()`, write `loop()`. Then, in both: read each sensor, write an if/else for each output, and run and test.
- Each step explains what the code does and why (GPIO pins and `const int`, `setup()` and `pinMode`, the loop and `delay`, analogue vs digital reads, variables, comparison operators at the exact threshold, AND/OR, why an `else` is needed) and shows a pattern with blanks to fill in, using the student's own wiring.
- Each step is checked as students type, and explains mistakes: a pin on the wrong GPIO, the wrong read function, a reading outside the loop. Commented-out code does not count. A decision step runs the student's program against the quest scenarios and names any scenario it gets wrong, with the readings (for example, "In At threshold (light 1800) the path lights should be OFF").
- Hints are revealed one at a time. The last hint for a decision is the condition itself, never the full if/else.
- Activities that start from finished code (Try a debugging challenge, Spot the bugs and the fault workshop) unlock only after the student has passed that quest with their own program. Changing language preserves wiring; changing controller remaps pins and reloads starters.

### Code suggestions

As students type, the editor suggests what can come next: Arduino and MicroPython functions the simulator runs (`digitalWrite`, `analogRead`, `Serial.println`, `Pin`, `ADC`, `time.sleep_ms`, the MQTT functions), keywords and constants (`OUTPUT`, `HIGH`, `Pin.OUT`), the student's own variables and functions, and the installed devices' pin names (`lightPin`, `light_sensor`). Each suggestion has a one-line explanation. After a dot it offers methods such as `led.value()` and `sensor.read()`. Inside a call, a hint shows the function's parameters with the current one highlighted.

↑/↓ choose, Enter or Tab accept, Escape closes, and Ctrl+Space opens the list on demand. Enter and Tab keep their usual meaning (new indented line, indent) when the list is closed. Suggestions complete names only and never write statements, so students still write every line. Nothing is suggested inside comments or strings. **Settings → Code suggestions** turns them off, for example for an assessment.

### Resident conversations

Every room and garden work area has a dedicated resident with requests specific to that section. Farm stations identify crop gardens, livestock shelters, farm water, workshops and stock entrances. Walking within greeting range automatically starts a conversation; closing it keeps the resident quiet until you leave the area. You can also click a character, press **T** nearby, or use the **Talk to …** button beside the world tip to talk again. At an installation point **E** installs devices rather than starting a chat. After a request is passed, its resident thanks the technician once and describes what now works. Ask typed questions or use the suggested replies to learn what the resident wants, which components to install, when outputs should start and stop, and which objects will animate. Choose another request in the conversation, then select **Start this request** to begin building it. Residents stop walking, face the technician and gesture during chat; reduced motion keeps gestures still.

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

Choose **Use live weather** in a weather quest to run your program against local readings, or use Practice Weather to explore conditions. With live weather, **Predict, then check** asks whether each output will be on with today's readings; while the program runs, **Check with my running program** compares each prediction with what the program actually did. The existing weather panel identifies cached or fallback data. Assessment always uses fixed scenarios with boundaries, interlocks and changing weather, so students never need to wait for a storm or cold night. The original eight quest indices and saved progress remain intact; with the component and logic quests below there are now 33 quests in the original home and 66 across both levels at each destination.

### Component quests

Eight more quests (18–25) together use all 26 components, including seven that no earlier quest needed: the servo, air-conditioning, ultrasonic distance sensor, motorised gate, potentiometer, pond level probe and resident presence sensor.

| Quest                          | Area         | Rule                                                                         |
| ------------------------------ | ------------ | ---------------------------------------------------------------------------- |
| Bedroom Sun Blinds             | Bedroom      | Blinds (servo) down when light > 3000                                        |
| Cool Only When Someone Is Home | Living room  | AC on when temp > 26 °C and someone is home                                  |
| Driveway Gate                  | Entrance     | Gate opens when a car is closer than 50 cm                                   |
| Mood Light Dial                | Utility room | RGB light on when the dial reads 2048 or more                                |
| Garden Water Manager           | Water tank   | Pump for dry soil and valve for a low pond, both protecting the tank reserve |
| Storm Lockdown                 | Garden path  | Gate open below 40 km/h wind; buzzer on in heavy rain                        |
| Greenhouse Climate Control     | Greenhouse   | Fan for humidity (never venting freezing air); grow lights on cloudy days    |
| Night Watch                    | Garage       | Porch light on motion; buzzer when the door opens while armed                |

Each is offered by the resident of its area and installs there. Tests check the exact boundaries, and every worked example passes on ESP32 and Pico in both languages. The air-conditioning quest has its own energy budget: the AC draws 800 W, so cooling an empty home fails the budget as well as the test. Temperatures such as 26.5 °C are tested, which is why the Guide stores calibrated readings in a `float`.

### Logic quests

Eight quests (26–33) teach logic patterns the earlier quests do not. Each is offered by the resident of its area.

| Quest                 | Area        | Pattern                            | Rule                                                        |
| --------------------- | ----------- | ---------------------------------- | ----------------------------------------------------------- |
| Comfort Zone          | Living room | Range, both ends included          | Light on from 18 °C to 24 °C                                |
| Welcome Either Way    | Entrance    | OR, two digital inputs             | Porch light on for motion or the door                       |
| Kitchen Fume Fan      | Kitchen     | OR, calibrated units               | Fan on above 60 % humidity or above 30 °C                   |
| Bathroom Night Path   | Bathroom    | AND, digital + analogue            | Light on for motion only when it is dark                    |
| Pond Overflow Warning | Water tank  | Escalating thresholds              | Drain valve above 3500, buzzer above 3900                   |
| Frost or Flood        | Plant beds  | OR, negative and inclusive bounds  | Buzzer at 0 °C or below, or rain of 3000 or more            |
| Safe Garage Door      | Garage      | Safety interlock, checking for LOW | Door opens for a car under 40 cm only when the alarm is off |
| Reading Lamp          | Bedroom     | Two analogue inputs                | Lamp on when the dial is up and the room is dim             |

The tests sit on every boundary, so typical mistakes fail the quest that teaches them: AND instead of OR, leaving out a range's end points, ignoring the alarm, or swapping the two pond thresholds.

### Quests that follow the situation

Residents react to what is happening. A quest is **needed now** when its own rule gives a different answer in the current conditions than on a calm, ordinary day (21 °C, daylight, dry, calm, nobody moving). At sunset the path, bedroom and reading lights are needed; in a storm, the storm and rain quests; in a heatwave, the cooling quests. This is worked out from each quest's conditions, so teacher quests react too. A reading must be clearly past a limit (for example 1 °C, or 100 on the 0–4095 scale) before it counts, so a reading hovering at a limit does not make a quest flicker.

- The quest panel shows **Needed now** with each resident's request and the reason (for example "🌇 It is getting dark: Maya, Light the Path"), and **All quests** tags them.
- A short alert announces each new need, including from the Day/Night switch and from the simulated day reaching evening. Arriving at a destination sets the scene quietly.
- Talking to a resident opens with their urgent request and says why.
- Choosing a needed quest keeps the current conditions (the path is still dark); other quests start from fresh practice conditions. Finished quests are not asked for again, and nothing switches the student's quest for them.

### Check your understanding

After a quest is passed, the Tests panel asks three questions built from that quest's own rule, sensors and scenarios, so every quest has them (in the language the student passed with):

- **Predict:** the output in one of the quest's scenarios, at the exact boundary where possible (for example, "At threshold: the readings are light 1800. Are the path lights ON or OFF?").
- **Read:** what the student's sensor-reading code gives the program (a 0–4095 number, °C, a percentage, centimetres, or HIGH/LOW).
- **Change:** which part of the condition to change to switch at a different reading, or, for quests without a numeric threshold, what the `else` is for.

Every answer, right or wrong, is explained; students keep trying until they get it right. A right first try earns 10 XP. Results are saved with the quest, included in progress reports, and shown in the class view.

### Day log

The **Day log** tab runs the student's program through a stylised 24-hour day (sun from 06:00 to 18:00, warmest mid-afternoon, afternoon rain in wet scenarios, resident routines for motion and occupancy) and logs every sensor and output every 10 minutes. Soil and tank levels respond to pumps and rain between readings. Students see an hourly table, download all 144 readings as CSV, and answer up to three questions that can only be answered from their own data: when an output first turned on, how long it was on in total, and the day's highest reading. Each answer is explained. The program gets the same 25 steps per reading as the mission tests, so the log shows exactly what the tests would decide.

### Connected challenges: dashboards and security

Programs can use a simulated MQTT broker (`mqttConnect`, `mqttPublish`, `mqttSubscribe`, `mqttRead`, `mqttConnected`, `mqttReconnect`). Nothing is sent online.

- **Dashboard** tab: three quests where students write the program a phone-style dashboard talks to. They publish temperature on a timer, follow a fan switch and report the fan's state back, and send a plant alert once per change instead of on every loop. While the program runs, the dashboard shows each published topic as a tile, offers the quest's switches, and lists recent messages. **Test like an attacker or a network fault** sends any number to any topic as the dashboard or as a stranger, and turns the broker off and on.
- **Fault finding → Security repairs**: four programs that work but are unsafe. A gate opens for any message (it should check the shared code). A thermometer publishes the door code on a debug topic. An irrigation valve stays open when the network drops (it should fail safe, then reconnect and resubscribe). A soil sensor floods the broker on every loop (it should publish about once a second). Each has hints and attack tests.

The game's simulator ends a step at any `delay`, but these challenge tests honour delay lengths as real hardware does, so a `delay(1000)` fix and a `millis()` timer both pass. Like the other repairs, security repairs unlock after the first quest is passed with the student's own code.

### Real board (Web Serial)

In **Live circuit → Real board**, **Download board program** generates a program for the student's installed devices: an Arduino sketch for ESP32 or `main.py` for the Pico. Sensors that need a library (temperature, humidity, distance) are left as TODOs. Once it is flashed, **Connect a real board** (Chrome or Edge on a computer) reads lines such as `IOTQ light=2310 motion=1`. Those real readings replace the simulated sensors while the student's simulated program runs. With **Send outputs to the board**, the program's outputs come back as `OUT 26=1 25=128` lines, and the board sets only its circuit's output pins. Outputs are switched off when the program stops or the board disconnects. Other browsers keep everything else working.

### Install and play offline

The game can be installed as an app (browser menu, or **Settings → Install app** when offered) and opens offline after the first visit. The build stamps the service worker (`public/sw.js`) with every file and a content version. Each deploy is stored as one complete copy, downloaded straight from the server (GitHub Pages lets browsers keep files for 10 minutes, which would otherwise mix in the previous deploy). An open page keeps using its version; when a new one has downloaded, a bar offers **A new version of IoT Quest is ready · Reload**, so a page never runs half old and half new code. Other open tabs say **IoT Quest was updated in another tab · Reload**. Browsers still running the earlier offline code are moved to the new version automatically on their next visit. If a machine ever seems stuck on an old version, **Settings → Get the latest version** (or adding `?fresh` to the address) clears the saved copy and reloads; progress is kept. Live weather still needs the network; offline, the header shows **Offline · practice weather**. The unbuilt `sw.js` served by `npm run dev` caches nothing, so development is never affected. To try offline locally, run `npm run build`, then `ROOT=dist/client npm run dev`.

### Class progress for teachers

Progress is saved in each student's browser, so students hand it in as a file:

- **Students:** Package → **Hand in your progress**. Type your name (and optionally a class code), then download the progress report (`iotquest-progress-<name>-<date>.json`) and submit it through the LMS or Teams. Nothing is sent online.
- **Teachers:** open `teacher.html` (linked from the Package tab, or `/teacher.html` on the site) and drop in the class's report files. The class view shows:
  - a grid of students × quests for each destination and level: ✓ passed, ? passed but needs review (fewer than half of the understanding questions right first time), … working on it (with the Guide step they are up to), ! needs help (3 or more test attempts or hints on a quest not yet passed), – not started, plus test attempts, hints and understanding per quest (each student's details also show how many times they talked to the quest's resident, which is also a CSV column);
  - totals: students, quests passed on average, and how many students need help;
  - a **Who needs help** list, most attempts and hints first;
  - each student's details and code when you select a cell;
  - a filter by class code, and **Download CSV** (one row per student and quest) for the gradebook.
- **Teacher quests:** in `teacher.html`, **Create a quest for your class** builds a quest from one sensor, one output and a rule (for example "turn the buzzer on when the temperature is at or below 2 °C"). The preview shows the goal and the exact tests: well below, just below, at, just above and well above the threshold. **Download quest file** saves a small JSON file to share. Students use **Quests → All quests → Import a teacher quest**, then install, wire and write the code with the Guide like any quest. Results appear in the class view under **Teacher quests**. Quest files store only the teacher's choices, and every import rebuilds and re-checks the quest, so an edited file cannot produce a broken quest.
- Reports stay in memory on the teacher's computer and are gone when the page closes. Damaged or edited files are rejected or cleaned up; if a student hands in more than once, the newest report is used. Student names in the CSV cannot run spreadsheet formulas.

### Community districts

The normal **World** view now includes the neighbourhood alongside the existing home and garden. **World overview** restores this shared view. Each playable destination now has a shared, explorable community map with connected residential, high-street, logistics and industrial blocks, rendered directly in the 3D world with moving traffic, pedestrians, signals and device effects. Click a building, its label, or an area marker to place the technician immediately at its safe workstation and open its matching Components panel in Split view. This also works while the simulation is paused. **Install & program buildings** opens the current building or the factory. The residential destination is the original regional home and garden. Room and garden controls retain their close views and existing installations. Returning to the home or the World view restores ordinary property movement; the globe and existing projects stay available. These are compact teaching layouts inspired by regional materials, roof/courtyard styles, signs and driving sides, rather than geographic replicas of each city.

The new residential block includes **Willow house**, **Courtyard house** and **Garden cottage**, with regional roof/façade styles, furnished interiors, porch lights and planted gardens. Click a home to enter its workstation and automate porch lighting, room comfort or garden watering. Talk to Avery, Samira or Leo through their resident label or **T** nearby. Shared footpaths connect the homes to shops and workplaces; daily pedestrians now start and return to the new homes as well as the original property. Residential quests are appended so existing projects and saved quest indices stay intact.

The world renderer now applies procedural grass, earth, wood grain, masonry, stone, fabric, roof and asphalt detail across the original property and new districts. Sunlight follows live/astronomical sky settings or the practice simulation clock, with warmer low sunlight and softer light under cloud. Soft ground shadows and vehicle/pedestrian contact shadows ground the scene; glass, wet roads and water have reflective highlights. Water motion uses the simulation clock and freezes on pause or reduced motion. Climate-appropriate ground extends beneath the whole neighbourhood, and asymmetric height-field foothills replace the former dome shapes. Characters have facial details. Existing collision geometry, routes and device programs are retained.

Homes now include detailed sofas, beds, wardrobes, kitchens and refrigerators. Shops have stocked display shelves, counters and glass-front refrigeration; offices have desks, computers, keyboards and chairs; warehouses have loaded steel racks and pallet jacks; factories have tool benches, raw-material storage and machine gauges. Bus-stop benches and road-service storage complete the public areas. Timber, fabric, glass, steel, concrete, ceramic and plastic use distinct material finishes. New furniture is checked against public routes, existing obstacles and the central IoT installation space. Equipment status displays respond to the installed devices' actual outputs, and upper façades follow the cutaway toggle.

The new areas use the same main **Components → Wiring → Code → Run → Test** workflow as the house, garden and farm. Selecting a building opens its installation section and normal quest, keeping its saved devices, wiring and language-specific code when revisited. Install each highlighted component, connect power/ground/resistors, choose or edit GPIOs, and write Arduino C++ or MicroPython in the existing editor. The regular Guide, Serial monitor, scenario tests, XP, badges, board switching, project saving and language-specific code apply to these quests. New quests are appended after the original quests to keep saved project indices stable.

Sections include Shop floor, Business office, Loading bay, Factory floor, Community roads and Parking area. Quests cover doors, refrigeration, comfort and energy, access alerts, loading-bay warnings, stock monitoring, safe conveyors, street lighting, signal proposals and entry barriers. Temperature and vibration are calibrated channels; light remains 0–4095. Bay/request inputs are digital and the parking channel reports the free-space count. Practice controls can override these channels to test faults and boundaries until another quest is chosen; scene readings otherwise reflect deliveries and requests.

The road mission installs separate EW, NS and WALK outputs at the GPIOs shown in Wiring. HIGH proposes that movement. The native controller validates the combined request, inserts amber/all-red and pedestrian clearance, rejects conflicting greens, and holds red for occupied crossings. Rejections appear in the main Serial debugging panel. The main editor's actual GPIO outputs drive the rendered conveyor, doors, warning lamps, street lights and parking barrier. Components are placed on reachable floor points outside walls and machinery. Inside a building the technician walks within its workstation.

The simulation uses directed lanes, shortest-path routes, curved turns, junction reservations, exit clearance checks, crossing occupancy, oriented vehicle footprints and a fixed 50 ms movement step. The same crossing interaction protects every resident. Loading yards have separate entrance and exit routes and a guarded footpath crossing. Signal intersections alternate vehicle green, amber, all-red, walk and pedestrian clearance. Outer marked crossings use a conservative pedestrian-yield policy; this is a classroom traffic simulation rather than a complete jurisdictional road-law model. Safety references: [Transport Victoria traffic lights](https://transport.vic.gov.au/road-and-active-transport/road-rules-and-safety/traffic-lights), [UK pedestrian crossing guidance](https://www.gov.uk/guidance/the-highway-code/rules-for-pedestrians-1-to-35).

Live/practice weather from the selected destination applies across the district. Rain reduces speed and braking capability. Local time selects morning workplace trips, daytime shop/bus-stop trips and evening journeys home; simulated darkness lowers the light channel, and programmed street-light modules illuminate street/building lights. Density controls set target populations; existing users finish their routes when targets decrease. Pause and 1×/4×/12× controls advance controller ticks and traffic on one community clock. The 3D world and native controller share the main simulation clock, including pause and 12× acceleration. Traffic and People sliders in the world header adjust density. The program keeps driving visible effects while the student uses other main-editor tabs or walks around.

Run `node --test tests/community.test.mjs` for crossing approach/clearance, queues, blocked exits, deliveries, both language runtimes, lane conventions, route connectivity, accelerated rain movement and a ten-minute collision/traffic-progress soak test. The implementation deliberately serializes junction traffic to preserve safety; heavy traffic and continuous pedestrian demand can produce long queues.
