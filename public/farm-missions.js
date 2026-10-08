// One signature quest per Victorian farm. Each replaces a home quest with the same slot and
// drives something the animals respond to in the 3D farm (see updateFarm in farm-assets.js).
const quests = {
  // Orchard: the hen-house door opens in daylight and closes at dusk once the hens are in.
  orchard: {
    index: 0,
    title: 'Hen-House Door at Dusk',
    badge: 'Fox proof',
    quote:
      'Foxes come out after dark. Can the hen-house door open in the morning and close at dusk, once the hens have gone in to roost?',
    learn: ['Analogue input', 'Farm automation', 'Motorised door'],
    beginner: {
      ids: ['ldr', 'gate'],
      conditions: ['light >= 1800'],
      goal: 'Open the hen-house door (the motorised gate) at a light reading of 1800 or above. Close it below 1800.',
      hint: 'Write HIGH to the gate when light >= 1800 and LOW otherwise. Watch the hens walk in at dusk.',
      scenarios: [
        ['Bright morning', { light: 90 }, [1]],
        ['Dusk', { light: 15 }, [0]],
        ['At threshold', { light: 1800 / 40.95 }, [1]],
        ['Just below threshold', { light: 1799 / 40.95 }, [0]],
      ],
    },
    advanced: {
      ids: ['ldr', 'gate', 'pir'],
      conditions: ['light >= 1800 || motion == 1'],
      goal: 'Open the door at light 1800 or above, and keep it open while the doorway motion sensor sees a late hen. Close it otherwise.',
      hint: 'Use OR: light >= 1800 || motion == 1. A hen still in the doorway must never be shut out.',
      scenarios: [
        ['Bright morning', { light: 90, motion: 0 }, [1]],
        ['Dusk, all hens in', { light: 15, motion: 0 }, [0]],
        ['Late hen in the doorway', { light: 15, motion: 1 }, [1]],
        ['At threshold', { light: 1800 / 40.95, motion: 0 }, [1]],
        ['Just below threshold', { light: 1799 / 40.95, motion: 0 }, [0]],
      ],
    },
  },
  // Sheep: the bore pump refills the stock trough; thirsty sheep crowd round an empty trough.
  sheep: {
    index: 5,
    title: 'Fill the Stock Trough',
    badge: 'Drover',
    quote:
      'The flock drinks the trough dry on warm days. Can the pump top it up from the bore whenever the trough level drops?',
    learn: ['Level sensing', 'Refill control', 'Interlocks'],
    beginner: {
      ids: ['pond', 'pump'],
      conditions: ['pond < 2400'],
      goal: 'Run the pump while the trough level reading (the pond probe) is below 2400. Stop at 2400 or above.',
      hint: 'Compare pond < 2400. The sheep gather at the trough when it runs low.',
      scenarios: [
        ['Empty trough', { pond: 5 }, [1]],
        ['Full trough', { pond: 90 }, [0]],
        ['At target', { pond: 2400 / 40.95 }, [0]],
        ['Just below target', { pond: 2399 / 40.95 }, [1]],
      ],
    },
    advanced: {
      ids: ['pond', 'pump', 'level'],
      conditions: ['pond < 2400 && tank > 400'],
      goal: 'Refill the trough below level 2400, but only while the bore tank reading is above 400.',
      hint: 'Use pond < 2400 && tank > 400. A tank reading of exactly 400 must stop the pump.',
      scenarios: [
        ['Empty trough', { pond: 5, tank: 80 }, [1]],
        ['Full trough', { pond: 90, tank: 80 }, [0]],
        ['At target', { pond: 2400 / 40.95, tank: 80 }, [0]],
        ['Bore tank at reserve', { pond: 5, tank: 400 / 40.95 }, [0]],
        ['Bore tank empty', { pond: 5, tank: 0 }, [0]],
      ],
    },
  },
  // Dairy: the dairy gate opens when a cow arrives so the herd can walk to the milking shed.
  dairy: {
    index: 1,
    title: 'Open the Dairy Gate',
    badge: 'Milking time',
    quote:
      'Twice a day the herd walks up to the milking shed. Can the gate open when a cow arrives and close behind the herd?',
    learn: ['Digital input', 'Motorised gate', 'Stock handling'],
    beginner: {
      ids: ['pir', 'gate'],
      conditions: ['motion == 1'],
      goal: 'Open the dairy gate when the motion sensor sees a cow (HIGH). Close it when the lane is empty.',
      hint: 'digitalRead the motion sensor. Write HIGH to the gate on motion and LOW otherwise.',
      scenarios: [
        ['Empty lane', { motion: 0 }, [0]],
        ['Cow at the gate', { motion: 1 }, [1]],
        ['Herd through', { motion: 0 }, [0]],
      ],
    },
    advanced: {
      ids: ['pir', 'gate', 'button'],
      conditions: ['motion == 1 && armed == 1'],
      goal: 'Open the gate for a cow only while the milking-time switch (the arm button) is HIGH.',
      hint: 'Use motion == 1 && armed == 1. Cows wandering up outside milking time stay in the paddock.',
      scenarios: [
        ['Milking, cow arrives', { motion: 1, armed: 1 }, [1]],
        ['Milking, lane empty', { motion: 0, armed: 1 }, [0]],
        ['Cow outside milking time', { motion: 1, armed: 0 }, [0]],
        ['Quiet paddock', { motion: 0, armed: 0 }, [0]],
      ],
    },
  },
  // Horses: misting sprinklers on the paddock shelters cool the horses on hot days.
  horse: {
    index: 3,
    title: 'Cool the Horses',
    badge: 'Horse whisperer',
    quote:
      'On hot afternoons the horses crowd into the shelters. Can the misting sprinklers come on when it gets too hot?',
    learn: ['Temperature', 'Animal welfare', 'Solenoid valve'],
    beginner: {
      ids: ['temp', 'valve'],
      conditions: ['temp > 30'],
      goal: 'Open the misting valve above 30°C. Close it at 30°C or below.',
      hint: 'The temperature channel returns °C. Compare temp > 30 and use an else branch.',
      scenarios: [
        ['Mild day', { temp: 22 }, [0]],
        ['Heatwave', { temp: 36 }, [1]],
        ['At boundary', { temp: 30 }, [0]],
        ['Above boundary', { temp: 31 }, [1]],
      ],
    },
    advanced: {
      ids: ['temp', 'valve', 'level'],
      conditions: ['temp > 30 && tank > 400'],
      goal: 'Mist above 30°C, but keep a reserve: only while the tank reading is above 400.',
      hint: 'Use temp > 30 && tank > 400. Drinking water matters more than misting.',
      scenarios: [
        ['Mild day', { temp: 22, tank: 80 }, [0]],
        ['Heatwave', { temp: 36, tank: 80 }, [1]],
        ['At boundary', { temp: 30, tank: 80 }, [0]],
        ['Heatwave, tank at reserve', { temp: 36, tank: 400 / 40.95 }, [0]],
      ],
    },
  },
};

export const farmQuest = (location) => (location?.farm ? quests[location.style] : null);

// Replaces the farm's signature slot; other quests keep their farm-named home versions.
export function applyFarmQuest(m, index, location, difficulty) {
  const q = farmQuest(location);
  if (!q || q.index !== index) return m;
  const level = difficulty === 'advanced' ? q.advanced : q.beginner;
  Object.assign(m, structuredClone(level), {
    title: q.title,
    badge: q.badge,
    farmQuest: location.style,
    quote: '“' + q.quote + '”',
    learn: [
      ...q.learn,
      difficulty === 'advanced'
        ? 'Multiple inputs & safety interlocks'
        : 'One sensor, one decision',
    ],
  });
  return m;
}
