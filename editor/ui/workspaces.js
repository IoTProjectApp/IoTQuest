// The editor's workspaces: each a screen for one job, opened from the home page (index.html).
// To add one, create editor/workspaces/<id>/index.html and list it here (see editor/README.md).
export const WORKSPACES = [
  {
    id: 'map-editor',
    name: 'Map Editor',
    summary:
      'Move, add and remove furniture, garden features and town buildings in the 3D world, one city at a time.',
    icon: 'map',
    // What the workspace changes in the repository, shown on its card.
    writes: 'public/data/world-layout.js',
  },
  {
    id: 'street-editor',
    name: 'Street Editor',
    summary:
      "Lay out the town's roads: move and add junctions, draw and remove roads, set traffic lights, stop signs and crossings, then watch the traffic run.",
    icon: 'road',
    writes: 'public/data/street-layout.js',
  },
  {
    id: 'character-editor',
    name: 'Character Editor',
    summary:
      "Dress the game's people and set how they move: who plays them, their clothes, their walk, stance and activity, and how fast.",
    icon: 'person',
    writes: 'public/data/characters.js',
  },
  {
    id: 'quest-editor',
    name: 'Quest Editor',
    summary:
      'Write new quests: who asks and where, the devices to wire, the rules, and the tests. Each is checked against a worked solution on both boards before it can be saved.',
    icon: 'quest',
    writes: 'public/data/quests.js',
  },
  {
    id: 'conversation-editor',
    name: 'Conversation Editor',
    summary:
      "Write what the game's people say: greetings, thanks and a line about themselves, for everyone or one person in one city, and how each resident asks for their quests. Try every chat as you write.",
    icon: 'chat',
    writes: 'public/data/conversations.js',
  },
  {
    id: 'city-editor',
    name: 'City Editor',
    summary:
      "Word each city: what it calls the household, how residents open their requests, and the home quests' titles and requests there.",
    icon: 'city',
    writes: 'public/data/cities.js',
  },
  {
    id: 'world-builder',
    name: 'World Builder',
    summary:
      'Create, sculpt, build, furnish, wire and explore complete 3D environments for IoT learning missions with terrain, modular buildings, roads and live simulations.',
    icon: 'world',
    writes: 'public/data/worlds.js',
  },
  {
    id: 'component-editor',
    name: 'Component & Circuit Lab',
    summary:
      'Design and customize IoT sensors and actuators, inspect breadboard wiring on ESP32 and Raspberry Pi Pico, and test live signal waveforms.',
    icon: 'device',
    writes: 'public/data/components.js',
  },
  {
    id: 'curriculum-editor',
    name: 'Curriculum & Code Coach Editor',
    summary:
      'Author programming patterns in C++ and MicroPython, write Check Your Understanding questions, and test live Code Coach diagnostic hints.',
    icon: 'code',
    writes: 'public/data/curriculum.js',
  },
  {
    id: 'climate-editor',
    name: 'Climate & Soundscape Studio',
    summary:
      'Tune each city’s regional weather curves, build extreme weather presets, and synthesizer-test procedural WebAudio soundscapes.',
    icon: 'sun',
    writes: 'public/data/climate.js',
  },
];

export const workspaceUrl = (workspace) => `../workspaces/${workspace.id}/`;
