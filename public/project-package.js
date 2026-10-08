import { esc as xml } from './html.js';
import { RESOURCE_ASSUMPTIONS } from './lab.js';
// Quote CSV cells and neutralise spreadsheet formula prefixes.
const csv = (s) =>
  '"' +
  String(s)
    .replace(/^[=+\-@\t\r]/, "'$&")
    .replace(/"/g, '""') +
  '"';
export function projectFiles({
  name,
  language,
  board,
  code,
  devices,
  mission,
  results,
  lab,
  location,
  manifest = null,
}) {
  const ext = language === 'cpp' ? 'ino' : 'py',
    height = 130 + devices.length * 80;
  const rows = devices
    .map((d, i) => {
      const y = 105 + i * 80;
      return (
        '<rect x="350" y="' +
        (y - 22) +
        '" width="300" height="52" rx="5" fill="#eef3e5" stroke="#7f9870"/><text x="365" y="' +
        y +
        '" font-size="14">' +
        xml(d.name) +
        ' · GPIO ' +
        d.pin +
        '</text><path d="M 215 ' +
        y +
        ' H 350" stroke="' +
        (d.output ? '#b99058' : '#638c86') +
        '" fill="none"/><text x="235" y="' +
        (y - 8) +
        '" font-size="12">' +
        (d.output ? 'OUT' : 'IN') +
        '</text><text x="365" y="' +
        (y + 18) +
        '" font-size="11">3.3 V ' +
        (d.power ? 'connected' : 'MISSING') +
        ' · GND ' +
        (d.ground ? 'connected' : 'MISSING') +
        (d.resistor ? ' · ' + xml(d.resistor) + (d.resistorConnected ? '' : ' MISSING') : '') +
        '</text>'
      );
    })
    .join('');
  const pins =
    'Component,Controller,Signal GPIO,Power,GND,Resistor,Area\n' +
    devices
      .map((d) =>
        [
          d.name,
          board,
          d.pin,
          d.power ? '3.3 V' : 'MISSING',
          d.ground ? 'GND' : 'MISSING',
          d.resistor || 'Module driver included',
          d.area,
        ]
          .map(csv)
          .join(','),
      )
      .join('\n');
  return {
    // Machine-readable copy used by Import project; the other files are for people.
    ...(manifest ? { 'project.json': JSON.stringify(manifest, null, 2) } : {}),
    [`student-code.${ext}`]: code,
    'pin-assignments.csv': pins,
    'wiring.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="${height}" viewBox="0 0 700 ${height}"><rect width="700" height="${height}" fill="#fff"/><text x="30" y="40" font-family="sans-serif" font-size="20">IoT Quest · ${xml(board)} wiring</text><rect x="30" y="72" width="185" height="${Math.max(80, devices.length * 80)}" rx="8" fill="#dce9d3" stroke="#688a5c"/><text x="55" y="98" font-size="16">${xml(board)}</text>${rows}</svg>`,
    'components.json': JSON.stringify(devices, null, 2),
    'mission-results.json': JSON.stringify(
      { mission, results, location, technician: name },
      null,
      2,
    ),
    'evidence.json': JSON.stringify(
      {
        editEvents: lab?.attempts || 0,
        debuggingAttempts: lab?.debugAttempts || 0,
        debugSteps: lab?.debugSteps || 0,
        testAttempts: lab?.testAttempts || 0,
        evidence: lab?.evidence || [],
        resources: lab?.resources,
        clockMs: lab?.elapsedMs,
        weatherStationSamples: lab?.stationSamples || [],
      },
      null,
      2,
    ),
    'simulation-assumptions.json': JSON.stringify(RESOURCE_ASSUMPTIONS, null, 2),
    'README.md': `# IoT Quest project: ${mission.title}\n\nTechnician: ${name}\nController: ${board}\nLanguage: ${language === 'cpp' ? 'Arduino C++' : 'MicroPython'}\nLocation: ${location || 'Original home'}\n\nOpen student-code.${ext} in the appropriate tool, inspect pin-assignments.csv and wiring.svg, and verify every power/ground/signal assignment before replacing virtual sensors with physical hardware.\n\nRequired built-ins: ${language === 'cpp' ? 'Arduino core (Arduino.h); board support for the selected controller' : 'machine Pin/ADC/PWM and time on the selected controller firmware'}. Calibrate the polarity and range of physical soil/light sensors before using the virtual thresholds. Physical calibrated temperature/humidity, servo, pump and networking modules may require their manufacturer libraries. No physical sensor library is bundled.\n\nThis source is an educational interpreter program, not a claim of hardware compatibility. Arduino analogRead gives ADC counts on hardware, not calibrated temperature/humidity. Pico physical ADC normally uses read_u16; the teaching ADC.read is a virtual 12-bit/calibrated compatibility channel.\n\nRun mission tests in IoT Quest before adaptation. Test results and installed wiring are exported exactly as selected.\n`,
    'hardware-notes.md':
      '# Physical hardware adaptation\n\nAll simulated GPIO logic is 3.3 V. Check each physical board pin capability and sensor voltage. Keep a shared GND. LEDs require 220 Ω current-limiting series resistors; LDRs use a 10 kΩ voltage-divider resistor. Pumps, fans, relays, valves and gates need rated external power, transistor/MOSFET drivers and flyback diodes for inductive loads. Never drive motors directly from GPIO.\n\nThe weather API, sensor faults, calibrated ADC channels, servoWrite, virtual PWM compatibility calls, energy estimates, MQTT functions and resident routines are simulated APIs/components and must be replaced or adapted. Physical Wi-Fi/MQTT requires a suitable network stack and broker configuration; never put service secrets into classroom exports.\n\nSolar and battery models are educational estimates; physical charging and protection require proper controllers.\n',
  };
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function zipFiles(files) {
  const encoder = new TextEncoder(),
    parts = [],
    central = [];
  let offset = 0;
  const header = (size) => new Uint8Array(size),
    write = (b, at, val, length) => {
      const v = new DataView(b.buffer);
      length === 2 ? v.setUint16(at, val, true) : v.setUint32(at, val, true);
    };
  for (const [filename, content] of Object.entries(files)) {
    const name = encoder.encode(filename),
      data = encoder.encode(content),
      crc = crc32(data),
      h = header(30 + name.length);
    write(h, 0, 0x04034b50, 4);
    write(h, 4, 20, 2);
    write(h, 6, 0x800, 2);
    write(h, 12, 33, 2);
    write(h, 14, crc, 4);
    write(h, 18, data.length, 4);
    write(h, 22, data.length, 4);
    write(h, 26, name.length, 2);
    h.set(name, 30);
    parts.push(h, data);
    const c = header(46 + name.length);
    write(c, 0, 0x02014b50, 4);
    write(c, 4, 20, 2);
    write(c, 6, 20, 2);
    write(c, 8, 0x800, 2);
    write(c, 14, 33, 2);
    write(c, 16, crc, 4);
    write(c, 20, data.length, 4);
    write(c, 24, data.length, 4);
    write(c, 28, name.length, 2);
    write(c, 42, offset, 4);
    c.set(name, 46);
    central.push(c);
    offset += h.length + data.length;
  }
  const length = central.reduce((s, b) => s + b.length, 0),
    end = header(22);
  write(end, 0, 0x06054b50, 4);
  write(end, 8, central.length, 2);
  write(end, 10, central.length, 2);
  write(end, 12, length, 4);
  write(end, 16, offset, 4);
  const all = [...parts, ...central, end],
    out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
  let i = 0;
  for (const p of all) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}
