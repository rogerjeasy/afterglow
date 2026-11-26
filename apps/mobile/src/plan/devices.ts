import type { energy } from '@afterglow/core';

/**
 * Medical device profiles (product description 7.8 "loads: ... medical devices
 * (profiles for CPAP, oxygen concentrators, ventilators, feeding pumps, dialysis)").
 * A profile fills the name, marks the load medical (so the plan powers it first) and
 * sets the plug; it never fills the watts. The typical range is shown as a guide to
 * reading the label, because devices of one kind differ by several times.
 */
export interface DeviceProfile {
  readonly name: string;
  readonly needs: energy.Need;
  readonly typical: string;
}

export const MEDICAL_DEVICES: readonly DeviceProfile[] = [
  {
    name: 'CPAP',
    needs: 'ac',
    typical: 'often 30–60 W; up to about 90 W with a heated humidifier',
  },
  { name: 'Oxygen concentrator', needs: 'ac', typical: 'home units often 300–600 W' },
  {
    name: 'Portable oxygen concentrator',
    needs: 'ac',
    typical: 'often 30–100 W while charging or running',
  },
  { name: 'Home ventilator', needs: 'ac', typical: 'often 20–100 W' },
  { name: 'Feeding pump', needs: 'usb', typical: 'often under 15 W' },
  {
    name: 'Dialysis cycler',
    needs: 'ac',
    typical: 'peritoneal cyclers often 100–200 W; haemodialysis machines far more',
  },
  { name: 'Powered wheelchair', needs: 'ac', typical: 'chargers often 100–300 W' },
  { name: 'Nebuliser', needs: 'ac', typical: 'often 50–150 W' },
];
