// The final expedition (catalogue Q100): passed only by work already saved at destinations, never
// by a program written for it. Each quest counts towards the themes its devices show.
const LIGHTS = ['led', 'porch', 'rgb', 'streetLight', 'lightB'],
  WATER = ['pump', 'valve', 'valve2'],
  CLIMATE = ['fan', 'ac', 'heater'];
// The themes of one level of a quest: the advanced level's devices when `advanced`.
export function questThemes(m, advanced = false) {
  const ids = new Set((advanced && m.advanced?.ids) || m.ids || []),
    has = (list) => list.some((id) => ids.has(id));
  return [
    has(LIGHTS) && 'lighting',
    has(WATER) && ['soil', 'soil2'].some((id) => ids.has(id)) && 'irrigation',
    has(CLIMATE) && ['temp', 'humidity', 'outside'].some((id) => ids.has(id)) && 'climate',
  ].filter(Boolean);
}
const NEEDED = ['lighting', 'irrigation', 'climate'];
const indexOf = (key) => Number(String(key).replace(/^advanced:/, ''));

// Destinations (other than the original home) and the themes of the quests passed at each.
export function expeditionSites(state, missions) {
  return Object.entries(state.locationProgress || {})
    .map(([id, profile]) => {
      const themes = new Set();
      for (const [key, record] of Object.entries(profile?.completed || {})) {
        const m = missions[indexOf(key)];
        if (!m || m.capstone || !record?.code) continue;
        for (const theme of questThemes(m, String(key).startsWith('advanced:'))) themes.add(theme);
      }
      return { id, themes };
    })
    .filter((site) => NEEDED.every((t) => site.themes.has(t)));
}
// Whether any destination has a passed quest with this catalogue number.
const passedAnywhere = (state, missions, numbers) =>
  [state, ...Object.values(state.locationProgress || {})].some((profile) =>
    Object.keys(profile?.completed || {}).some((key) =>
      numbers.includes(missions[indexOf(key)]?.catalogue),
    ),
  );

// Test results in the form Test your solution shows.
export function expeditionResults(state, missions, advanced, names = (id) => id) {
  const sites = expeditionSites(state, missions),
    results = [
      {
        name: 'Three destinations commissioned',
        pass: sites.length >= 3,
        detail: sites.length
          ? sites.length +
            ' of 3 destinations have a passed lighting, irrigation and climate quest: ' +
            sites.map((s) => names(s.id)).join(', ') +
            '.'
          : 'Pass a lighting, an irrigation and a climate quest at three destinations. Each pass keeps its wiring, code and test results as evidence.',
      },
    ];
  if (advanced)
    results.push(
      {
        name: 'Wiring fault repaired',
        pass: passedAnywhere(state, missions, [86, 87]),
        detail: 'Pass Find the Wrong Pin or Repair the Missing Ground.',
      },
      {
        name: 'Stale data handled',
        pass: passedAnywhere(state, missions, [59, 89]),
        detail: 'Pass Weather Data Goes Missing or Frozen Sensor Recovery.',
      },
      {
        name: 'Resource limit met',
        pass: passedAnywhere(state, missions, [67, 70]),
        detail: 'Pass Solar Surplus Pump or Daily Consumption Challenge.',
      },
    );
  return results;
}
