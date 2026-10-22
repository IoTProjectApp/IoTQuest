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
];

export const workspaceUrl = (workspace) => `../workspaces/${workspace.id}/`;
