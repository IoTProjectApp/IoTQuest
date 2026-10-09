import { esc } from './html.js';
import { SimulatedBroker } from './mqtt.js';
import { Runtime } from './runtime.js';
import { defaults, baseEnv } from './missions.js';
import { scenarioOptions } from './lab-panels.js';
import { adcRead, isPico } from './signals.js';
const $ = (id) => document.getElementById(id);
export function advancedMenu(ctx) {
  ctx.modal(
    'Advanced learning tools',
    '<div class="tools-grid"><button id="openDebugger">Pause, inspect & step real execution</button><button id="openNetwork">Simulated MQTT · paired controllers</button><button id="openTeacher">Teacher dashboard · local demonstration</button><button id="openRoles">Cooperative roles · local mode</button><button id="openUpgrades">Device upgrades</button><button id="openRoutines">Resident routines</button></div>',
  );
  $('openDebugger').onclick = () => debuggerPanel(ctx);
  $('openNetwork').onclick = () => networkPanel(ctx);
  $('openTeacher').onclick = () => teacherPanel(ctx);
  $('openRoles').onclick = () => rolesPanel(ctx);
  $('openUpgrades').onclick = () => upgradePanel(ctx);
  $('openRoutines').onclick = () => routinesPanel(ctx);
}
export function debuggerPanel(ctx) {
  ctx.pause();
  ctx.modal(
    'Execution debugger',
    '<div class="guide"><p>Pause holds the simulation clock and controller. Step executes the next parsed statement, conditional decision, or loop iteration. User function calls execute atomically within a step. Run starts fresh; Resume finishes the paused tick.</p><div class="editor-actions"><button class="primary" id="debugStep">Step statement</button><button class="outline" id="debugResume">Resume execution</button></div><p id="debugLocation">Ready to inspect.</p><pre id="debugVariables"></pre><p>Unsupported: arrays, pointers, classes, for loops, external libraries, interrupts and real network/file access.</p></div>',
  );
  $('debugStep').onclick = ctx.debugStep;
  $('debugResume').onclick = () => {
    ctx.resume();
    $('modal').close();
  };
  ctx.refreshDebug();
}
function networkPanel(ctx) {
  const lab = ctx.lab(),
    broker = new SimulatedBroker(),
    board = ctx.state.board,
    python = ctx.state.language === 'python',
    input = defaults(['temp'], board),
    output = defaults(['fan'], board);
  let a,
    b,
    ticks = 0;
  const sourceA = python
    ? `from machine import Pin, ADC\nfrom iotquest import mqttConnect, mqttPublish, mqttConnected, mqttReconnect\nimport time\nsensor = ADC(Pin(${input[0].pin}))\nmqttConnect("A")\nwhile True:\n    if not mqttConnected():\n        mqttReconnect()\n    if sensor.${adcRead(isPico(board), 'temp')} > 27:\n        mqttPublish("house/B/fan", 1)\n    else:\n        mqttPublish("house/B/fan", 0)\n    time.sleep_ms(200)\n`
    : `void setup() { mqttConnect("A"); }\nvoid loop() {\n  if (!mqttConnected()) { mqttReconnect(); }\n  if (analogRead(${input[0].pin}) > 27) {\n    mqttPublish("house/B/fan", 1);\n  } else { mqttPublish("house/B/fan", 0); }\n  delay(200);\n}\n`;
  const sourceB = python
    ? `from machine import Pin\nfrom iotquest import mqttConnect, mqttSubscribe, mqttRead, mqttConnected, mqttReconnect\nimport time\nfan = Pin(${output[0].pin}, Pin.OUT)\nmqttConnect("B")\nmqttSubscribe("house/B/fan")\nwhile True:\n    if not mqttConnected():\n        mqttReconnect()\n        mqttSubscribe("house/B/fan")\n    if mqttConnected():\n        fan.value(mqttRead("house/B/fan"))\n    else:\n        fan.value(0)\n    time.sleep_ms(200)\n`
    : `void setup() { pinMode(${output[0].pin}, OUTPUT); mqttConnect("B"); mqttSubscribe("house/B/fan"); }\nvoid loop() {\n  if (!mqttConnected()) { mqttReconnect(); mqttSubscribe("house/B/fan"); }\n  if (mqttConnected()) { digitalWrite(${output[0].pin}, mqttRead("house/B/fan")); }\n  else { digitalWrite(${output[0].pin}, LOW); }\n  delay(200);\n}\n`;
  ctx.modal(
    'MQTT networking lab',
    '<p class="local-mode-note">Simulated local MQTT QoS 0, two virtual houses. No external broker or multiplayer server. Messages can be dropped during a connection loss; code must reconnect and safe outputs must be chosen explicitly.</p><div class="network-editors"><label>House A · calibrated temperature → publisher<textarea id="mqttCodeA" spellcheck="false"></textarea></label><label>House B · GPIO ' +
      output[0].pin +
      ' fan → subscriber<textarea id="mqttCodeB" spellcheck="false"></textarea></label></div><div class="advanced-form"><label>Temperature °C<input id="networkTemperature" type="number" value="30"></label><label>Broker available<input id="networkAvailable" type="checkbox" checked></label></div><div class="editor-actions"><button class="primary" id="networkTick">Run 1 simulated second</button><button class="outline" id="networkReset">Restart controllers</button></div><pre id="networkStatus"></pre><p class="guide">Challenge: publish temperature-driven commands, keep the fan off after connection loss, and reconnect when the broker returns. Both editors are interpreted; no output is predetermined.</p>',
  );
  $('mqttCodeA').value = lab.mqttCodeA || sourceA;
  $('mqttCodeB').value = lab.mqttCodeB || sourceB;
  const initialize = () => {
    a = new Runtime($('mqttCodeA').value, ctx.state.language, input, board);
    b = new Runtime($('mqttCodeB').value, ctx.state.language, output, board);
    a.broker = b.broker = broker;
    ticks = 0;
    b.step(baseEnv, 0);
  };
  $('networkReset').onclick = () => {
    a = null;
    b = null;
    broker.clients.clear();
    broker.messages = [];
    $('networkStatus').textContent = 'Controllers reset. Run to start.';
  };
  $('networkAvailable').onchange = () => broker.setAvailable($('networkAvailable').checked);
  for (const id of ['mqttCodeA', 'mqttCodeB'])
    $(id).oninput = () => {
      ctx.lab()[id] = $(id).value;
      a = null;
      b = null;
      ctx.save();
    };
  $('networkTick').onclick = () => {
    try {
      if (!a) initialize();
      for (let i = 0; i < 5; i++) {
        broker.now = ++ticks * 200;
        a.step({ ...baseEnv, temp: Number($('networkTemperature').value) }, 200);
        b.step(baseEnv, 200);
      }
      const on = (b.outputs[output[0].pin] || 0) > 0;
      $('networkStatus').textContent =
        'Clock ' +
        ticks * 0.2 +
        ' s · A ' +
        (broker.connected('A') ? 'connected' : 'offline') +
        ' · B ' +
        (broker.connected('B') ? 'connected' : 'offline') +
        ' · Fan ' +
        (on ? 'ON' : 'OFF') +
        '\n' +
        broker.messages
          .slice(-8)
          .map((m) => m.topic + ' = ' + m.payload + ' · ' + m.status)
          .join('\n');
      ctx.recordEvidence({
        type: 'mqtt',
        at: new Date().toISOString(),
        sourceA: $('mqttCodeA').value,
        sourceB: $('mqttCodeB').value,
        messages: broker.messages.slice(-10),
        outputs: b.outputs,
      });
      ctx.save();
    } catch (e) {
      $('networkStatus').textContent = 'Program error: ' + e.message;
    }
  };
}
function teacherPanel(ctx) {
  const all = [['Original home', ctx.state], ...Object.entries(ctx.state.locationProgress || {})],
    rows = [];
  for (const [location, p] of all)
    for (const [key, project] of Object.entries(p.projects || {}))
      rows.push({
        location,
        project: key,
        code: project.code,
        devices: project.devices,
        lab: project.lab,
        completion: p.completed?.[key] || null,
      });
  ctx.modal(
    'Teacher dashboard · local demonstration',
    '<p class="local-mode-note">This dashboard reviews this browser’s projects only. There are no student accounts, shared submissions, or classroom storage. Assignments and reports are local demonstrations.</p><div class="advanced-form"><label>Mission<select id="teacherMission">' +
      ctx.missions
        .map((m, i) => '<option value="' + i + '">' + esc(m.title) + '</option>')
        .join('') +
      '</select></label><label>Difficulty<select id="teacherDifficulty"><option value="beginner">Beginner</option><option value="advanced">Advanced</option></select></label><label>Practice scenario<select id="teacherScenario">' +
      scenarioOptions() +
      '</select></label><button class="primary" id="assignLocal">Assign on this device</button></div><table class="teacher-report"><thead><tr><th>Location</th><th>Project</th><th>Tests</th><th>Evidence</th></tr></thead><tbody>' +
      rows
        .map(
          (r, i) =>
            '<tr><td>' +
            esc(r.location) +
            '</td><td><button data-review="' +
            i +
            '">' +
            esc(r.project) +
            '</button></td><td>' +
            (r.completion
              ? r.completion.imported
                ? 'Passed · imported code'
                : 'Passed'
              : 'Pending') +
            '</td><td>' +
            (r.lab?.evidence?.length || 0) +
            '</td></tr>',
        )
        .join('') +
      '</tbody></table><button class="outline" id="downloadAssessment">Download assessment JSON</button>',
  );
  $('assignLocal').onclick = () => {
    ctx.applyAssignment(
      Number($('teacherMission').value),
      $('teacherDifficulty').value,
      $('teacherScenario').value,
    );
    $('modal').close();
  };
  document
    .querySelectorAll('[data-review]')
    .forEach(
      (btn) =>
        (btn.onclick = () =>
          ctx.modal(
            'Local submitted evidence',
            '<div class="guide"><pre>' +
              esc(JSON.stringify(rows[Number(btn.dataset.review)], null, 2)) +
              '</pre></div>',
          )),
    );
  $('downloadAssessment').onclick = () =>
    ctx.download(
      'iot-quest-local-assessment.json',
      JSON.stringify(
        {
          mode: 'local demonstration',
          student: ctx.state.name,
          exportedAt: new Date().toISOString(),
          projects: rows,
        },
        null,
        2,
      ),
      'application/json',
    );
}
function rolesPanel(ctx) {
  const lab = ctx.lab();
  ctx.modal(
    'Cooperative roles · local mode',
    '<p class="local-mode-note">Shared-device role play only. Pass the device between Installer, Programmer and Tester. Progress is shared in this browser, and edits record role ownership. No remote multiplayer synchronisation is claimed.</p><div class="advanced-form"><label>Enable role ownership<input id="rolesEnabled" type="checkbox" ' +
      (lab.coopEnabled ? 'checked' : '') +
      '></label><label>Current role<select id="roleSelect"><option>Installer</option><option>Programmer</option><option>Tester</option></select></label><button class="primary" id="applyRole">Apply role</button></div><p class="guide">Installer owns device placement and wiring. Programmer owns source edits. Tester owns Run and mission tests. Turn local role mode off for individual work.</p>',
  );
  $('roleSelect').value = lab.role;
  $('applyRole').onclick = () => {
    const lab = ctx.lab();
    lab.coopEnabled = $('rolesEnabled').checked;
    lab.role = $('roleSelect').value;
    ctx.recordEvidence({
      type: 'ownership',
      role: lab.role,
      owner: ctx.state.name,
      at: new Date().toISOString(),
    });
    ctx.save();
    ctx.refresh();
    $('modal').close();
  };
}
function upgradePanel(ctx) {
  const lab = ctx.lab(),
    count = ctx.completed(),
    upgrades = [
      ['solar', 'Solar panel', 1],
      ['rainTank', 'Additional rainwater tank', 2],
      ['battery', 'Battery · 100 Wh', 3],
      ['weatherStation', 'Weather station access', 2],
      ['picoW', 'Raspberry Pi Pico W controller', 4],
    ];
  ctx.modal(
    'Device upgrades',
    '<div class="guide"><p>Complete quests to unlock upgrades. Free exploration makes every upgrade available. Solar output follows simulated sunlight, battery capacity is limited, the tank adds collection area and capacity, and the weather station records timestamped climate samples in your export.</p></div>' +
      upgrades
        .map(
          ([id, name, required]) =>
            '<div class="setting-row"><span>' +
            name +
            '<small>' +
            required +
            ' completed quests</small></span><button class="outline" data-upgrade="' +
            id +
            '" ' +
            (count < required && !ctx.state.freeExploration ? 'disabled' : '') +
            '>' +
            (lab.upgrades.includes(id) ? 'Installed' : 'Install') +
            '</button></div>',
        )
        .join(''),
  );
  document.querySelectorAll('[data-upgrade]').forEach(
    (b) =>
      (b.onclick = () => {
        const { upgrades } = ctx.lab();
        if (!upgrades.includes(b.dataset.upgrade)) upgrades.push(b.dataset.upgrade);
        ctx.save();
        upgradePanel(ctx);
      }),
  );
}
function routinesPanel(ctx) {
  ctx.modal(
    'Resident routines',
    '<div class="guide"><p>Residents sleep, leave for work, return through the entrance, garden, and use the kitchen. Their schedule follows the simulated day, and feeds occupancy, motion and door-contact inputs. Practice mission tests replace these inputs with fixed scenarios.</p></div><label class="setting-row">Enable simulated resident routines<input id="routinesEnabled" type="checkbox" ' +
      (ctx.state.routinesEnabled ? 'checked' : '') +
      '></label>',
  );
  $('routinesEnabled').onchange = () => {
    ctx.state.routinesEnabled = $('routinesEnabled').checked;
    ctx.save();
  };
}
