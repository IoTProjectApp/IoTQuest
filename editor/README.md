# IoT Quest Editor

A desktop tool for working on the game's content by hand. It is **for development only**: it is never built, tested in CI or deployed, and the game does not need it to run. What it saves goes into ordinary files in the repository, which are committed and deployed like any other change.

```sh
./scripts/world-editor.sh
```

The script checks for Node.js 20 or newer, installs the game's development packages if they are missing, and on first run installs Electron into `editor/node_modules`. Electron is kept out of the game's `package.json`, so CI and the game never download it.

## Workspaces

The editor is a set of **workspaces**. A workspace is a screen for one job, such as placing objects in the 3D world. The editor opens on a home page with a card for each workspace. Click a card to open that workspace, and use the back arrow at the top left to return.

| Workspace           | What it does                                                                                                                                                     | Writes                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Map Editor          | Move, add and remove furniture, garden features and town buildings in the 3D world, city by city.                                                                | `public/data/world-layout.js`                                             |
| Street Editor       | Lay out the town's roads: junctions, roads, traffic lights, stop signs and crossings, then watch the traffic run.                                                | `public/data/street-layout.js`                                            |
| Character Editor    | Dress the game's people and set how they move: who plays them, their clothes, their walk, stance and activity, and how fast.                                     | `public/data/characters.js`                                               |
| Quest Editor        | Write new quests: who asks and where, the devices to wire, the rules and the tests, each checked against a worked solution on both boards.                       | `public/data/quests.js`                                                   |
| Conversation Editor | Write what the game's people say, for everyone or one person in one city, and how each resident asks for their quests; try each chat as you write.               | `public/data/conversations.js` (and `public/data/quests.js` for requests) |
| City Editor         | Word each city: what it calls the household, how residents open their requests, and the home quests' titles and requests there.                                  | `public/data/cities.js`                                                   |
| World Builder       | Create, sculpt, build, furnish, wire and explore complete 3D environments for IoT learning missions with terrain, modular buildings, roads and live simulations. | `public/data/worlds.js`                                                   |

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

### Play from here

**Play-test** (`⌘P`) in any workspace saves first if it needs to, then opens the game in a new window straight at what you are editing:

| Workspace           | The game opens                                                                   |
| ------------------- | -------------------------------------------------------------------------------- |
| Map Editor          | in the city being edited, standing by the selected object (if one is selected)   |
| Street Editor       | in the city being edited (or the one previewed for the shared town), in the town |
| Character Editor    | at the original home, standing beside the selected person                        |
| Quest Editor        | with the selected quest started (built-in or yours)                              |
| Conversation Editor | in the chosen city, in a chat with the selected person                           |

**Play-test from the beginning** (`⇧⌘P`, or Shift-click **Play-test**) opens the game on its globe, as a new player sees it. Locked destinations open anyway.

The shell adds the target to the game's address (`game.html?editor-play={…}`, read by `public/editor-play.js`, which drops anything the game cannot use). With that parameter present, the game starts fresh: it neither reads nor saves progress, and its header says "Editor play-test · progress is not saved". The play-test window also uses a fresh, in-memory browser session each time, so nothing from it outlives the window. Someone out of sight cannot be walked up to; Maya, Alex and Sam still chat, as they do when they call the technician over.

## Map Editor

The game builds its world in code (`public/world-model.js`, `public/regions.js`, `public/community-world.js` and others), so each city's house, garden and town come from rules, not from a hand-made map. The Map Editor lets you correct that world by hand. Your changes are saved per city, and the game applies them every time it builds that city.

### Layout

- **Top bar:** the city to edit; **House**, **Garden** and **Town** to jump the camera; undo and redo; whether everything is saved; **Play-test**; and **Save**.
- **Tools** on the left:
  - **Select** (`V`) picks an object and shows a gizmo. **Move** (`G`) has arrows to drag along and squares to drag across a plane. **Turn** (`R`) turns the object about the vertical axis. **Resize** (`S`) shows handles on the object's box: drag a square on a side or on top to stretch it that way (the opposite side stays put), or drag the round one on a top corner, or hold Shift, to resize it evenly. **Snap** keeps moves to 10 cm steps, turns to 15° steps and sizes to 5 cm steps.
  - **Object** (`O`) opens the catalogue along the bottom, with tabs for Furniture, Garden, Buildings and Street, plus a search box. Click an item, then click in the world to place it. `R` turns it while placing, Shift-click places several, and `Esc` stops.
  - **Delete** (`X`) removes whatever you click.
  - **House** (`H`) edits the house itself: its walls, doorways and room floors (see below).
  - **Camera** (`C`) only moves the view, so you cannot change anything by accident.
- **Inspector** on the right:
  - When an object is selected, it shows the object's name, its id and whether it is as built, changed or added. You can type an exact position, turn, and width, height and depth in metres. **Focus**, **Duplicate**, **Reset** (back to how the code builds it) and **Delete** act on the object.
  - When nothing is selected, it lists every change in the city. Click a change to go to that object, or use its arrow to undo just that change.
- **Camera:** drag to orbit, right-drag to pan, scroll to zoom, and press `F` to focus on the selection.

Undo and redo (`⌘Z`, `⇧⌘Z`) cover every change, and each city keeps its own history while the editor is open. **Save** (`⌘S`) writes all cities at once. **Play-test** (`⌘P`) opens the game in a fresh window (no saved progress or offline copy) in the city, by the selected object (see [Play from here](#play-from-here)). The game reads saved changes only, so Play-test offers to save first.

Some objects carry a caution in the inspector:

- **Quest areas** (the greenhouse, raised beds, tank and pump): their quest devices are placed by the original layout, so keep them near where they were.
- **Town lots**: the town's people, cars and paths still use the lot's original place.
- **Bus stops**: buses still stop at the original place.

### What can be edited

Everything is edited as whole objects (an edit group). For example, moving a sofa moves its cushions, legs, shadow and collision box together.

| Category  | Examples                                                                                                                                                                                      | Ids                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Furniture | Each piece of house furniture, each town furnishing (desks, shelves, equipment)                                                                                                               | `furniture/sofa#1`, `town/furniture/office:desk0`     |
| Garden    | Trees, beds, tank, pump, greenhouse, lanterns, fence sections, gate, paths, hedges, each city's own features, the trees on the hills, farm fences, feed stations, troughs and the pond garden | `garden/tree#4`, `landscape/tree#3`, `farm/fence#2`   |
| Buildings | Each town lot with everything that stands on it: its walls, signs, trim and paving, its fences and lawn                                                                                       | `town/shop`, `town/residence3`                        |
| Street    | Street lights, bus stops, street trees and the odd detail standing between lots                                                                                                               | `town/street-light#7`, `town/tree#2`, `town/detail#4` |
| Added     | Copies placed from the catalogue                                                                                                                                                              | `added/1`                                             |

**Every part of the world can be clicked.** What can move is an object; what stays put is shown with a lock and the reason, and where it is changed instead:

| Stays put                    | Why, and where it changes                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| Roads, junctions, crossings  | Laid out in the **Street Editor** (a button opens it), so traffic and walkers follow them |
| Traffic lights, stop lines   | Follow each junction's control, set in the **Street Editor**                              |
| The house's walls and floors | Changed with the **House** tool (a button opens it)                                       |
| House trim                   | Each city's house style built onto the walls (beams, boards, posts, a raised floor)       |
| The driveway                 | Runs from the garage to the street, so the car can still drive in                         |
| Hills, the river, the lake   | Part of the land: shaped, not moved                                                       |
| The roof                     | Covers the house as built; the **Roofs** toggle hides it                                  |

Where a movable object and a locked part are both under the cursor, the object is picked (a tree on a hillside is the tree), and a click on open ground or a room floor still clears the selection. People, animals and vehicles are moved by the game and are not edited here.

### The House tool: walls and rooms

The house is a grid of six rooms: wall **lines** run across it (left, left inner, right inner and right; back, middle and front), and each wall stands on one line, from one line to another. Click a wall or a room's floor in the world, or pick one from the lists in the inspector.

- **Move a wall:** drag the arrow on a selected wall, or type its position. Moving a wall moves every wall on its line (the middle wall's three stretches move together), stretches the walls that end on it, and resizes the rooms either side, floors included. A room's doorways keep their place in the room. A room's inspector shows its four walls, so typing there resizes the room.
- **The outer walls stay put** (shown with a lock): the roof, the garden and the town are built around them.
- **Height and colour** of each wall, and the **colour** of each room's floor.
- **Doorways:** each wall lists its doorways by their middle along the wall and their width. Add one (it goes in the middle of the longest solid stretch), change one, or close one.

Each change is checked before it is made, and a change that fails is not made (the toast says why):

- every room stays at least 2.5 m each way;
- each room's quest spot (where its devices go and its resident stands) stays inside the room;
- every room can still be walked into from outside through doorways;
- walls are 0.3–2.5 m high, doorways 0.8–4 m wide, inside their wall and not overlapping.

Furniture, windows and the household stay where they are: if a moved wall now runs through something, the inspector names it so you can move it with **Select**. Some cities rebuild part of the house in their own style (court houses, round houses): there the walls cannot move, but the walls they keep can change height, colour and doorways, and a city with no grid walls shows none.

#### New walls

**Draw a wall** (in the House tool's list) and drag across the ground from one end to the other: inside to split a room, or out in the garden as a garden wall or fence. With **Snap** on, ends snap to the 5 cm grid and to the ends of other walls, and a wall that is nearly square to the house is made square; hold **Shift** for 15° steps. A new wall is selected straight away:

- **Drag a blue end** to stretch or swing it, or **the arrow** to slide it. Its doorways and windows stay where they are as an end moves.
- **Ends** can be typed in metres; **height** (0.2–4 m), **thickness** (0.05–1 m) and **colour** too.
- **Doorways and windows:** add either (each goes in the middle of the longest solid stretch), move or resize them by their middle and width, or close them. A doorway is a gap the full height; a window leaves a sill below and, on a tall wall, a lintel above, with glass between, and needs a wall at least 1.2 m high.
- **Delete** removes it (or the button in its inspector); every change undoes.

New walls get colliders, so people walk round them. Each change is checked first, and refused with the reason if:

- a size or an opening is out of range, or two openings overlap;
- it crosses a road or the driveway;
- it stands on a quest spot (where a room's or garden area's devices and resident go);
- it would leave any room or garden area of the home that could be reached before unreachable from the garden (a flood fill round the house's walls and the new ones, with a person's width either side).

Furniture a new wall runs through is named in a note, but allowed.

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
      ],
      "house": {
        "lines": {"divider-left": -7.6},
        "walls": {"back": {"height": 1.8, "color": "#d9c7a8", "openings": [{"at": -6, "width": 1.2}]}},
        "rooms": {"Kitchen": {"color": "#c9b79a"}}
      },
      "walls": [
        {"id": "wall/1", "from": [-12, 6], "to": [-6, 6], "height": 2.2,
         "openings": [{"at": 3, "width": 1.2, "kind": "window"}]}
      ]
    }
  }
};
```

- `pos` is where the object's base centre goes: the middle of its footprint, at its lowest point, in metres. y is up.
- `turn` is a turn about the vertical axis, in radians.
- `scale` is the object's size: one factor (`1.25`) when it is resized evenly, or three (`[1.2, 1, 0.8]`) when it is stretched, for its width, height and depth along its own sides before it is turned.
- Added objects carry their own parts, measured from their base centre, so they do not depend on the object they were copied from.
- `house` holds changes to the house itself (`public/house-shell.js` describes them): where inner wall lines stand (`lines`, in metres on x or z), each wall's `height`, `color` and `openings` (doorways, by their middle and width), and each room floor's `color`. Only what differs is kept. The house is changed before objects are placed, so furniture stands where it was saved. If the house changes have a problem in a city (its code changed, say), the game leaves all of them out and lists why in `model.layoutWarnings`.
- `walls` are new walls (`public/added-walls.js` describes them): each runs straight `from` one place `to` another (`[x, z]` in metres), with `height`, `thickness` and `color` when they differ from 1.1 m, 0.18 m and `#eadbbf`, and `openings` by their middle along the wall from `from`, their width and their `kind` (`door` or `window`). They are built after the house's own changes; if any has a problem, all are left out and listed in `model.layoutWarnings`.

With an empty file the game builds every world exactly as before; a test (`tests/world-layout.test.mjs`) checks that. When the game builds a city (`buildWorldModel` in `public/world3d.js`), `applyWorldLayout` in `public/world-layout.js` applies its changes.

If a change names an object the code no longer builds (because the world's code changed since it was saved), the game skips it and lists it in `model.layoutWarnings`. The editor marks it **Missing** in the change list, and a test fails if the committed layout names such an object.

### For code that builds the world: edit groups

The world's builders mark what belongs together with `tag(id)` (from `createWorldModel`, also available as `model.tag`):

```js
tag('garden/tree#'); // every mesh and collider made from here on belongs to this group…
buildTree(...);
tag(); // …until the next tag
```

An id ending in `#` is numbered in build order (`garden/tree#1`, `garden/tree#2`, …), so keep that order stable. **Changing an existing group's id, or the order of numbered groups, detaches saved edits from their object.** The test above will tell you if a committed edit no longer finds its object. The house's walls and rooms are not edit groups: `createWorldModel` records them in `model.shell` (each wall's lines, doorways, height and parts), so keep the grid's walls built through `shellWall` there. House furniture is tagged per piece in `house-objects.js`. Town lots, furnishings and bus stops are grouped in `tagTownGroups` in `community-world.js`. New builders should tag what a person would want to move as one thing.

Whatever is still untagged when the town is built gets a group or a lock from `tagLooseParts` in `public/world-detach.js`: town pieces join the lot they stand on (paving and kerbs off the lots are street), trees become one group each, farm pieces and other loose pieces become one object per set of touching pieces, and roads, traffic lights, the driveway, hills and water, the ground, the house's walls and floors, house trim and the roof are given an `editLock` naming the reason (`LOCKS`). Numbering follows build order, as with `tag`. Mark what should stay put with an `editLock` of an existing kind (or a new one with its reason in `LOCKS`), so the editor can say why; `tests/map-detach.test.mjs` fails if any part of any city is left with neither.

## Street Editor

The town's roads used to be a fixed grid in the code: six junctions across and five rows down, 48 m apart. They are now a layout (`public/street-network.js`). The simulation works out lanes, pavements, crossings and turns from that layout, so when you change the roads, the cars, buses and pedestrians follow.

### Layout

- **Top bar:**
  - **Layout** picks what you edit: the **shared town**, which every city uses, or **one city's own layout**. A city's own layout starts as a copy of the shared town. Cities with their own layout are marked ●.
  - **Preview as** sets which city's driving side and names the traffic and 3D preview use.
  - **Plan / 3D** switches between editing from above and seeing the town as the game draws it.
  - **Run traffic** runs the real simulation on your layout, in the plan, at twice real time.
- **Tools** on the left:
  - **Select** (`V`): click a junction or road, and drag junctions to move them. Their roads follow. A selected road shows a round handle halfway along: drag it to curve the road (a filled handle means it is curved).
  - **Road** (`R`): click a junction, a road or open ground to start, then click again to end. It keeps drawing from where you ended until `Esc`. Ending on a road or open ground adds a junction there.
  - **Junction** (`J`): click a road to put a junction on it.
  - **Crossing** (`C`): click beside a junction to add or remove the zebra crossing over that road.
  - **Delete** (`X`): click a junction or road to remove it.
  - **Pan** (`H`): drag to move around. Holding `Space` does the same with any tool.
- **Inspector:**
  - For a junction: its position, its **control** and its roads. The controls are **Automatic** (signals where three or more roads meet, as before), **Signals**, **Stop**, **Give way**, **Roundabout** and **Uncontrolled**.
  - For a road: its length (along its curve), its bus stops, its **Lanes** (one or two each way) and its **Shape** (straight or curved).
- **Road shapes:**
  - **Two lanes each way** make an 18 m road with a dashed line between each pair of lanes. Its pavements sit 11 m from the centre line, so its junctions are wider too. Traffic takes whichever lane suits its turn.
  - **Curved** roads bend smoothly through their handle, halfway along. Lanes, kerbs, pavements and bus stops follow the curve. **Straight** takes the bend away. Splitting a road with a junction straightens it, but keeps its lanes.
  - **Roundabout** puts a circle round a grass island in the junction. Traffic gives way to whoever is already on the circle, then drives round it: anticlockwise seen from above where traffic drives on the right, clockwise on the left. Crossings stay as zebras.
  - With nothing selected: the layout's numbers, its **problems**, and **Back to the grid** (or **Back to shared** for a city).
- **Snap** keeps junctions on whole metres and lines them up with other junctions, showing a guide line. Scroll zooms, right-drag pans and `F` fits the town in view.

### Problems

The editor checks the layout as you work and rings each problem on the plan. **Red problems stop you saving**, because the game could not run that layout. Amber ones are warnings.

- **Errors:**
  - a road running through a building's lot
  - roads that cross without a junction
  - a road shorter than 28 m
  - roads meeting at less than 40° (measured along a curved road where it leaves the junction)
  - a curve tighter than 15 m round
  - a dead end (cars cannot turn round)
  - junctions cut off from the rest
  - a building people cannot walk to
- **Warnings:**
  - bus stops that disappeared with their road
  - more than four roads at signals (signals have two phases, so some arms share a green)
  - a roundabout where fewer than three roads meet

### What stays put

Some junctions and roads are locked, because other parts of the game are built around them. The editor shows a padlock and the reason. Locked roads cannot be widened or curved, and locked junctions cannot become roundabouts.

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
      "roads": [{"a": "0:-1", "b": "1:-1", "lanes": 2}, ..., {"a": "5:2", "b": "n1", "bend": {"x": 230, "z": 40}}]
    }
  }
};
```

- **Positions** are metres in the town's own coordinates: x is east, z is south.
- **Junction ids:** the grid's junctions keep their ids (`ix:iz`), and junctions you add are `n1`, `n2`, ….
- **`control`** is `signals`, `stop`, `giveway`, `roundabout` or `none`. Leave it out for the automatic choice.
- **`lanes: 2`** gives a road two lanes each way. The second lane's ids are `a>b:out:2` and `a>b:in:2`. Leave it out for one lane each way.
- **`bend`** is the point a curved road passes through, halfway along. Leave it out for a straight road.
- **`closedCrossings`** lists the neighbouring junctions whose road has no zebra crossing at this one.
- **Cities without a layout of their own** use `town`. A layout the same as what it would inherit is not saved, so the file stays empty until something really changes.

With the file empty, or with roads and junctions that use none of `lanes`, `bend` and `roundabout`, the town is built exactly as before: same lanes, crossings, signals and drawing (`tests/street-network.test.mjs` checks the grid's network against hashes taken before these existed). Signals pair each junction's arms by which are most nearly opposite. On the grid that is east–west against north–south, so students' `trafficEW` and `trafficNS` programs keep working.

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
  - **Look:** how they look beyond their clothes (see [Designing a look](#designing-a-look)): height, build, skin, hair, beard and brows. **Start from a look…** applies a ready-made one; **Randomise** makes one up.
  - **Clothes:** top and bottom colours, stripes, a hi-vis vest and its lettering, a cap or hard hat, a backpack and a badge. Each piece can be as built, none (taken off) or your choice.
  - **Movement:** their walk, their standing clip, an activity played on the spot instead of both (or **None** to take away one the code gives them), walking speed, and clip speed.
  - **Clips:** animations you make by posing (see [Making clips](#making-clips)) or bring in from files (see [Importing clips](#importing-clips)).
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

- **The keys:** `model`, `outfit` (pieces as in `public/character-outfits.js`, with `null` taking a piece off, and `wardrobe` for their own clothes, see below), `walk`, `idle`, `activity` (`false` for none), `speed`, `rate` and `reactions` (see Reactions below).
- **The keys:** `model`, `outfit` (pieces as in `public/character-outfits.js`, with `null` taking a piece off, and `wardrobe` for their own clothes, see below), `appearance` (as in `public/character-appearance.js`; a person's parts are laid over the defaults' one by one), `walk`, `idle`, `activity` (`false` for none), `speed` and `rate`.
- **Order:** a person's own settings come before `defaults`, and both before what the code picks.
- **Ids** are the game's own: `player` is the technician, and others look like `Maya`, `worker:shop-floor:0` or `bus:0:1>1:1:2`.
- **An empty file** leaves everyone as the code makes them, which `tests/character-settings.test.mjs` checks. `public/character-settings.js` applies the settings.

### Reactions

The inspector's **Reactions** section sets a clip someone plays when something happens. They blend into it, play it, then blend back into what they were doing.

| Reacts to                  | Set off by                                                  | Plays again after (default) |
| -------------------------- | ----------------------------------------------------------- | --------------------------- |
| The technician comes near  | the technician coming within 3 m (once per approach)        | 20 s                        |
| A chat opens               | the technician opening a chat with them                     | 0 s                         |
| One of their quests passes | their quest's tests passing, or a chat where they thank you | 0 s                         |
| Their quest's tests fail   | their quest's tests failing                                 | 10 s                        |
| It is cold / hot outside   | an outdoor temperature under 10 °C / over 30 °C             | 45 s                        |
| It is raining              | rain over 20                                                | 45 s                        |
| It is night                | light under 15                                              | 60 s                        |

- **For each:** a clip (any played on the spot, imported ones too), **For** (once through, or looped for a number of seconds), **Again after** (the cooldown) and **Turn to the technician**. The play button tries it on the stage, turning them to the camera.
- **One at a time:** a reaction to the weather or to the technician coming near waits while another plays; a chat, a pass or a failure cuts in.
- **Everyone and one person:** a person's reaction to something replaces everyone's; **Nothing** on a person keeps them still where everyone else reacts. The judo class does not react, and reduced motion turns reactions off.
- **Saved** with the other settings, as `reactions: [{ trigger, clip, seconds?, cooldown?, face? }]`, triggers `near`, `chat`, `thanks`, `fail`, `cold`, `hot`, `rain`, `night`; `clip: false` for Nothing. `public/character-reactions.js` plays them; with none saved, everyone is as before (`tests/character-reactions.test.mjs`).

### Designing a look

The **Look** section changes the person themselves, on whichever model plays them:

| Part   | What it does                                                                                                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Height | 85–115% of the model's size, feet kept on the ground. Taller people take longer strides, so their feet keep pace with the ground.                                                                          |
| Build  | Slim to broad: wider across and deeper in the body; the head keeps its own shape.                                                                                                                          |
| Skin   | A tone from fair to deep (or any colour). Only the skin painted on the model changes; eyes, lips and brows keep theirs. On the two models made in one piece (Alex, James), skin-coloured clothes tint too. |
| Hair   | The model's own (recoloured if you pick a colour), or bald, a buzz cut, short, a curly crop, a bob, long, a ponytail or a bun, in any colour.                                                              |
| Beard  | The model's own (recoloured), clean-shaven, stubble, a short or full beard, a goatee or a moustache. It takes the hair's colour unless given its own.                                                      |
| Brows  | The model's own, or bold: thicker brows a shade darker than the hair.                                                                                                                                      |

How the hair and beards are made (`public/three-appearance.js`):

- **Fitted to each head.** The skull is measured from the model, so every style sits on any head. The hair runs from a crown (at the top, or further back for hair drawn back into a ponytail or bun) to a hairline round the forehead, temples, ears and nape, thinning towards its edge. Strands are painted along it, and the hair fades out smoothly over its last centimetre or two (blended, lit as from outside on both sides), so the hairline is soft rather than cut. Long hair and the bob part over the forehead.
- **Long hair** hangs from the widest part of the head and eases out over the neck and back rather than going through them, with no step where it leaves the skull. The bob stops above the shoulders.
- **Beards grow from the skin:** they are painted into the face's own skin, densest in the middle and thinning to nothing at their edges, with fine bristles (and clumps, for longer beards). Being skin, they move with the jaw as it does. The lips stay clear: the mouth is found from the face's profile. They take the hair's colour (the model's own hair colour when the hair is not changed), not black.
- **The judo class** gets the skin, hair and face you set, but not height or build: its throws are fitted to its sizes.
- **Hats** are fitted to the model's own hair, so they can sit a little high on a bald or buzz-cut head.

With no look set, a person is drawn exactly as before (`tests/character-appearance.test.mjs` checks this, along with the format and the editor's changes).

### Changing their own clothes

The **Their own clothes** section takes off the clothes the model is made with, or dresses the person in another model's, so a generated dress, skirt or coat (in **Clothes**) goes over something plain instead of over jeans:

| Choice              | What it does                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top, Bottom         | **Their own**, **Taken off**, or another model's (Josh's suit, Shannon's shorts…).                                                                                        |
| Shoes               | Their own, or another model's. Shoes are swapped, never just taken off; heels go only to someone already in heels.                                                        |
| Base layer          | What goes on where clothes come off: a colour, **Sleeves** (short, sleeveless or long) and **Legs** (shorts, to the knee or full length), and socks under borrowed shoes. |
| Change into a dress | One step: top and bottom off, a sleeveless base layer in the dress's colour, and a dress over it.                                                                         |

**Nobody is ever drawn undressed.** Each model's body is cut away under its clothes, so a top or bottom that comes off is always replaced by the base layer (`public/three-wardrobe.js`), made from the piece's own shape so it covers exactly what the piece did:

- cloth over the torso and hips, cut in a clean line at the sleeves' and legs' hems (sleeveless cuts where a dress's top would, from the chest, back and neck);
- skin past the hems: arms made afresh as smooth limbs shaped from the body's own arm, legs drawn in to the body's own size, painted with the body's own skin as it shows past the clothes. The body's unfinished bits under the old clothes are trimmed away so they never show through;
- under clothes borrowed from another model, cloth as far as they reach (so no skin is made only to be covered), drawn a little behind them.

**Borrowed clothes** are carried over bone by bone from the other model and fitted to this body's girth on each side of each bone (a jacket cut for a flat chest is let out at the front for a fuller one), then pushed just clear of what is under them, smoothly, so they do not tear. A jacket or jumper comes without the narrow shirt front under it: the base layer is the shirt there. They load with the person (and the light versions far away follow); a model that fails to load lends nothing.

**What cannot change:** Alex, James and Jennifer are made in one piece with their clothes painted on; imported models are not offered; the judo class keep their gi. Hair, faces, masks and caps that are part of a model are not clothes.

**Known limits:** sleeves and legs reach only as far as the clothes taken off did (long sleeves on someone whose own shirt had short ones stay short); close up, the line where new skin meets the body's own can show, and the base layer keeps the shape of what it replaces (a hoodie's hood, a polo's collar). Borrowed pieces are fitted, not tailored: a few seams of the base layer can show at their edges.

Saved as `wardrobe` in the person's (or everyone's) `outfit`:

```js
outfit: {
  dress: '#5b3f8f',
  wardrobe: {
    top: 'off',        // or a model's name: 'Josh'
    bottom: 'Shannon',
    shoes: 'Megan',    // swapped only
    base: { color: '#5b3f8f', sleeves: 'vest', legs: 'shorts', socks: '#ecebe6' },
  },
}
```

With no wardrobe set, everyone is drawn exactly as before (`tests/character-wardrobe.test.mjs` checks this, that no wardrobe can leave anyone without the base layer, the format and the editor's changes).

### Importing clips

**Import…** (in the inspector's **Clips** section) brings in an animation from a `.glb`, `.gltf` (with its data inside it) or `.fbx` file, such as a Mixamo download.

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

### Making clips

**Make…** (in the inspector's **Clips** section) opens the pose editor along the bottom of the stage: make a clip by posing whoever is picked at a few moments, and the editor fills in the moments between.

- **It starts** with one pose at 0 s: the person's standing clip, as it begins. **Take the pose from** a clip at a moment (Idle at 0.5 s, say) replaces the pose at the playhead with that moment of the clip.
- **Turning a joint:** click a dot on the body (or pick the joint from the list) and drag the rings to turn it. The joints are the hips (the whole body), lower back, chest, neck and head, and each side's collarbone, shoulder, elbow, wrist, hip, knee and ankle. Fingers and toes hold the starting pose.
- **The timeline:** each diamond is a pose. Click or drag on the track to move the playhead, and drag a diamond to move that pose in time. Turning a joint between poses adds a pose there. **Add pose** (`K`) keeps the in-between pose as one, and **Remove** (`Delete`) takes the pose at the playhead away.
- **Mirror** (`M`) swaps left and right at the playhead, as in a mirror. **Copy** and **Paste** carry a pose to another moment. **Reset joint** puts the chosen joint back as the starting pose has it.
- **Between poses:** **To the next pose** sets how the pose at the playhead moves on to the next: _Smooth_ (eases in and out), _Steady_, _Quick, then settle_, or _Hold, then snap_.
- **Length and looping:** changing the length stretches or squeezes the poses with it. A looping clip moves from its last pose back to its first by the end; one that does not loop holds its last pose.
- **Play** (`Space`) plays it; `←` and `→` step a frame. `Z` and `⇧Z` undo and redo inside the pose editor, and `Esc` cancels.
- **Add to the game** saves it exactly like an imported clip: `public/models/people/clip-<Name>.glb` and an entry in `public/data/clips.js`, so it can be anyone's standing clip or activity. Made clips play on the spot. Each is listed as _made here_, and its person button opens it again (its name stays, and saving replaces it).

A made clip's entry keeps its poses under `made`, so it can be changed later (`editor/workspaces/character-editor/keyframes.js` describes them):

```js
Waving: {
  file: 'clip-Waving.glb',
  duration: 2,
  made: {
    length: 2,
    loop: true,
    base: { hips: [0.6, 98.1, 1.2], bones: { mixamorigHips: [0, 0, 0, 1] /* every bone */ } },
    keys: [
      { t: 0, pose: { mixamorigRightArm: [0.62, 0.03, 0.58, 0.53] /* each joint */ } },
      { t: 0.5, ease: 'out', pose: { mixamorigRightForeArm: [0.1, 0, 0.3, 0.95] } },
    ],
  },
},
```

`base` is the whole body as the clip it started from has it, and each pose turns joints from there. The game reads only the file and duration; `tests/pose-editor.test.mjs` checks the filling in, mirroring, the checks and the saved form.

### Importing your own models

**Import model…** (in the inspector's **Imported bodies** section) brings in a rigged character from a `.glb`, `.gltf` (with its data inside it) or `.fbx` file: a Mixamo character, a Ready Player Me avatar, or a Blender export of a Mixamo-rigged body.

1. Pick the file. Its skinned pieces are fitted to the game's form (`editor/workspaces/character-editor/model-import.js`):
   - **Bones** are renamed to Mixamo's (`mixamorig:Hips`, `mixamorig7Hips`, `mixamorig_Hips`, `Armature|Hips`, `Hips_01` and Ready Player Me's plain `Hips` all become `mixamorigHips`), so the game's clips play on it by name. It needs the main 19 bones (hips, spine, neck, head, both arms down to the hands, both legs down to the feet); a model without them is refused with the ones it lacks. Without `Spine2` or the toes it is accepted, and the panel says what sits less well.
   - **Stood up** (head above hips), **turned** to face forward (its left hip on +x), with its **hips as high as the game's people's** (0.977 m) and its feet on the ground.
   - **In centimetres under a 0.01 scale**, each bone keeping its rest turn, each piece rebound to the moved bones, its materials made the game's (an untextured piece keeps its colour). Pieces that are not rigged are left out, and counted.
2. It shows on stage wearing the picked person's clothes and playing their clips: switch **Standing** and **Walking** to try it. Outfits are measured from the body, as on the game's own models; recolouring the top and bottom needs separate pieces named like Mixamo's (`Shirt`, `Pants`; a Ready Player Me `…Outfit_Top`/`…Outfit_Bottom` is renamed to match).
3. Name it (letters and digits, starting with a capital, not taken), choose **A man** or **A woman** (how it is listed), set its **height** against the game's people (worked out from the file when its units are metres or centimetres), and click **Add to the game**.

It is saved as `public/models/people/model-<Name>.glb` and listed in `public/data/models.js`. It can then be picked under **Played by** for anyone. The bin button removes it (its file too); anyone set to it goes back to as built.

### New people

**New person** (above the list) adds someone of your own, listed under **Your people** and standing on the front lawn at home until you say otherwise. At the top of their inspector, **Who they are** sets:

- **Name**: who they are in the game. It must be their own: not another added person's, nor anyone's already in that city (a quest resident or a townsperson), or their quests and chats would mix.
- **Lives in**: home (the original house), one city, or every city.
- **What they do** (shown when they talk, "Neighbour" if blank) and **About them**, a line for whoever writes their quests and lines.
- **Stands at**: **Place on the map…** opens the map (below); click where they stand.
- **Remove** takes them out of the game, with their looks and routine.

Their looks and movement are set below, like anyone's: who plays them, what they wear, their clips and speeds. In the game they stand (or walk their routine) in their city, and the technician can talk to them. Once saved, their name can be picked as a quest's resident in the Quest Editor, and their lines written in the Conversation Editor.

### Routines

A routine is a round of stops: they walk to each in a straight line, stay there a while playing a clip, and after the last walk back to the first. **Routine** in the inspector says what they do now; **Draw a routine…** opens the map over the preview:

- **The map** is the city from above as the game builds it: grey blocks are walls, fences and furniture (what people cannot walk through), dots are other people, a diamond is where an added person stands without a routine, and the yellow dot is them, walking the routine as it plays back (**Play**, at 1×, 5× or 20×).
- **Click** the map to add a stop (after the selected one, or at the end). **Drag** a stop to move it; drag elsewhere to pan, **scroll** to zoom, **F** fits the routine. **Delete** removes the selected stop.
- **Beside the map**, each stop has how long they stay (up to 10 minutes) and what they play there: their standing clip, or any clip, imported ones too. Arrows change the order.

They walk at 1.2 m/s, times their walking speed. A walk that runs through a wall or furniture is drawn red and stops saving, as does a stop inside one: add a stop to go round. Routines follow the game's clock, so the game's speed and pause apply.

**Who can have one:** people added here, and the townspeople and workers who stand by themselves. Locked, with the reason shown: the technician (you steer them), the household (they come to the technician when a room needs them), the judo class (timed to its lesson), and people moved by what they are doing (players, swimmers, passengers). The Character Editor shows everyone at home, so a townsperson's routine plays at home only (the town differs between cities); an added person's routine plays wherever they live.

### The saved people

`public/data/people.js` holds them; `public/people-settings.js` describes the format and adds them to the game.

```js
export default {
  version: 1,
  models: {
    Robin: { file: 'model-Robin.glb', woman: true, height: 0.92 },
  people: [
    { id: 'own:ana', name: 'Ana', city: 'legacy', at: [3, 9], role: 'Baker', bio: 'Up at four.' },
  ],
  routines: {
    'own:ana': {
      stops: [
        { at: [3, 9], stay: 20, clip: 'TalkingAsk' },
        { at: [9, 9], stay: 10 },
      ],
    },
    'civic:hospital': { city: 'legacy', stops: [{ at: [60, 40], stay: 30 }] },
  },
};
```

- **The game** (`public/character-models.js`) draws an imported model from its one file near and far (the game's own have a light version for distance and software WebGL), scaled by its height. A setting that names a model the game does not have plays that person as built. With the file empty the game is exactly as before (`tests/character-models.test.mjs`).
- **Publishing a model:** as with clips, commit `public/data/models.js` here and add the model's `.glb` to the private models repository, then update `COMMIT` in `scripts/fetch-models.mjs`. Until its file is there, anyone set to it is drawn as their jointed stand-in figure.
- **Not imported:** a model's own animations (import them as clips), extra rigid parts parented to bones, and models whose skeleton is not Mixamo-style (rig them in Mixamo first).
- **Ids:** an added person's id is `own:` and the name they were added with as a slug (`own:new-person-1`), and stays put when they are renamed, so their looks (kept under that id in `public/data/characters.js`) stay theirs.
- **Positions** are world metres, `[x, z]`, to the centimetre.
- **With the file empty, every world is built and every frame drawn exactly as before** (`tests/people-routines.test.mjs` compares the worlds; a run of frames was compared against the code before).

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
    - **Make it timed** turns one of your quests into a timed quest (below): its tests become steps and its rules a worked program.
  - **Sequences** and **Worked program**, for a timed quest, in place of rules and tests (see [Timed quests](#timed-quests)).
- **The check** on the right, run again after every change. It shows whether the quest is **Ready to play**, or what to fix; how the worked solution does on each board and language; its code; and the Guide's steps.

### Changing built-in quests

Pick a built-in quest to change it in place:

- **Rule quests:** their story, devices, rules and tests.
- **Timed quests:** their story, sequences and worked program (their devices stay as built).
- **Repair and expedition quests** (Find the Wrong Pin, Repair the Missing Ground, Threshold Detective, the Final Expedition), which check the student's work with code of their own: their story only. They are marked "story only" in the list.

Changed quests are marked in the list. **Reset to original** puts a quest back, and **Copy as a new quest** makes a separate quest of your own instead. A changed quest is checked exactly like a new one before it can be saved. If you change a threshold, the check also warns when the goal, hint or the resident's words still give the old number.

What the game does on top of your changes:

- **Local titles:** each city gives the first eight quests a local title of its own, so a new title for one of those shows only where none is set.
- **Advanced versions:** some quests have an Advanced version with rules or sequences of its own. If you change a quest's devices, rules, tests, sequences or worked program, yours apply at both levels.
- **Every city:** changes apply wherever the quest is played.

### Timed quests

Some behaviour can't be proved by single readings: a fan that waits for two thresholds before it changes (no flicker), a light that stays on for a minute after the last movement, a counter, a program that copes with a network outage or a restart. A **timed quest** proves it with **sequences**: each one plays its **steps** in order on one running program, which keeps its variables from step to step.

- **A step** has a label; the readings it changes (a reading left at – carries on from before); how long it lasts in seconds; and, for each output, what it must be at the end of the step: **ON**, **OFF**, **either**, or a **brightness** from 0 to 255. Click an output to go round those.
- **Events:** a step can also **restart** the controller (a power cut: variables are lost) or make the **network drop** or **come back**, and it can send an MQTT message (`topic = payload`) at its start.
- **At the start:** the readings before the first step. **Tick** is how far the program's clock moves on each pass (200 ms unless set).
- **The worked program** proves the quest can be passed. It is written once in a small C-like form (the one `public/catalogue-program.js` describes) and turned into Arduino C++ and MicroPython for the quest's wiring: its **variables** and their starting values, what runs **at start**, what runs **on every pass** (each sensor is read first into a variable named after its reading, such as `temp`; `write(fan, 1)` switches an output, `pwm(led, 128)` sets a brightness, `print(x)` prints a line), and how long it **waits each pass**.

What stays as coded:

- **Coded checks.** Some built-in steps also check what the program printed or published (a counter's total, an MQTT message), with code written into the quest. They are marked **coded check**: their readings, length and expected outputs can change, but the check itself stays as coded, and goes if you remove its step. A quest with coded checks cannot be copied.
- **A timed quest's devices.** Its program and steps are written for them.

A timed quest is checked like any other: the worked program must pass every sequence on both boards in both languages, and a program that does nothing must fail. If they disagree, **What fails** in the check says where, for example `At "30 °C" (3 s in) the cooling fan should be ON, but it is OFF.`

### The check

Saving needs every one of your quests to pass, so a saved quest can always be played:

- it builds: devices exist, there is one rule per output, the rules read only chosen sensors, and every test sets real readings and gives each output on or off (for a timed quest: every step sets real readings, lasts some time and expects something of each output, and the worked program's variables are named and start as numbers or text);
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

- **A timed quest** has `sequences` and `solution` instead of `conditions` and `scenarios`:
  `"sequences": [{"name": "Two thresholds, no flicker", "steps": [{"label": "30 °C", "env": {"temp": 30}, "ms": 1000, "expect": [1]}]}], "solution": {"state": {"fanOn": 0}, "loop": "if (temp >= 30) {\n  fanOn = 1;\n}\nwrite(fan, fanOn);"}`. In a built-in quest's changes, a step with a coded check holds `"check": {"coded": [0, 3]}`, naming the sequence and step where that check sits in the quest as coded.
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

## City Editor

Each city words the home's eight quests its own way: the household has local names (Maya is Akari in Kyoto), residents open their requests with "Here in Kyoto, …", and the quests have local titles. The City Editor changes that wording, city by city.

### Layout

- **Top bar:** back to workspaces, **Beginner / Advanced** (the level the quests are shown at; some requests differ by level), undo and redo, save state, **Play-test** and **Save**.
- **Left, the cities:** every playable city, with its country. A blue dot marks a city with your wording, a red one a city with problems.
- **Middle, the home's quests:** the eight home quests as that city words them now, with who asks and where. The household's names are at the top. Click a quest to change it.
- **Right, the fields:** the household's three names, how requests open, and the chosen quest's title and request. Blank fields show faintly what the game says and keep it.

### The check

- **Names:** chats find a resident's requests by name, so a household name that is also someone else's in that city (another of the household, or a resident with quests of their own there) would mix their chats. A name you set that clashes stops saving; a clash the code already has (Sam is Jordan in Brisbane) is a warning.
- **The opening** must say `{request}`, and can use only `{city}` and `{request}`; the game adds the quote marks.
- **Titles and requests** are plain text. A title another quest in the city already has, and a very long request, are warnings.

### The saved wording

`public/data/cities.js` holds it; `public/city-settings.js` describes the format and reads it in the game.

```js
export default {
  version: 1,
  cities: {
    kyoto: {
      names: { Maya: 'Yuki' },
      opening: 'In {city} we say: {request}',
      titles: { 0: 'Lantern Path' },
      quotes: { 2: 'The moss needs water when the soil dries.' },
    },
  },
};
```

- **Names** are laid over the city's own when the game loads, so everything that names the household uses them: chats, quests, the map and the Conversation Editor (whose lines stay keyed by Maya, Alex and Sam).
- **Titles and requests** are keyed by the quest's place (0–7, the home's quests). A request is written without the opening, its first letter lowercased as the game does, and is used at both levels. The quest's devices, rules and tests stay the code's.
- **With the file empty, every city is worded exactly as before** (`tests/city-editor.test.mjs` checks every city at both levels).

## World Builder

The **World Builder** (`editor/workspaces/world-builder/`) lets users create, edit, save, export, and explore complete 3D environments for IoT learning missions.

### Layout

- **Top toolbar:** World selector, New / Duplicate world, **Select** (`V`), **Move** (`G`), **Rotate** (`R`), **Scale** (`S`), **Duplicate** (`⌘D`), **Undo** (`⌘Z`), **Redo** (`⇧⌘Z`), **Play Mode** toggle, **Play-test** (`⌘P`), and **Save** (`⌘S`).
- **Left panel:** Searchable asset library and building tools across six tabs (**Assets**, **Terrain**, **Footprint**, **Roads**, **IoT Code**, and **Project**).
- **Centre:** Interactive 3D viewport powered by `ThreeWorldRenderer`, with Orbit and First-Person cameras, zoom, focus (`F`), movement speed control, 3D grid, XYZ axis indicators, transform handles, and roof/storey cutaway filters.
- **Right panel:** Properties inspector for the selected object(s) or world environment (exact dimensions, materials, architectural styles, door/gate states and hinges, and IoT GPIO pin connections).
- **Bottom panel:** Scene hierarchy tree, layer visibility/lock manager, object/complexity counters, autosave status, and contextual guidance.

### The saved worlds

`public/data/worlds.js` holds the saved worlds, reusable prefabs, and asset favourites (`tests/world-builder.test.mjs` verifies terrain sculpting, modular and footprint building construction, roads, IoT simulation, and project persistence).

### Playing a world in the game

Saved worlds are playable in the game. With any saved, the destination screen gets a **Custom worlds** button listing them; each opens on its own page, `world.html?id=<world id>` (`public/world-play.js`). **Play-test** opens the world being edited there (Shift-click: the game from the beginning).

- **Same world, same code:** the terrain, assets, scene, devices, pins and simulation live in `public/world-builder/` (`terrain.js`, `assets.js`, `world.js`), which the World Builder imports too, so a world plays exactly as its Play Mode shows it.
- **Walking:** the technician (dressed as in the game) walks with WASD or the arrow keys; drag to look round, scroll to zoom. Buildings and solid objects stop them, and the ground carries them over hills.
- **What plays:** the devices are wired as the World Builder placed them, on its board. The student writes the program (C++ or MicroPython), starting from one with the pins, readings and outputs written and every decision left false, and runs it: lamps and streetlights light up, servos and gates open doors, pumps raise the soil moisture, fans cool, red signals stop the cars. Walking near a motion sensor is seen by it; **E** beside a button, keypad or card reader presses or scans it, and beside a door or gate opens or closes it. **Conditions** has the time of day, weather and readings to practise with.
- **The mission:** **Check my program** runs the student's program and the world's own program (the one written in the World Builder's IoT Code tab, in its own language) in every combination of each sensor low and high, and passes when each output switches the same way. If the world's own program never switches anything on (never written after the devices were placed), the rules guessed from the devices are used.
- **What is decorative:** objects without a device (furniture, buildings, nature), and devices with no effect in the scene beyond their own glow. Imported models are drawn when saved as a `models/….glb` file or packed in the world.
- **Progress:** each world's program, language and pass are saved in the browser under `iotquest-worlds-v1`, apart from the game's own save, so a world can never change a player's game progress. A play-test from the editor reads and saves nothing.
- **With no worlds saved, the game is exactly as before:** nothing is added to the page (`tests/world-play.test.mjs`).
- **Terrain** is saved as one height and one surface per 4 m cell (32 × 32 over 128 m). It is drawn as one smooth surface through those heights (Catmull-Rom between cell centres, four vertices a cell, surfaces blended into their neighbours), and objects stand on the same surface, so they never float above or sink into what you see.
- **Imported models are files, not part of `worlds.js`.** Saving writes each one to `public/models/worlds/<id>.glb` (a `.gltf` is converted to `.glb` when it is imported) and the world keeps only `file: "models/worlds/<id>.glb"`. Ids come from the model's name and are never reused for a different model; copies of a world share their models' files. Until you save, a new model's bytes are held by the workspace, so undo steps and the browser autosave stay small. `public/models/` is kept out of this public repository (the people's models are there too): to ship a world with an imported model, add its `.glb` to the private models repository and update `COMMIT` in `scripts/fetch-models.mjs`, as for imported clips.
- **Older saves and exported projects** carry models packed into the file as base64 (`dataUrl`). Opening one moves them out: the workspace shows unsaved changes, and the next save writes their files. An exported `.iotworld.json` still carries its models packed in, so it opens on any machine.
- **Undo** covers every change to a world, its prefabs and favourites: environment sliders (a whole drag is one step), the program (typing is one step until something else changes), the language, favourites and saved prefabs. In Play Mode the sliders change only the running simulation.
- **Hidden and locked** are separate: a locked object cannot be moved or edited, but it can still be hidden and shown.
- **If the browser's storage is full** the autosave says so (once) instead of failing silently; saving with ⌘S still works.
