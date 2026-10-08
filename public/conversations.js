import { components } from './missions.js';
import { clearPath } from './world-math.js';

const ANIMATIONS = {
  led: 'the lights glow and cast a pool of light',
  porch: 'the porch lamp lights up',
  rgb: 'the lamp changes its glow',
  fan: 'the fan blades spin',
  ac: 'the cooling unit switches on',
  pump: 'water sprays onto the plants',
  valve: 'the irrigation water flows',
  gate: 'the gate opens and closes',
  servo: 'the window blind lifts and lowers',
  buzzer: 'a visible warning pulse appears',
};
export const conversationQuestions = [
  'What do you want?',
  'What will I see animated?',
  'Which components do I need?',
  'When should it start and stop?',
  'How does the weather affect it?',
  'I need help',
];

const quote = (text = '') => text.replace(/^[“"]|[”"]$/g, '');
export function createConversation({
  key,
  resident,
  quests,
  currentIndex = 0,
  completed = {},
  area = null,
}) {
  const requests = quests
    .map((mission, index) => ({ mission, index, complete: !!completed[index] }))
    .filter((r) => (area ? r.mission.area === area : r.mission.resident === resident));
  const selected =
    requests.find((r) => r.index === currentIndex) ||
    requests.find((r) => !r.complete) ||
    requests[0];
  return {
    key,
    resident,
    requests,
    selectedIndex: selected?.index ?? null,
    messages: [
      {
        speaker: 'resident',
        text: selected
          ? `Hello! ${quote(selected.mission.quote)} Ask me about ${selected.mission.title}, or pick another request below.`
          : 'Hello! I have no requests here right now. You can explore the house and garden.',
      },
    ],
  };
}

export function selectedRequest(chat) {
  return chat.requests.find((r) => r.index === chat.selectedIndex);
}
function append(chat, speaker, text) {
  chat.messages.push({ speaker, text });
  if (chat.messages.length > 24) chat.messages.splice(0, chat.messages.length - 24);
}
export function chooseRequest(chat, index) {
  const request = chat.requests.find((r) => r.index === index);
  if (!request) return false;
  chat.selectedIndex = index;
  append(chat, 'technician', `Tell me about ${request.mission.title}.`);
  append(chat, 'resident', `${quote(request.mission.quote)} ${request.mission.goal}`);
  return true;
}

export function sendConversationMessage(
  chat,
  raw,
  { failedTests = [], weatherMode = 'practice' } = {},
) {
  const text = String(raw || '')
    .trim()
    .slice(0, 240);
  if (!text) return false;
  append(chat, 'technician', text);
  const request = selectedRequest(chat),
    q = text.toLowerCase();
  if (!request) {
    append(chat, 'resident', 'I have no requests here yet. Try talking to another resident.');
    return true;
  }
  const m = request.mission,
    devices = m.ids.map((id) => components.find((d) => d.id === id)).filter(Boolean);
  let reply;
  if (/component|device|sensor|wire|wiring|parts|install/.test(q)) {
    reply = `For ${m.title}, install ${devices.map((d) => d.name).join(', ')}. Connect each device to power, ground and the GPIO you assign in Wiring.`;
    const resistors = devices.filter((d) => d.resistor).map((d) => `${d.name}: ${d.resistor}`);
    if (resistors.length) reply += ` Remember the resistors: ${resistors.join('; ')}.`;
  } else if (/animat|see|look|move|spin|glow|visual|happen/.test(q)) {
    const actions = devices
      .filter((d) => d.output)
      .map((d) => ANIMATIONS[d.id] || `${d.name} responds to your program`);
    const farm =
      m.farmQuest === 'orchard'
        ? ' The hen-house door moves, and the hens respond at dusk.'
        : m.farmQuest === 'dairy'
          ? ' The dairy-yard gates move, and the herd can enter for milking.'
          : m.farmQuest === 'sheep'
            ? ' The trough refills and the sheep respond to their water supply.'
            : m.farmQuest === 'horse'
              ? ' The shelter sprinklers mist and the horses seek shade on hot days.'
              : '';
    reply = `When your code switches the outputs, ${actions.join('; ')}.${farm} The scene follows your running code, so installing a component alone does not switch it on. ${m.goal}`;
  } else if (/weather|rain|wind|cloud|frost|humidity|climate/.test(q)) {
    const weather = devices.filter((d) =>
      ['wind', 'cloud', 'outdoorTemp', 'humidity', 'rain', 'light'].includes(d.signal),
    );
    reply = weather.length
      ? `This request reads ${weather.map((d) => d.name).join(', ')}. ${weatherMode === 'live' ? 'Those outdoor readings follow local weather, with a labelled fallback if live data is unavailable.' : 'Practice Weather lets you change those readings with sliders.'} ${m.goal} Tests use fixed conditions, so you do not have to wait for the right weather.`
      : `This request uses ${devices
          .filter((d) => !d.output)
          .map((d) => d.name)
          .join(
            ', ',
          )}. The rule is ${m.goal} You can try changing the conditions after starting your program.`;
  } else if (/help|stuck|fail|wrong|debug|error/.test(q)) {
    const failures = failedTests.filter((r) => !r.pass).slice(0, 3);
    reply = failures.length
      ? `The checks that need work are: ${failures.map((r) => r.name + ': ' + r.detail).join('; ')}. Compare your output decisions with my rule: ${m.goal} Check the Guide and Wiring, then test again.`
      : `Start with the components, then check Wiring and follow the Guide to write your own program. ${m.goal} Give each output an OFF path too, so it stops when its condition is false. Run your code, change the readings and test the boundaries.`;
  } else if (/done|finish|complete|pass/.test(q)) {
    reply = request.complete
      ? `You have passed ${m.title}. Thank you! You can review its behaviour or choose another request.`
      : `Please run the mission tests before we mark ${m.title} complete. I need to see it work in every scenario, including stopping safely. Chatting does not complete the request.`;
  } else if (/when|stop|start|rule|threshold|how|condition/.test(q)) {
    reply = `Here is exactly when it should act: ${m.goal} Check both sides of each threshold and make sure the output switches off when it should. Use “Start this request” when you are ready to build it.`;
  } else if (/want|need|request|goal|job|hello|hi\b/.test(q)) {
    reply = `${quote(m.quote)} ${m.goal}`;
  } else {
    reply = `I can explain my request, its components, when the devices should act, and what will move or light up. For ${m.title}: ${m.goal} Try one of the questions below.`;
  }
  append(chat, 'resident', reply);
  return true;
}

// Characters behind a wall are out of reach even when they are within the radius.
export function nearestCharacter(player, characters, radius = 2.2, colliders = []) {
  let nearest = null,
    distance = radius;
  for (const c of characters) {
    const d = Math.hypot(c.x - player.x, c.z - player.z);
    if (d <= distance && clearPath(player, c, colliders)) {
      nearest = c;
      distance = d;
    }
  }
  return nearest;
}
