import { missions } from './missions.js';
import { extraLocations } from './destination-catalog.js';
import { melbourneSuburbs } from './melbourne.js';
import { victorianFarms } from './farms.js';
import { applyFarmQuest } from './farm-missions.js';
const initialLocations = [
  {
    id: 'kyoto',
    country: 'Japan',
    iso: 'JPN',
    continent: 'Asia',
    city: 'Kyoto',
    latitude: 35.0116,
    longitude: 135.7681,
    timezone: 'Asia/Tokyo',
    title: 'The Timber Courtyard',
    architecture: 'Kyoto machiya-inspired timber home',
    description:
      'A compact timber learning home with lattice screens, tatami details, an engawa walkway and a small planted courtyard. It is based on Kyoto townhouses, with modern utility spaces added for the quests.',
    garden: 'Moss, bamboo, stone paths and a small courtyard garden',
    areaOverrides: { 'Garden path': [61.9, 34.2] },
    names: { Maya: 'Akari', Alex: 'Ren', Sam: 'Haru' },
    insulation: 0.7,
    shade: 0.35,
    theme: '#79aea4',
    practice: {
      outdoorTemp: 22,
      humidity: 72,
      cloud: 45,
      wind: 12,
      rain: 0,
      light: 68,
      soil: 35,
      tank: 75,
    },
    sources: [
      [
        'Kyoto timber townhouses · JNTO',
        'https://www.japan.travel/en/sg/guide/truly-authentic-japan-experience-kyoto/',
      ],
      [
        'Machiya courtyard visual reference · Hachise',
        'https://www.hachise.jp/buy/70064/index.html',
      ],
    ],
  },
  {
    id: 'marrakech',
    country: 'Morocco',
    iso: 'MAR',
    continent: 'Africa',
    city: 'Marrakech',
    latitude: 31.6295,
    longitude: -7.9811,
    timezone: 'Africa/Casablanca',
    title: 'The Shaded Riad',
    architecture: 'Marrakech riad-inspired courtyard home',
    description:
      'A sheltered courtyard learning home with warm plaster, tiled walkways, arched arcades, citrus planters and a central water basin. It is based on Marrakech riads and is not a historic reconstruction.',
    garden: 'Shaded citrus pots, geometric planting beds and a courtyard basin',
    areaOverrides: { 'Garden path': [72.2, 51.2] },
    names: { Maya: 'Salma', Alex: 'Youssef', Sam: 'Amine' },
    insulation: 1.3,
    shade: 0.65,
    theme: '#d1a47d',
    practice: {
      outdoorTemp: 31,
      humidity: 34,
      cloud: 10,
      wind: 9,
      rain: 0,
      light: 87,
      soil: 24,
      tank: 68,
    },
    sources: [
      [
        'Marrakech patios and riads · Moroccan National Tourist Office',
        'https://www.visitmorocco.com/fr/voyage/marrakech',
      ],
      ['Courtyard visual reference · Riad Kheirredine', 'https://www.riadkheirredine.com/'],
    ],
  },
  {
    id: 'brisbane',
    country: 'Australia',
    iso: 'AUS',
    continent: 'Oceania',
    city: 'Brisbane',
    latitude: -27.4698,
    longitude: 153.0251,
    timezone: 'Australia/Brisbane',
    title: 'The Veranda Workshop',
    architecture: 'Brisbane Queenslander-inspired veranda home',
    description:
      'A raised timber learning home with a shaded veranda, corrugated-metal eaves, timber balustrades and a garden inspired by south-east Queensland native planting. Modern IoT service spaces are added for the quests.',
    garden: 'Open veranda, rainwater storage and native-inspired garden beds',
    areaOverrides: { 'Garden path': [32, 50.8] },
    names: { Maya: 'Amelia', Alex: 'Kai', Sam: 'Jordan' },
    insulation: 0.85,
    shade: 0.5,
    theme: '#b6ba77',
    practice: {
      outdoorTemp: 26,
      humidity: 63,
      cloud: 25,
      wind: 16,
      rain: 0,
      light: 80,
      soil: 30,
      tank: 82,
    },
    sources: [
      [
        'Queenslander architecture · State Library of Queensland',
        'https://www.slq.qld.gov.au/blog/under-transverse-gable-queenslander-house-styles-mid-1930s-and-1940s',
      ],
      [
        'Queensland design and veranda photographs · Queensland Government',
        'https://www.hpw.qld.gov.au/__data/assets/pdf_file/0022/4837/qdesignmanual.pdf',
      ],
    ],
  },
];
export const locations = [
  ...initialLocations.map((l) => ({
    ...l,
    region:
      l.id === 'kyoto'
        ? 'Kyoto Prefecture / machiya tradition'
        : l.id === 'marrakech'
          ? 'Marrakech-Safi / riad tradition'
          : 'South-east Queensland / veranda tradition',
    style: l.id === 'kyoto' ? 'machiya' : l.id === 'marrakech' ? 'riad' : 'veranda',
    climate: l.id === 'marrakech' ? 'dry' : 'temperate',
    unlockAfter: 0,
  })),
  ...extraLocations,
  ...melbourneSuburbs,
  ...victorianFarms,
];
export function isLocationUnlocked(state, location) {
  return !!(
    state.freeExploration ||
    location.unlockAfter === 0 ||
    state.locationProgress?.[location.id] ||
    completedQuestCount(state) >= location.unlockAfter
  );
}
// Fault-workshop repairs are stored beside quest completions but are not quests.
export const isQuestKey = (key) => !String(key).startsWith('fault:');
const questCompletions = (completed) => Object.keys(completed || {}).filter(isQuestKey);
export function completedQuestCount(state) {
  return (
    questCompletions(state.completed).length +
    Object.values(state.locationProgress || {}).reduce(
      (sum, p) => sum + questCompletions(p?.completed).length,
      0,
    )
  );
}
export const continents = [
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Oceania',
  'Antarctica',
];
export const locationById = (id) => locations.find((l) => l.id === id);
// A resident's request, opened with where they live. The text follows a comma, so its first
// letter is lowercased (except "I").
function residentSays(location, text) {
  const body = /^I\b|^I’/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);
  return '“Here in ' + location.city + ', ' + body + '”';
}
function regionalBaseMissions(base, location) {
  if (!location) return base;
  return base.map((mission, index) => {
    const m = structuredClone(mission);
    m.resident = location.names[m.resident] || m.resident;
    if (m.weatherQuest || m.sectionQuest || m.communityQuest) {
      m.title = location.city + ' · ' + m.title;
      return m;
    }
    const names =
      location.id === 'kyoto'
        ? [
            'Courtyard Lanterns',
            'Welcome to the Timber House',
            'Rain-Aware Courtyard Watering',
            'Keep the Timber Room Comfortable',
            'Secure the Workshop',
            'Protect the Courtyard Pump',
            'Courtyard Greenhouse',
            'Connected Kyoto Home',
          ]
        : location.id === 'marrakech'
          ? [
              'Light the Courtyard',
              'Welcome to the Riad',
              'Irrigate with a Water Reserve',
              'Keep the Shaded Room Comfortable',
              'Guard the Utility Workshop',
              'Protect the Riad Water Supply',
              'Shaded Garden Control',
              'Connected Marrakech Home',
            ]
          : [
              'Veranda Path Lights',
              'Welcome to the Veranda',
              'Rain-Aware Native Garden',
              'Cool the Veranda Room',
              'Guard the Workshop',
              'Protect the Rainwater Pump',
              'Garden Nursery Ventilation',
              'Connected Brisbane Home',
            ];
    m.title = names[index];
    m.quote = residentSays(
      location,
      index === 0
        ? 'our ' +
            (location.id === 'brisbane'
              ? 'veranda path'
              : ['kyoto', 'marrakech'].includes(location.id)
                ? 'courtyard path'
                : 'garden path') +
            ' gets dark after sunset. Can the lights come on when it gets dark and go off in daylight?'
        : index === 1
          ? 'I’d like the entrance light to come on when someone walks up, and go off once the entrance is empty.'
          : index === 2
            ? location.id === 'marrakech'
              ? 'we water the plants from the tank, but it must always keep a reserve. Please stop before the soil gets too wet.'
              : 'the garden needs water when it’s dry, but watering in the rain wastes our tank. Can you add a rain interlock?'
            : mission.quote.replace(/[“”]/g, ''),
    );
    if (index === 2) {
      if (location.id === 'marrakech') {
        m.conditions = ['soil < 2400 && tank > 400'];
        m.goal =
          'Run the pump below soil reading 2400, but only while the tank reading is above 400. Stop at soil 2400 or above, or at tank 400 or below.';
        m.hint =
          'Use soil < 2400 && tank > 400 in Arduino, or and in Python. A tank reading of exactly 400 is the reserve, so the pump must be off.';
        m.scenarios.push(['Tank reserve boundary', { soil: 10, tank: 400 / 40.95 }, [0]]);
      } else {
        m.ids.push('rain');
        m.conditions = ['soil < 2400 && tank > 0 && rain < 400'];
        m.goal =
          'Run the pump below soil reading 2400 while the tank reading is above 0 and the rain reading is below 400. Stop at soil 2400 or above, rain 400 or above, or an empty tank.';
        m.hint =
          'Combine soil < 2400, tank > 0 and rain < 400 with && in Arduino, or and in Python. Turn the pump off in the else branch.';
        m.scenarios.push(
          ['Rain at the interlock boundary', { soil: 10, tank: 80, rain: 400 / 40.95 }, [0]],
          ['Dry soil during heavy rain', { soil: 10, tank: 80, rain: 80 }, [0]],
          ['Just below rain boundary', { soil: 10, tank: 80, rain: 399 / 40.95 }, [1]],
        );
      }
    }
    if (location.missionNames) m.title = location.missionNames[index];
    else if (!['kyoto', 'marrakech', 'brisbane'].includes(location.id)) {
      m.title = [
        location.city + ' Path Lighting',
        'Welcome to ' + location.city,
        location.city + ' Garden Watering',
        location.city + ' Ventilation',
        location.city + ' Weather Alert',
        location.city + ' Water Reserve',
        location.city + ' Greenhouse',
        location.city + ' Connected Home',
      ][index];
    }
    return m;
  });
}

export function progressForLocation(state, id) {
  const p = id === 'legacy' ? state : state.locationProgress?.[id];
  return {
    completed: questCompletions(p?.completed).length,
    total: missions.length * (id === 'legacy' ? 1 : 2),
    xp: Object.entries(p?.completed || {})
      .filter(([key]) => isQuestKey(key))
      .reduce((s, [, m]) => s + (m.xp || 0), 0),
  };
}

export function adaptMissions(base, location, difficulty = 'advanced') {
  const list = regionalBaseMissions(base, location);
  if (!location) return list;
  return list.map((m, index) => {
    m.difficulty = difficulty;
    if (m.weatherQuest) {
      if (difficulty === 'advanced') Object.assign(m, structuredClone(m.advanced));
      m.learn = [
        ...m.learn,
        difficulty === 'advanced' ? 'Multiple weather checks' : 'One weather decision',
      ];
      return m;
    }
    m.learn = [
      ...m.learn,
      difficulty === 'advanced'
        ? 'Multiple inputs & safety interlocks'
        : 'One sensor, one decision',
    ];
    if (index === 2 && difficulty === 'beginner') {
      m.ids = ['soil', 'pump'];
      m.conditions = ['soil < 2400'];
      m.goal = 'Water below soil reading 2400 and stop at 2400 or above.';
      m.hint = 'Compare soil < 2400. Write HIGH to start the pump and LOW to stop it.';
      m.quote = residentSays(
        location,
        'the garden dries out quickly. Can the pump water it when the soil is dry and stop once it’s moist?',
      );
      m.scenarios = m.scenarios
        .filter(
          (s) =>
            !s[0].includes('tank') &&
            !s[0].includes('Tank') &&
            !s[0].includes('Rain') &&
            !s[0].includes('rain') &&
            !s[0].includes('reserve') &&
            !s[0].includes('heavy'),
        )
        .filter((s) => s[0] !== 'Empty tank');
    }
    if (difficulty === 'advanced' && index === 2 && ['desert', 'dry'].includes(location.climate)) {
      m.ids = ['soil', 'pump', 'level', 'temp'];
      m.conditions = ['soil < 2400 && tank > 400 && temp < 30'];
      m.goal =
        'Run the pump below soil reading 2400, but only while the tank reading is above 400 and the temperature is below 30°C.';
      m.hint =
        'Combine soil < 2400, tank > 400 and temp < 30 with AND. Each boundary (2400, 400, 30) turns the pump off.';
      m.quote = residentSays(
        location,
        'water is scarce and the afternoons are hot. Can the pump water dry soil only when the tank has a reserve and it isn’t too hot?',
      );
      m.scenarios = [
        ['Cool and dry', { soil: 20, tank: 80, temp: 24 }, [1]],
        ['At target', { soil: 2400 / 40.95, tank: 80, temp: 24 }, [0]],
        ['Tank reserve', { soil: 10, tank: 400 / 40.95, temp: 24 }, [0]],
        ['Too hot to water', { soil: 10, tank: 80, temp: 30 }, [0]],
        ['Empty supply', { soil: 10, tank: 0, temp: 24 }, [0]],
      ];
    }
    if (index === 4 && ['cold', 'highland'].includes(location.climate)) {
      m.ids = difficulty === 'advanced' ? ['outside', 'buzzer', 'button'] : ['outside', 'buzzer'];
      m.title = location.city + ' Frost Watch';
      m.conditions = [
        difficulty === 'advanced' ? 'outdoorTemp <= 2 && armed == 1' : 'outdoorTemp <= 2',
      ];
      m.goal =
        'Sound a frost alert at 2°C or below' +
        (difficulty === 'advanced' ? ' only when monitoring is armed.' : '.');
      m.hint =
        'The outdoor temperature channel returns degrees Celsius. Use outdoorTemp <= 2' +
        (difficulty === 'advanced' ? ' AND armed == 1.' : '.');
      m.quote = residentSays(
        location,
        'frost can kill the seedlings overnight. Can you sound an alert when it gets close to freezing' +
          (difficulty === 'advanced' ? ', while frost monitoring is switched on?' : '?'),
      );
      m.scenarios = [
        ['Mild weather', { outdoorTemp: 8, armed: 1 }, [0]],
        ['Frost boundary', { outdoorTemp: 2, armed: 1 }, [1]],
        ['Below freezing', { outdoorTemp: -3, armed: 1 }, [1]],
        ...(difficulty === 'advanced'
          ? [['Monitoring disabled', { outdoorTemp: -3, armed: 0 }, [0]]]
          : []),
      ];
    }
    if (index === 4 && ['monsoon', 'tropical'].includes(location.climate)) {
      m.ids = difficulty === 'advanced' ? ['rain', 'buzzer', 'level'] : ['rain', 'buzzer'];
      m.title = location.city + ' Rain & Drainage Alert';
      m.conditions = [difficulty === 'advanced' ? 'rain >= 2000 || tank >= 3900' : 'rain >= 2000'];
      m.goal =
        'Sound an alert at rain reading 2000 or above' +
        (difficulty === 'advanced' ? ', or when the tank reading is 3900 or above.' : '.');
      m.hint = 'Use rain >= 2000' + (difficulty === 'advanced' ? ' OR tank >= 3900.' : '.');
      m.quote = residentSays(
        location,
        'heavy rain can flood the yard. Can you sound an alert when a downpour starts' +
          (difficulty === 'advanced' ? ', or when the tank is about to overflow?' : '?'),
      );
      m.scenarios = [
        ['Light rain', { rain: 10, tank: 40 }, [0]],
        ['Heavy rain boundary', { rain: 2000 / 40.95, tank: 40 }, [1]],
        ['Downpour', { rain: 90, tank: 40 }, [1]],
        ...(difficulty === 'advanced'
          ? [['Overflow risk', { rain: 0, tank: 3900 / 40.95 }, [1]]]
          : []),
      ];
    }
    if (
      index === 3 &&
      difficulty === 'advanced' &&
      !['tropical', 'monsoon'].includes(location.climate)
    ) {
      m.ids = ['temp', 'fan', 'occupancy'];
      m.conditions = ['temp > 27 && occupied == 1'];
      m.goal = 'Cool above 27°C only when the home is occupied.';
      m.hint =
        'Combine temp > 27 AND occupied == 1. Leave the fan off in an empty room, however hot it is.';
      m.scenarios.push(['Empty hot room', { temp: 32, occupied: 0 }, [0]]);
    }
    if (index === 3 && ['tropical', 'monsoon'].includes(location.climate)) {
      m.ids = difficulty === 'advanced' ? ['humidity', 'fan', 'temp'] : ['humidity', 'fan'];
      m.conditions = [difficulty === 'advanced' ? 'humidity > 70 || temp > 28' : 'humidity > 70'];
      m.goal =
        'Run the fan above 70% humidity' +
        (difficulty === 'advanced' ? ' or above 28°C.' : '. Stop at 70% or below.');
      m.hint =
        'The humidity channel returns a percentage. Use humidity > 70' +
        (difficulty === 'advanced' ? ' OR temp > 28.' : '.');
      m.quote = residentSays(
        location,
        'the air gets heavy and damp in the wet season. Can the fan run when it gets humid' +
          (difficulty === 'advanced' ? ' or hot?' : '?'),
      );
      m.scenarios = [
        ['Comfortable', { humidity: 50, temp: 24 }, [0]],
        ['Humid room', { humidity: 80, temp: 24 }, [1]],
        ['Humidity boundary', { humidity: 70, temp: 24 }, [0]],
        ...(difficulty === 'advanced' ? [['Hot but dry', { humidity: 40, temp: 30 }, [1]]] : []),
      ];
    }
    if (index === 5 && location.id === 'hue') {
      m.ids = difficulty === 'advanced' ? ['pond', 'buzzer', 'rain'] : ['pond', 'buzzer'];
      m.title = 'Hue Pond-Level Monitor';
      m.conditions = [
        difficulty === 'advanced' ? 'pond < 1000 || pond > 3700 || rain > 2000' : 'pond < 1000',
      ];
      m.goal =
        'Sound the alert below pond reading 1000' +
        (difficulty === 'advanced'
          ? ', above pond reading 3700, or when the rain reading is above 2000.'
          : '. Keep it off at 1000 or above.');
      m.hint =
        difficulty === 'advanced'
          ? 'Use pond < 1000 || pond > 3700 || rain > 2000. Any one of the three sounds the alert.'
          : 'Read the pond channel and compare pond < 1000.';
      m.quote = residentSays(
        location,
        difficulty === 'advanced'
          ? 'the pond drops in the dry season and floods in the wet. Can you warn us when it gets too low, too high, or when heavy rain comes?'
          : 'the pond drops in the dry season. Can you warn us when the level gets too low?',
      );
      m.scenarios = [
        ['Healthy pond', { pond: 60, rain: 0 }, [0]],
        ['Low pond', { pond: 10, rain: 0 }, [1]],
        ['Low boundary', { pond: 1000 / 40.95, rain: 0 }, [0]],
        ...(difficulty === 'advanced'
          ? [
              ['Flooded pond', { pond: 95, rain: 0 }, [1]],
              ['Heavy rain', { pond: 60, rain: 80 }, [1]],
            ]
          : []),
      ];
    }
    if (index === 6 && difficulty === 'beginner') {
      m.ids = ['temp', 'fan'];
      m.conditions = ['temp > 27'];
      m.goal = 'Ventilate the greenhouse above 27°C; stop at 27°C or below.';
      m.hint = 'Use one comparison, temp > 27, with an else branch that turns the fan off.';
      m.quote = residentSays(
        location,
        'the greenhouse overheats on sunny afternoons. Can the fan run when it gets too warm?',
      );
      m.scenarios = [
        ['Cool greenhouse', { temp: 20 }, [0]],
        ['Hot greenhouse', { temp: 30 }, [1]],
        ['Boundary', { temp: 27 }, [0]],
      ];
    }
    if (index === 7 && difficulty === 'beginner') {
      m.ids = ['ldr', 'led', 'pir', 'porch'];
      m.conditions = ['light < 1800', 'motion == 1'];
      m.goal =
        'Turn the path lights on below light reading 1800 and the porch light on while motion is HIGH. Each one turns off otherwise.';
      m.hint = 'Use two separate if/else blocks, one for each output.';
      m.quote = residentSays(
        location,
        'the path lights and porch light each work on their own. Can one controller run both?',
      );
      m.scenarios = [
        ['Bright and empty', { light: 80, motion: 0 }, [0, 0]],
        ['Dark arrival', { light: 10, motion: 1 }, [1, 1]],
        ['Motion only', { light: 80, motion: 1 }, [0, 1]],
        ['Dark only', { light: 10, motion: 0 }, [1, 0]],
      ];
    }
    if (difficulty === 'advanced' && index === 0) {
      m.ids = ['ldr', 'led', 'button'];
      m.conditions = ['light < 1800 && armed == 1'];
      m.goal =
        'Turn the path lights on below light reading 1800, but only while the lighting switch (armed) is HIGH.';
      m.hint = 'Use light < 1800 AND armed == 1.';
      m.scenarios.push(['Lighting manually disabled', { light: 10, armed: 0 }, [0]]);
    }
    return applyFarmQuest(m, index, location, difficulty);
  });
}
