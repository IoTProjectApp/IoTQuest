# IoT Quest Editor

A desktop tool for working on the game's content by hand. It is **for development only**: it is never built, tested in CI or deployed, and the game does not need it to run. What it saves goes into ordinary files in the repository, which are committed and deployed like any other change.

```sh
./scripts/world-editor.sh
```

The script checks for Node.js 20 or newer, installs the game's development packages if they are missing, and on first run installs Electron into `editor/node_modules`. Electron is kept out of the game's `package.json`, so CI and the game never download it.

## Workspaces

The editor is a set of **workspaces**. A workspace is a screen for one job, such as placing objects in the 3D world. The editor opens on a home page with a card for each workspace. Click a card to open that workspace, and use the back arrow at the top left to return.

| Workspace           | What it does                                                                                                                                       | Writes                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Map Editor          | Move, add and remove furniture, garden features and town buildings in the 3D world, city by city.                                                  | `public/data/world-layout.js`                                             |
| Street Editor       | Lay out the town's roads: junctions, roads, traffic lights, stop signs and crossings, then watch the traffic run.                                  | `public/data/street-layout.js`                                            |
| Character Editor    | Dress the game's people and set how they move: who plays them, their clothes, their walk, stance and activity, and how fast.                       | `public/data/characters.js`                                               |
| Quest Editor        | Write new quests: who asks and where, the devices to wire, the rules and the tests, each checked against a worked solution on both boards.         | `public/data/quests.js`                                                   |
| Conversation Editor | Write what the game's people say, for everyone or one person in one city, and how each resident asks for their quests; try each chat as you write. | `public/data/conversations.js` (and `public/data/quests.js` for requests) |

Each workspace:

- lives in its own folder, `editor/workspaces/<id>/`, with an `index.html` page and its own scripts and styles;
- is listed in `editor/ui/workspaces.js`, which the home page reads to draw the cards;
- uses the shared look in `editor/ui/shell.css` (colours, buttons, fields and the top bar), the shared panels in `editor/ui/workspace.css` (tool rail, stage, inspector, hints, toasts) and the icons in `editor/ui/icons.js`;
- names the files it changes on its card, so it is always clear what a workspace touches.

### Adding a workspace

1. Create `editor/workspaces/<id>/index.html`. Link `/editor/ui/shell.css` and `/editor/ui/workspace.css`, and start the page with the shared top bar: a back link to `/editor/ui/`, then the workspace's name. The Map Editor's `index.html` shows the pattern.
2. Add an entry to `WORKSPACES` in `editor/ui/workspaces.js`: `id` (the folder name), `name`, a one-sentence `summary`, an `icon` from `editor/ui/icons.js`, and `writes`, the file or folder it changes.
3. If it saves a file, add it to `STORES` in `editor/main.mjs`: its path and a check of what it must contain. The page then reads and writes it with `editorShell.read(name)` and `editorShell.write(name, value)`. Pages have no Node access of their own, and the shell writes only the files listed there. Write only the files the card names.
4. Keep logic that does not need the page (data, rules, undo history) in modules free of the DOM, so it can be tested under Node from `tests/`, like `tests/map-editor.test.mjs`.
5. Add the workspace to the table above.

### How the shell serves pages

`editor/main.mjs` runs a small HTTP server on a random local port, reachable only from this machine. It serves files at the same paths as in the repository:

- `/public/…` for the game's own modules;
- `/editor/ui/…` for the home page and shared files;
- `/editor/workspaces/…` for the workspaces;
- `/editor/three/…` for the three.js add-ons the editor needs, taken from `node_modules/three/examples/jsm` (by short name, such as `OrbitControls.js`, or by path, such as `loaders/FBXLoader.js`) and pointed at the game's vendored copy.

So a workspace imports the game's code with ordinary relative paths (`../../../public/regions.js`), and the same imports work in Node tests. Nothing is cached, so a reload always shows the files as they are on disk. Editor pages may run only their own scripts (a Content Security Policy is set).

## Map Editor

The game builds its world in code (`public/world-model.js`, `public/regions.js`, `public/community-world.js` and others), so each city's house, garden and town come from rules, not from a hand-made map. The Map Editor lets you correct that world by hand. Your changes are saved per city, and the game applies them every time it builds that city.

### Layout

- **Top bar:** the city to edit; **House**, **Garden** and **Town** to jump the camera; undo and redo; whether everything is saved; **Play-test**; and **Save**.
- **Tools** on the left:
  - **Select** (`V`) picks an object and shows a gizmo. **Move** (`G`) has arrows to drag along and squares to drag across a plane. **Turn** (`R`) turns the object about the vertical axis. **Resize** (`S`) shows handles on the object's box: drag a square on a side or on top to stretch it that way (the opposite side stays put), or drag the round one on a top corner, or hold Shift, to resize it evenly. **Snap** keeps moves to 10 cm steps, turns to 15° steps and sizes to 5 cm steps.
  - **Object** (`O`) opens the catalogue along the bottom, with tabs for Furniture, Garden, Buildings and Street, plus a search box. Click an item, then click in the world to place it. `R` turns it while placing, Shift-click places several, and `Esc` stops.
  - **Delete** (`X`) removes whatever you click.
  - **Camera** (`C`) only moves the view, so you cannot change anything by accident.
- **Inspector** on the right:
  - When an object is selected, it shows the object's name, its id and whether it is as built, changed or added. You can type an exact position, turn, and width, height and depth in metres. **Focus**, **Duplicate**, **Reset** (back to how the code builds it) and **Delete** act on the object.
  - When nothing is selected, it lists every change in the city. Click a change to go to that object, or use its arrow to undo just that change.
- **Camera:** drag to orbit, right-drag to pan, scroll to zoom, and press `F` to focus on the selection.

Undo and redo (`⌘Z`, `⇧⌘Z`) cover every change, and each city keeps its own history while the editor is open. **Save** (`⌘S`) writes all cities at once. **Play-test** (`⌘P`) opens the game in a fresh window (no saved progress or offline copy), where you can travel to the city and see the result. The game reads saved changes only, so Play-test offers to save first.

Some objects carry a caution in the inspector:

- **Quest areas** (the greenhouse, raised beds, tank and pump): their quest devices are placed by the original layout, so keep them near where they were.
- **Town lots**: the town's people, cars and paths still use the lot's original place.
- **Bus stops**: buses still stop at the original place.

### What can be edited

Everything is edited as whole objects (an edit group). For example, moving a sofa moves its cushions, legs, shadow and collision box together.

| Category  | Examples                                                                                                     | Ids                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Furniture | Each piece of house furniture, each town furnishing (desks, shelves, equipment)                              | `furniture/sofa#1`, `town/furniture/office:desk0`     |
| Garden    | Trees, beds, tank, pump, greenhouse, lanterns, fence sections, gate, paths, hedges, each city's own features | `garden/tree#4`, `garden/fence#12`, `garden/fountain` |
| Buildings | Each town lot with what stands on it: shops, residences, the school, the park                                | `town/shop`, `town/residence3`                        |
| Street    | Street lights and bus stops                                                                                  | `town/street-light#7`, `town/bus-stop#2`              |
| Added     | Copies placed from the catalogue                                                                             | `added/1`                                             |

Not editable here: the house's own walls, floors and roof (planned), the landscape beyond the property, and moving people and vehicles. Roads, junctions and traffic signals are edited in the **Street Editor**.

### The saved layout

`public/data/world-layout.js` holds only what was changed, per city (`legacy` is the starting home):

```js
export default {
  "version": 1,
  "locations": {
    "kyoto": {
      "edits": {
        "furniture/sofa#1": {"pos": [-9.07, 0.23, -3.5], "turn": 1.5708, "scale": 1},
        "furniture/dining-table#1": {"pos": [-5.98, 0.23, -2.5], "turn": 0, "scale": [1.145, 1, 1]},
        "furniture/car#1": {"removed": true}
      },
      "added": [
        {"id": "added/1", "name": "Tree", "kind": "garden/tree", "pos": [5, 0, 8], "turn": 0, "scale": 1, "parts": [...], "colliders": [...]}
      ]
    }
  }
};
```

- `pos` is where the object's base centre goes: the middle of its footprint, at its lowest point, in metres. y is up.
- `turn` is a turn about the vertical axis, in radians.
- `scale` is the object's size: one factor (`1.25`) when it is resized evenly, or three (`[1.2, 1, 0.8]`) when it is stretched, for its width, height and depth along its own sides before it is turned.
- Added objects carry their own parts, measured from their base centre, so they do not depend on the object they were copied from.

With an empty file the game builds every world exactly as before; a test (`tests/world-layout.test.mjs`) checks that. When the game builds a city (`buildWorldModel` in `public/world3d.js`), `applyWorldLayout` in `public/world-layout.js` applies its changes.

If a change names an object the code no longer builds (because the world's code changed since it was saved), the game skips it and lists it in `model.layoutWarnings`. The editor marks it **Missing** in the change list, and a test fails if the committed layout names such an object.

### For code that builds the world: edit groups

The world's builders mark what belongs together with `tag(id)` (from `createWorldModel`, also available as `model.tag`):

```js
tag('garden/tree#'); // every mesh and collider made from here on belongs to this group…
buildTree(...);
tag(); // …until the next tag
```

An id ending in `#` is numbered in build order (`garden/tree#1`, `garden/tree#2`, …), so keep that order stable. **Changing an existing group's id, or the order of numbered groups, detaches saved edits from their object.** The test above will tell you if a committed edit no longer finds its object. House furniture is tagged per piece in `house-objects.js`. Town lots, furnishings and bus stops are grouped in `tagTownGroups` in `community-world.js`. New builders should tag what a person would want to move as one thing, and leave untagged what should stay put.

## Street Editor

The town's roads used to be a fixed grid in the code: six junctions across and five rows down, 48 m apart. They are now a layout (`public/street-network.js`). The simulation works out lanes, pavements, crossings and turns from that layout, so when you change the roads, the cars, buses and pedestrians follow.

### Layout

- **Top bar:**
  - **Layout** picks what you edit: the **shared town**, which every city uses, or **one city's own layout**. A city's own layout starts as a copy of the shared town. Cities with their own layout are marked ●.
  - **Preview as** sets which city's driving side and names the traffic and 3D preview use.
  - **Plan / 3D** switches between editing from above and seeing the town as the game draws it.
  - **Run traffic** runs the real simulation on your layout, in the plan, at twice real time.
- **Tools** on the left:
  - **Select** (`V`): click a junction or road, and drag junctions to move them. Their roads follow.
  - **Road** (`R`): click a junction, a road or open ground to start, then click again to end. It keeps drawing from where you ended until `Esc`. Ending on a road or open ground adds a junction there.
  - **Junction** (`J`): click a road to put a junction on it.
  - **Crossing** (`C`): click beside a junction to add or remove the zebra crossing over that road.
  - **Delete** (`X`): click a junction or road to remove it.
  - **Pan** (`H`): drag to move around. Holding `Space` does the same with any tool.
- **Inspector:**
  - For a junction: its position, its **control** and its roads. The controls are **Automatic** (signals where three or more roads meet, as before), **Signals**, **Stop**, **Give way** and **Uncontrolled**.
  - For a road: its length and its bus stops.
  - With nothing selected: the layout's numbers, its **problems**, and **Back to the grid** (or **Back to shared** for a city).
- **Snap** keeps junctions on whole metres and lines them up with other junctions, showing a guide line. Scroll zooms, right-drag pans and `F` fits the town in view.

### Problems

The editor checks the layout as you work and rings each problem on the plan. **Red problems stop you saving**, because the game could not run that layout. Amber ones are warnings.

- **Errors:**
  - a road running through a building's lot
  - roads that cross without a junction
  - a road shorter than 28 m
  - roads meeting at less than 40°
  - a dead end (cars cannot turn round)
  - junctions cut off from the rest
  - a building people cannot walk to
- **Warnings:**
  - bus stops that disappeared with their road
  - more than four roads at signals (signals have two phases, so some arms share a green)

### What stays put

Some junctions and roads are locked, because other parts of the game are built around them. The editor shows a padlock and the reason.

- **`1:1`:** students' traffic-light programs run its signals, and the road-control station stands beside it.
- **`1:2`, `2:2` and the road between them:** the loading yard joins there.
- **`0:1`, `0:2` and the road between them:** the farms' driveway joins there.
- **`3:0`, `3:1`, `3:2` and the roads between them:** the police and fire stations' driveways open onto that street.

### The saved layout

`public/data/street-layout.js`:

```js
export default {
  "version": 1,
  "town": null,                     // the shared town: null means the original grid
  "locations": {                    // a city's own layout, when it has one
    "kyoto": {
      "junctions": [{"id": "0:-1", "x": -48, "z": -96}, ..., {"id": "n1", "x": 250, "z": 70, "control": "stop"}],
      "roads": [{"a": "0:-1", "b": "1:-1"}, ..., {"a": "5:2", "b": "n1"}]
    }
  }
};
```

- **Positions** are metres in the town's own coordinates: x is east, z is south.
- **Junction ids:** the grid's junctions keep their ids (`ix:iz`), and junctions you add are `n1`, `n2`, ….
- **`control`** is `signals`, `stop`, `giveway` or `none`. Leave it out for the automatic choice.
- **`closedCrossings`** lists the neighbouring junctions whose road has no zebra crossing at this one.
- **Cities without a layout of their own** use `town`. A layout the same as what it would inherit is not saved, so the file stays empty until something really changes.

With the file empty, the town is built exactly as before: same lanes, crossings, signals and drawing (`tests/street-network.test.mjs`). Signals pair each junction's arms by which are most nearly opposite. On the grid that is east–west against north–south, so students' `trafficEW` and `trafficNS` programs keep working.

## Character Editor

The game's people are rigged, motion-captured characters (Mixamo models in `public/models/people`). Code decides who plays each person, what they wear and which clips they play. The Character Editor lets you change any of that, for one person or for everyone at once.

### Layout

- **People** on the left: everyone the game draws, grouped as Technician, Household, Town residents, Workers, Passengers & parents, Sport & leisure, and Judo class, with the model that plays each. A dot marks people with settings of their own. **Everyone (defaults)** at the top applies to all people without a setting of their own. Search filters the list, and `↑`/`↓` step through it.
- **Stage** in the middle: the chosen person drawn by the game's own character renderer, so they look exactly as in the game.
  - **Standing** (`1`) plays their idle or activity.
  - **Walking** (`2`) walks them round a circle at their speed.
  - `Space` pauses. Drag to turn round them, and scroll to zoom.
- **Inspector** on the right:
  - **Model:** which of the characters plays them.
  - **Clothes:** top and bottom colours, stripes, a hi-vis vest and its lettering, a cap or hard hat, a backpack and a badge. Each piece can be as built, none (taken off) or your choice.
  - **Movement:** their walk, their standing clip, an activity played on the spot instead of both (or **None** to take away one the code gives them), walking speed, and clip speed.
  - **Imported clips:** animations brought in from files (see [Importing clips](#importing-clips)).
  - Every row has its own reset arrow, and each section and the whole person can be reset too.

Changes show on the stage at once. Undo and redo (`⌘Z`, `⇧⌘Z`) cover every change. **Save** (`⌘S`) writes them all, and **Play-test** opens the game.

### What stays as built

- **The judo class's moves:** its routine is timed to its clips. You can recast and dress the class, but not change its clips.
- **Walking speed:** it applies to the household, town residents and workers, who walk about on their own. Players, swimmers, passengers and gym-goers are moved by what they are doing, so only their clip speed changes. The technician walks as fast as you steer them.
- **Unconverted clips:** a clip the settings name but this machine has not converted leaves its person standing (Idle) rather than stopping the game.

### The saved settings

`public/data/characters.js`:

```js
export default {
  version: 1,
  defaults: { rate: 0.9 },
  people: {
    player: { outfit: { hat: null, top: '#2a5bd7' } },
    'recreation:pool': { model: 'Kate' },
    Maya: { walk: 'Walking', speed: 1.2 },
    'bus:0:1>1:1:0': { activity: 'AirSquat' },
  },
};
```

- **The keys:** `model`, `outfit` (pieces as in `public/character-outfits.js`, with `null` taking a piece off), `walk`, `idle`, `activity` (`false` for none), `speed` and `rate`.
- **Order:** a person's own settings come before `defaults`, and both before what the code picks.
- **Ids** are the game's own: `player` is the technician, and others look like `Maya`, `worker:shop-floor:0` or `bus:0:1>1:1:2`.
- **An empty file** leaves everyone as the code makes them, which `tests/character-settings.test.mjs` checks. `public/character-settings.js` applies the settings.

### Importing clips

**Import clip…** (in the inspector's **Imported clips** section) brings in an animation from a `.glb`, `.gltf` (with its data inside it) or `.fbx` file, such as a Mixamo download.

1. Pick the file. Its first animation is fitted to the game's skeleton by bone name (`mixamorig:Hips`, `mixamorig1:Hips` and plain `Hips` all find `mixamorigHips`). A clip in metres is scaled to the game's centimetres. A clip none of whose bones match is refused; bones the clip does not move hold their pose, and the panel says how many match.
2. Choose **On the spot** (it plays where the person stands, as an idle or activity) or **A walk**. A walk must travel (download Mixamo walks with _In Place_ off): the editor measures how far one cycle goes, its stride, so feet keep pace when the game moves the person. Either way the travel is taken out of the clip, as with the game's own clips.
3. It plays on whoever is picked. Name it (letters and digits, starting with a capital, not a name already taken) and click **Add to the game**.

The clip is saved, with nothing but a bare skeleton, as `public/models/people/clip-<Name>.glb`, and listed in `public/data/clips.js`. It can then be picked as anyone's walk, standing clip or activity. The bin button removes it (its file too); anyone set to play it goes back to as built.

```js
export default {
  version: 1,
  clips: {
    Waving: { file: 'clip-Waving.glb', duration: 2.4 },
    Strut: { file: 'clip-Strut.glb', duration: 1.1, stride: 1.3 },
  },
};
```

- **The game** (`public/character-clips.js`) adds each valid entry to its clips, and the renderer loads each file after the game's own clips. With the file empty the game is exactly as before (`tests/character-clips.test.mjs`).
- **Publishing a clip:** `public/models/` is not committed, because Mixamo's terms keep their files out of this public repository. Commit `public/data/clips.js` here, and add the clip's `.glb` to the private models repository (`IoTProjectApp/iotquest-models`, folder `people/`), then update `COMMIT` in `scripts/fetch-models.mjs`. Until a clip's file is there, anyone set to play it stands in the Idle clip instead.

## Quest Editor

A quest is a request from someone in the game: wire some sensors and outputs, and program when each output turns on. The Quest Editor writes new quests and changes the built-in ones.

### Layout

- **The list** on the left: **Your quests**, each with a dot (green when ready, red with problems), then the built-in quests. Search filters both.
- **The quest:**
  - **Story:** title, who asks and their role, where it happens, what they say, the goal, XP, badge, what students learn, and a hint.
  - **Devices:** sensors and outputs to install, with the pins the game gives them on the ESP32 and the Pico.
  - **Rules:** for each output, when it turns on. These are conditions on the sensors' readings (in the program's units, for example a light sensor reads 0–4095), joined by **and** or **or**. An output with no condition stays off.
  - **Tests:** readings to try and whether each output should be **ON** or **OFF**. A test the rules disagree with is shaded red.
    - **Results from the rules** sets every test's results from the rules.
    - **Suggest tests** adds a test either side of each threshold.
- **The check** on the right, run again after every change. It shows whether the quest is **Ready to play**, or what to fix; how the worked solution does on each board and language; its code; and the Guide's steps.

### Changing built-in quests

Pick a built-in quest to change it in place:

- **Rule quests:** their story, devices, rules and tests.
- **Timed quests,** which play out over time with sequences of their own: their story only.

Changed quests are marked in the list. **Reset to original** puts a quest back, and **Copy as a new quest** makes a separate quest of your own instead. A changed quest is checked exactly like a new one before it can be saved. If you change a threshold, the check also warns when the goal, hint or the resident's words still give the old number.

What the game does on top of your changes:

- **Local titles:** each city gives the first eight quests a local title of its own, so a new title for one of those shows only where none is set.
- **Advanced versions:** some quests have an Advanced version with rules of its own. If you change a quest's devices, rules or tests, yours apply at both levels.
- **Every city:** changes apply wherever the quest is played.

### The check

Saving needs every one of your quests to pass, so a saved quest can always be played:

- it builds: devices exist, there is one rule per output, the rules read only chosen sensors, and every test sets real readings and gives each output on or off;
- its title is its own;
- its wiring is valid on the ESP32 and the Raspberry Pi Pico;
- the worked solution made from its rules passes every test, and the automatic tests at each threshold, on both boards in both Arduino C++ and MicroPython;
- a program that does nothing fails (some test needs an output on).

Warnings, which don't stop saving, point out an output never tested both on and off, or a resident with no words of their own.

### The saved quests

`public/data/quests.js` holds the author's choices; `public/authored-quests.js` describes the format, rebuilds each quest and checks it again when the game loads.

```js
export default {
  version: 1,
  quests: [
    {
      id: 'night-light',
      title: 'Night light',
      area: 'Bedroom',
      resident: 'Nina',
      role: 'Resident',
      quote: "It's so dark when I get up at night.",
      goal: 'Turn the lamp on when it is dark.',
      ids: ['ldr', 'led'],
      conditions: ['light < 1800'],
      scenarios: [
        ['Day', { light: 73.26 }, [0]],
        ['Night', { light: 9.77 }, [1]],
      ],
      xp: 100,
      badge: '',
      learn: ['thresholds'],
      hint: '',
    },
  ],
};
```

- **Changes to built-in quests** go in `edits`, keyed by the quest's place in the game's list, with only the fields that differ, and `of` naming the quest's own title: `"edits": {"builtin:0": {"of": "Light the Path", "title": "Light the Garden Path", "conditions": ["light < 2000"], "scenarios": [...]}}`. If the code moves or renames that quest, the change is left out (with a warning) rather than landing on another quest. A change that would make the quest unplayable is left out too.
- **Test readings** are stored as the game stores them, with light-type sensors as levels 0–100 that a program reads as level × 40.95. The editor shows and takes program readings.
- **Your quests come after the built-in quests,** in the file's order. The game remembers progress by a quest's place in that list, so adding quests never disturbs saved games. Deleting one of your quests moves the ones after it up, and the editor warns you.
- **A quest that fails to build in the game** is left out with a warning, rather than stopping the game.
- **CI checks your quests too:** they join the game's list, so the existing tests (`tests/simulation.test.mjs` and others) run their worked solutions on every board and language, along with `tests/quest-editor.test.mjs`.

## Conversation Editor

Everything a resident says in a chat is put together from a few lines (a greeting, thanks, what to ask about next…) and their quest's own words. The Conversation Editor writes those lines for everyone, or for one person, everywhere or in one city, and changes how each resident asks for their quests.

### Layout

- **Top bar:** back to workspaces, **Where** (Home or a city: cities give the household their own names, and open requests with "Here in …"), undo and redo, save state, **Play-test** and **Save**.
- **Left, the people:** **Everyone** (the lines anyone without their own says), then everyone a quest names, with how many requests they make. A blue dot marks someone with lines of their own, a red one someone whose lines have problems.
- **Middle, the chat:** a chat with them, made by the game's own conversation code from your unsaved lines, at the moment you pick: **First visit**, **After a pass** (their first request has just passed) or **Urgent** (the conditions make a request urgent). Click the suggested questions, type your own, or pick another of their requests. **Start over** clears it.
- **Right, their lines:** one box per line, showing faintly what they say when the box is blank. The `{name}` buttons under each box put a placeholder in. In a city, **Everywhere / Only in …** picks whether the lines are theirs everywhere or only there. **What they ask for** lists their requests, each with its opening words; a changed one can be reset.

Typing changes the chat straight away; undo takes back a whole edit to one box.

### The lines

| Line              | When it is said                                                                   | Placeholders             |
| ----------------- | --------------------------------------------------------------------------------- | ------------------------ |
| Greeting          | How they open a chat                                                              | `{name}` `{city}`        |
| Looks after       | After the greeting, when you visit a room they look after                         | and `{area}`             |
| Urgent            | First, when the conditions make a request urgent                                  | and `{reason}`           |
| Invitation        | After what they ask for                                                           | and `{title}`            |
| Nothing to ask    | How they open a chat with no requests                                             | `{name}` `{city}`        |
| Thanks            | When a request has passed, with what it now does                                  | and `{title}` `{effect}` |
| Thanks, plain     | When a request with nothing to watch has passed                                   | and `{title}`            |
| Next              | Between their thanks and their next request                                       | `{name}` `{city}`        |
| No requests reply | Their answer to any question when they have nothing to ask                        | `{name}` `{city}`        |
| About me          | Their answer to "Tell me about yourself"; with none, that question is not offered | `{name}` `{city}`        |

`{name}` is what the city calls them and `{city}` is the city's name ("town" at home). The answers to the suggested questions (components, animation, weather, help) are worked out from each quest and are not lines.

### The check

A line that uses a placeholder it cannot fill, has `<` or `>`, is longer than 240 characters or is blank (except About me) stops saving, as does an empty request. Lines for someone no quest names are allowed with a warning: they are said only if that person talks.

### The saved lines

`public/data/conversations.js` holds them; `public/conversation-settings.js` describes the format and reads them in the game.

```js
export default {
  version: 1,
  defaults: { greeting: 'Hi there!' },
  people: {
    Maya: { about: 'I have kept this garden for twenty years.' },
    'Maya@kyoto': { greeting: 'Konnichiwa! I am {name}.' },
  },
};
```

- **People are named as their quests name them** (Maya, Ms Chen), so the household's lines follow them to every city, whatever it calls them. `'Maya@kyoto'` lines apply in that city only.
- **Order:** a person's city lines, then their own, then everyone's, then the game's. Only lines that differ are kept.
- **Requests are quest changes:** changing what someone asks for saves the quest's `quote` in `public/data/quests.js` (`edits`), exactly as the Quest Editor would, so both editors show it.
- **With the file empty, everyone says what they always said**, word for word (`tests/conversation-editor.test.mjs` checks this along with the format).
