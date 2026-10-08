import { esc } from './html.js';
// Markup for the Dashboard tab: a phone-style dashboard that talks to the running program over
// the simulated MQTT broker. Controls are drawn once; the live tiles and log redraw as messages
// arrive (dashboardLiveHTML), so typing and clicking are never interrupted.

const latest = (messages, topic) => messages.findLast((m) => m.topic === topic);
function tileText(widget, message) {
  if (!message) return '–';
  const v = message.payload;
  if (widget.type === 'alert') return Number(v) ? widget.on : widget.off;
  if (widget.type === 'status') return Number(v) ? 'On' : 'Off';
  return (
    String(typeof v === 'number' ? Math.round(v * 10) / 10 : v) +
    (widget.unit ? ' ' + widget.unit : '')
  );
}
// Tiles for the quest's widgets plus any other topic the program publishes, then the message log.
export function dashboardLiveHTML(messages, widgets = []) {
  const shown = widgets.filter((w) => w.type !== 'switch'),
    extra = [...new Set(messages.filter((m) => m.client !== 'dashboard').map((m) => m.topic))]
      .filter((t) => !widgets.some((w) => w.topic === t))
      .map((topic) => ({ type: 'value', topic, label: topic }));
  const tiles = [...shown, ...extra];
  return (
    (tiles.length
      ? '<div class="dash-tiles">' +
        tiles
          .map((w) => {
            const m = latest(messages, w.topic),
              alert = w.type === 'alert' && m && Number(m.payload);
            return (
              '<div class="dash-tile' +
              (alert ? ' alert' : '') +
              '"><span>' +
              esc(w.label) +
              '</span><strong>' +
              esc(tileText(w, m)) +
              '</strong><small>' +
              esc(w.topic) +
              '</small></div>'
            );
          })
          .join('') +
        '</div>'
      : '<p class="dash-empty">No messages yet. Publish a reading from your program to see it here.</p>') +
    '<h4>Messages</h4><ol class="dash-log" aria-label="Latest MQTT messages">' +
    messages
      .slice(-8)
      .reverse()
      .map(
        (m) =>
          '<li><code>' +
          esc(m.topic) +
          '</code> = ' +
          esc(String(m.payload)) +
          ' <small>' +
          esc(m.client) +
          ' · ' +
          esc(m.status) +
          '</small></li>',
      )
      .join('') +
    '</ol>'
  );
}

export function dashboardHTML({
  quests,
  active,
  passed,
  running,
  brokerOnline,
  switches,
  messages,
}) {
  const widgets = active?.widgets || [];
  return (
    '<div class="lab-panel dashboard"><div class="bench-heading"><div><h3>Dashboard</h3><p>A phone-style dashboard connected to your running program over MQTT. The broker is simulated in this browser; nothing is sent online.</p></div>' +
    (active ? '<button class="outline" id="exitFault">Return to quest</button>' : '') +
    '</div><div class="fault-grid">' +
    quests
      .map(
        (q) =>
          '<button class="fault-card' +
          (active?.id === q.id ? ' selected' : '') +
          '" data-dashboard-quest="' +
          q.id +
          '"><span>' +
          esc(q.type) +
          '</span><strong>' +
          esc(q.title) +
          '</strong><small>' +
          (passed[q.id] ? '✓ Passed' : 'Write → run → test') +
          '</small></button>',
      )
      .join('') +
    '</div>' +
    (active
      ? '<div class="debug-card"><strong>' +
        esc(active.title) +
        '</strong><p>' +
        esc(active.goal) +
        '</p><button class="outline" id="progressiveHint">Reveal next hint</button><p id="faultHint"></p><button class="primary" id="testFault">Test my program</button></div>'
      : '') +
    '<section class="dash-phone" aria-label="Dashboard">' +
    (running
      ? ''
      : '<p class="dash-empty">Run your program (▶ Run in the Code editor) to connect the dashboard.</p>') +
    (widgets.some((w) => w.type === 'switch')
      ? '<div class="dash-controls">' +
        widgets
          .filter((w) => w.type === 'switch')
          .map(
            (w) =>
              '<button class="dash-switch" data-publish-topic="' +
              esc(w.topic) +
              '" aria-pressed="' +
              !!switches[w.topic] +
              '"' +
              (running ? '' : ' disabled') +
              '>' +
              esc(w.label) +
              ': ' +
              (switches[w.topic] ? 'On' : 'Off') +
              '</button>',
          )
          .join('') +
        '</div>'
      : '') +
    '<div id="dashLive">' +
    dashboardLiveHTML(messages, widgets) +
    '</div><details class="dash-tools"><summary>Test like an attacker or a network fault</summary><form id="dashSend" class="dash-send"><label>Topic <input id="dashTopic" value="home/gate" maxlength="128" autocomplete="off"></label><label>Number <input id="dashPayload" type="number" value="1"></label><label>From <select id="dashClient"><option value="dashboard">Your dashboard</option><option value="stranger">A stranger</option></select></label><button class="outline" type="submit"' +
    (running ? '' : ' disabled') +
    '>Send</button></form><label class="dash-broker"><input type="checkbox" id="dashBroker"' +
    (brokerOnline ? ' checked' : '') +
    (running ? '' : ' disabled') +
    '> Network (MQTT broker) online</label></details></section></div>'
  );
}
