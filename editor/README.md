# IoT Quest Editor

A desktop tool for working on the game's content by hand. It is **for development only**: it is never built, tested in CI or deployed, and the game does not need it to run. What it saves goes into ordinary files in the repository, which are committed and deployed like any other change.

```sh
./scripts/world-editor.sh
```

The script checks for Node.js 20 or newer, installs the game's development packages if they are missing, and on first run installs Electron into `editor/node_modules`. Electron is kept out of the game's `package.json`, so CI and the game never download it.

## Workspaces

The editor is a set of **workspaces**. A workspace is a screen for one job, such as placing objects in the 3D world. The editor opens on a home page with a card for each workspace. Click a card to open that workspace, and use the back arrow at the top left to return.

| Workspace     | What it does                                                                                                      | Writes                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Map Editor    | Move, add and remove furniture, garden features and town buildings in the 3D world, city by city.                 | `public/data/world-layout.js`  |
| Street Editor | Lay out the town's roads: junctions, roads, traffic lights, stop signs and crossings, then watch the traffic run. | `public/data/street-layout.js` |

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
- `/editor/three/…` for the three.js add-ons the editor needs, taken from `node_modules/three` and pointed at the game's vendored copy.

So a workspace imports the game's code with ordinary relative paths (`../../../public/regions.js`), and the same imports work in Node tests. Nothing is cached, so a reload always shows the files as they are on disk. Editor pages may run only their own scripts (a Content Security Policy is set).

## Map Editor

The game builds its world in code (`public/world-model.js`, `public/regions.js`, `public/community-world.js` and others), so each city's house, garden and town come from rules, not from a hand-made map. The Map Editor lets you correct that world by hand. Your changes are saved per city, and the game applies them every time it builds that city.

### Layout

- **Top bar:** the city to edit; **House**, **Garden** and **Town** to jump the camera; undo and redo; whether everything is saved; **Play-test**; and **Save**.
- **Tools** on the left:
  - **Select** (`V`) picks an object and shows a gizmo. **Move** (`G`) has arrows to drag along and squares to drag across a plane. **Turn** (`R`) turns the object about the vertical axis. **Size** (`S`) changes its overall size. **Snap** keeps moves to 10 cm steps and turns to 15° steps.
  - **Object** (`O`) opens the catalogue along the bottom, with tabs for Furniture, Garden, Buildings and Street, plus a search box. Click an item, then click in the world to place it. `R` turns it while placing, Shift-click places several, and `Esc` stops.
  - **Delete** (`X`) removes whatever you click.
  - **Camera** (`C`) only moves the view, so you cannot change anything by accident.
- **Inspector** on the right:
  - When an object is selected, it shows the object's name, its id and whether it is as built, moved or added. You can type an exact position, turn and size. **Focus**, **Duplicate**, **Reset** (back to how the code builds it) and **Delete** act on the object.
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
- `scale` is one size factor for the whole object.
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
