// Sensors read through the 12-bit ADC (0–4095). Other analogue channels are calibrated units.
// Kept free of imports so every module, including ones in import cycles, can share it.
export const ADC_SIGNALS = ['light', 'soil', 'tank', 'rain', 'pot', 'pond'];
// Converts a 0–100 simulated level to a 0–4095 ADC reading.
export const ADC_SCALE = 40.95;
// What a program reads from a signal stored as `value`: ADC sensors as 0–4095, others as stored.
export const programReading = (signal, value) =>
  ADC_SIGNALS.includes(signal) ? Math.round(value * ADC_SCALE) : value;
