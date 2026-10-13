// Which rigged character (public/models/people) plays each resident. The household is cast by
// hand so its five look different; everyone else is cast by gender, taken from their name or
// title (or chosen where the name could be either), with a fixed pick per person so neighbours
// vary but nobody changes from one visit to the next.

export const WOMEN = ['Sophie', 'Kate', 'Megan', 'Elizabeth', 'Martha', 'Jody', 'Shannon'];
export const MEN = ['Brian', 'Bryce', 'Josh', 'Alex', 'Adam'];

// The technician, by the appearance chosen in the settings.
export const TECHNICIAN = { '🧑‍🔧': 'Adam', '👩🏽‍🔧': 'Sophie', '👨🏻‍🔧': 'Alex' };
// The household, by role. Sam's name (and so who plays them) depends on the destination.
const HOUSEHOLD = {
  Maya: 'Elizabeth',
  Alex: 'Josh',
  'section:Bedroom': 'Megan',
  'section:Living room': 'Bryce',
};
// Women among the residents: names, titled staff, and choices for names that could be either.
const FEMALE_NAMES = new Set(
  (
    'Maya Akari Salma Amelia Olivia Sofia Mai Chloe Grace Isla Fatima Ava Emma Kate Lucy Hannah ' +
    'Priya Amira Hana Zara Leila Ruby Kiara Rosa Nadia Mei Nina Samira Lily Mila Freya Aria Avery Robin'
  ).split(' '),
);
const FEMALE_IDS = new Set([
  'Maya',
  'civic:hospital',
  'civic:school',
  'civic-section:schoolClassroom1',
  'civic-section:schoolClassroom3',
  'civic-section:policeOffice',
  'civic-section:policeJail',
  'recreation:gym',
  'recreation:zoo',
  'recreation:playground',
  'recreation:basketball',
  'openblock:football',
  'openblock:postoffice',
  'worker:shop-floor:0',
  'worker:factory-floor:4',
]);
const hash = (text) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function isWoman(id, name) {
  return FEMALE_IDS.has(id) || FEMALE_NAMES.has(name);
}
// The character model for a resident with this actor id and displayed name (or, for people
// without one, a given gender).
export function castFor(id, name, woman = isWoman(id, name)) {
  if (HOUSEHOLD[id]) return HOUSEHOLD[id];
  if (id === 'Sam') return FEMALE_NAMES.has(name) ? 'Jody' : 'Brian';
  const pool = woman ? WOMEN : MEN;
  return pool[hash(id) % pool.length];
}
