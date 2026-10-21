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
];

export const workspaceUrl = (workspace) => `../workspaces/${workspace.id}/`;
