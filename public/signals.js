// Sensors read through the 12-bit ADC (0–4095). Other analogue channels are calibrated units.
// Kept free of imports so every module, including ones in import cycles, can share it.
export const ADC_SIGNALS = ['light', 'soil', 'tank', 'rain', 'pot', 'pond'];
// Converts a 0–100 simulated level to a 0–4095 ADC reading.
export const ADC_SCALE = 40.95;
// What a program reads from a signal stored as `value`: ADC sensors as 0–4095, others as stored.
export const programReading = (signal, value) =>
  ADC_SIGNALS.includes(signal) ? Math.round(value * ADC_SCALE) : value;
// The Raspberry Pi Pico's MicroPython (rp2) has no ADC.read() or PWM.duty(): only read_u16()
// (0–65535) and duty_u16(). Without a board name, an analogue sensor on GP26–GP28 (the Pico's
// only ADC pins; on an ESP32 they are not ADC inputs) means a Pico.
export const isPico = (board) => /pico/i.test(String(board || ''));
export const picoWiring = (devices) =>
  devices.some((d) => d.analog && !d.output && [26, 27, 28].includes(Number(d.pin)));
// The MicroPython method call that reads a sensor's ADC object in the simulator's units:
// 0–4095 for ADC sensors, and the stated units for virtual calibrated channels.
export const adcRead = (pico, signal) =>
  !pico ? 'read()' : ADC_SIGNALS.includes(signal) ? 'read_u16() >> 4' : 'read_u16() / 16';
// Turns an output's value into a 0–1 level using the full scale of the call that wrote it
// (Runtime#outputScales): digital HIGH is 1, analogWrite 255, duty 1023, duty_u16 65535 and
// servoWrite 180. Without a known scale, 1 counts as HIGH and larger values as 8-bit PWM.
export function outputLevel(value, scale) {
  const v = Number(value) || 0;
  if (v <= 0) return 0;
  if (scale === 1) return 1;
  if (scale > 0) return Math.min(1, v / scale);
  return v === 1 ? 1 : Math.min(1, v / (v > 255 ? 65535 : 255));
}
// Sensor levels on an ordinary day; quest scenarios override only the signals they test.
export const baseEnv = {
  vibration: 5,
  bay: 0,
  pedRequest: 0,
  spaces: 1,
  light: 70,
  motion: 0,
  soil: 32,
  tank: 80,
  temp: 24,
  rain: 0,
  door: 0,
  armed: 1,
  distance: 100,
  pot: 50,
  humidity: 50,
  occupied: 1,
  appliance: 0,
  pond: 60,
  outdoorTemp: 24,
  wind: 12,
  cloud: 20,
};
