import { recreationLots } from './community-recreation.js';
import { civicLots } from './community-civic.js';
import { catalogueQuestsA } from './catalogue-quests-a.js';
import { catalogueQuestsB } from './catalogue-quests-b.js';
import { catalogueQuestsC } from './catalogue-quests-c.js';
// The IoT Quest catalogue's quests (Q001–Q100), appended after the community quests to preserve
// saved project and completion indices, in catalogue order. Quests the game already had (the
// Victorian farm quests Q021–Q025, Garden Frost Alert for Q026 and the weather quests for
// Q056–Q058) are not repeated. Home quests are offered by whoever looks after their room; quests at
// community buildings by the building's own contact, or the community technician in town.
// Each has a beginner level (the top-level fields) and an advanced level that replaces them at
// destinations played on advanced, like the weather quests.
export const catalogueQuests = [...catalogueQuestsA, ...catalogueQuestsB, ...catalogueQuestsC].sort(
  (a, b) => a.catalogue - b.catalogue,
);
for (const q of catalogueQuests) {
  if (!q.communityQuest) continue;
  const lot = [...civicLots, ...recreationLots].find((b) => b.type === q.communityType);
  q.resident = lot?.resident ?? 'Alex';
  q.role = lot?.role ?? 'Community technician';
}
