// Sensors read through the 12-bit ADC (0–4095). Other analogue channels are calibrated units.
// Kept free of imports so every module, including ones in import cycles, can share it.
export const ADC_SIGNALS = ['light', 'soil', 'tank', 'rain', 'pot', 'pond'];
// Converts a 0–100 simulated level to a 0–4095 ADC reading.
export const ADC_SCALE = 40.95;
