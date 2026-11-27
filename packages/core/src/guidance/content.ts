/**
 * The guidance library (product description 7.18): short, cited answers for the
 * questions people have in an outage, written for the dark (plain words, steps first).
 * Every entry names its publisher and the guidance it follows; Afterglow adds no
 * medical judgement of its own. Reviewed 2026-11-26 against the sources named.
 */

export interface Source {
  readonly publisher: string;
  readonly title: string;
  readonly url: string;
}

export interface Guide {
  readonly id: string;
  readonly topic:
    | 'food'
    | 'medicine'
    | 'co'
    | 'cold'
    | 'heat'
    | 'power'
    | 'water'
    | 'light'
    | 'phone'
    | 'devices';
  readonly title: string;
  /** What to do, in order. */
  readonly steps: readonly string[];
  /** When to get help now. */
  readonly danger?: readonly string[];
  readonly sources: readonly Source[];
  /** Extra words people use, for search. */
  readonly words: string;
}

const USDA_FOOD: Source = {
  publisher: 'USDA Food Safety and Inspection Service',
  title: 'Keep Your Food Safe During Emergencies',
  url: 'https://www.fsis.usda.gov/',
};
const FOODSAFETY_GOV: Source = {
  publisher: 'FoodSafety.gov (US government)',
  title: 'Food Safety During Power Outages',
  url: 'https://www.foodsafety.gov/',
};
const CDC_CO: Source = {
  publisher: 'US Centers for Disease Control and Prevention',
  title: 'Carbon Monoxide Poisoning: Prevention',
  url: 'https://www.cdc.gov/carbon-monoxide/',
};
const CDC_COLD: Source = {
  publisher: 'US Centers for Disease Control and Prevention',
  title: 'Winter Weather: Hypothermia and frostbite',
  url: 'https://www.cdc.gov/winter-weather/',
};
const CDC_HEAT: Source = {
  publisher: 'US Centers for Disease Control and Prevention',
  title: 'Extreme Heat: Heat-related illness',
  url: 'https://www.cdc.gov/extreme-heat/',
};
const WHO_HOUSING: Source = {
  publisher: 'World Health Organization',
  title: 'WHO Housing and health guidelines (2018)',
  url: 'https://www.who.int/publications/i/item/9789241550376',
};
const FDA_INSULIN: Source = {
  publisher: 'US Food and Drug Administration',
  title: 'Information Regarding Insulin Storage and Switching Between Products in an Emergency',
  url: 'https://www.fda.gov/',
};
const FDA_DRUGS: Source = {
  publisher: 'US Food and Drug Administration',
  title: 'Safe Drug Use After a Natural Disaster',
  url: 'https://www.fda.gov/',
};
const CDC_WATER: Source = {
  publisher: 'US Centers for Disease Control and Prevention',
  title: 'Making Water Safe in an Emergency',
  url: 'https://www.cdc.gov/water-emergency/',
};
const USFA_CANDLES: Source = {
  publisher: 'US Fire Administration',
  title: 'Candle fire safety',
  url: 'https://www.usfa.fema.gov/',
};
const READY_POWER: Source = {
  publisher: 'Ready.gov (US Department of Homeland Security)',
  title: 'Power Outages',
  url: 'https://www.ready.gov/power-outages',
};
const FCC_PHONE: Source = {
  publisher: 'US Federal Communications Commission',
  title: 'Tips for Communicating in an Emergency',
  url: 'https://www.fcc.gov/',
};

export const LIBRARY: readonly Guide[] = [
  {
    id: 'food-fridge',
    topic: 'food',
    title: 'The fridge and freezer when the power goes',
    steps: [
      'Keep the doors shut. A closed fridge keeps food safe for about 4 hours.',
      'A full freezer holds its temperature for about 48 hours, a half-full one for about 24, if the door stays closed.',
      'After 4 hours without power, do not eat perishable food from the fridge: throw out meat, chicken and other poultry, fish, eggs, soft cheese, milk and leftovers.',
      'Frozen food that still has ice crystals, or is at 4 °C (40 °F) or below, can be refrozen or cooked.',
      'Never taste food to decide if it is safe. When in doubt, throw it out.',
      'A thermometer in the fridge and freezer tells you for certain; Afterglow’s clocks are a model.',
    ],
    sources: [USDA_FOOD, FOODSAFETY_GOV],
    words:
      'refrigerator freezer spoil spoiled meat chicken milk eggs throw out discard thaw refreeze cooler ice',
  },
  {
    id: 'medicine-insulin',
    topic: 'medicine',
    title: 'Insulin and other cold medicines',
    steps: [
      'Many insulins can be kept out of the fridge, between 15 and 30 °C (59–86 °F), for up to 28 days. Some products allow less or more: your label and pharmacist decide.',
      'Never use insulin that has frozen, or that looks cloudy when it should be clear, or has clumps.',
      'Keep it out of direct heat and sunlight; a cool, dark room is better than a warm fridge.',
      'If a life-saving medicine was stored too warm and you have no other supply, use it until you can replace it, and get a new supply as soon as you can.',
      'Write down when your medicines left the cold. Afterglow’s outage history keeps the moment the power went.',
    ],
    danger: ['Signs of very high or very low blood sugar that do not improve: get emergency help.'],
    sources: [FDA_INSULIN, FDA_DRUGS],
    words:
      'insulin pen vial refrigerate warm biologic vaccine medicine medication pharmacy diabetes',
  },
  {
    id: 'co-generator',
    topic: 'co',
    title: 'Carbon monoxide: generators, grills and stoves',
    steps: [
      'Never run a generator, grill, camp stove or anything that burns petrol, gas or charcoal inside a home, garage, basement or tent, even with the windows open.',
      'Run a generator outside, at least 6 metres (20 feet) from windows, doors and vents.',
      'Never use a gas oven or stove to heat the home.',
      'Use a battery-powered carbon monoxide alarm, and test it.',
    ],
    danger: [
      'Headache, dizziness, weakness, nausea, vomiting, chest pain or confusion, especially in several people at once: get everyone into fresh air now and call the emergency number.',
    ],
    sources: [CDC_CO],
    words:
      'carbon monoxide co poisoning generator grill braai charcoal paraffin gas stove heater fumes alarm',
  },
  {
    id: 'cold-home',
    topic: 'cold',
    title: 'Keeping warm without power',
    steps: [
      'Choose one room, close its doors and curtains, and keep everyone there.',
      'Dress in layers, with a hat, and use blankets; keep babies and older people warmest.',
      'Eat and drink warm things if you safely can; stay dry.',
      'For people who are frail, a room below 18 °C is a risk. Go somewhere warm before it gets that cold.',
    ],
    danger: [
      'Shivering, exhaustion, confusion, fumbling hands, slurred speech or drowsiness can be hypothermia. Babies may have bright red, cold skin and very low energy. Warm them and get emergency help.',
    ],
    sources: [CDC_COLD, WHO_HOUSING],
    words: 'cold winter freezing warm heating hypothermia blanket baby elderly room temperature',
  },
  {
    id: 'heat-home',
    topic: 'heat',
    title: 'Staying safe in the heat without power',
    steps: [
      'Stay in the coolest room, low in the building, out of the sun; close curtains on sunny windows.',
      'Drink water regularly before you are thirsty; avoid alcohol.',
      'Cool your skin with wet cloths or a cool shower; rest in the hottest hours.',
      'Check on older people, babies and anyone ill at least twice a day.',
    ],
    danger: [
      'A high temperature with hot, red skin, a fast pulse, confusion or fainting can be heat stroke: call the emergency number and cool them now.',
      'Heavy sweating, cold clammy skin, a weak pulse, cramps or dizziness is heat exhaustion: move to a cooler place and sip water; get help if they vomit or it lasts more than an hour.',
    ],
    sources: [CDC_HEAT],
    words: 'heat hot summer heatwave heat stroke exhaustion fan dehydration thirsty',
  },
  {
    id: 'power-generator',
    topic: 'power',
    title: 'Generators, inverters and power banks',
    steps: [
      'Plug appliances into the generator with outdoor-rated extension cords. Never plug a generator into a wall socket: it can kill someone working on the lines.',
      'Use a transfer switch installed by an electrician to power home circuits.',
      'Let a generator cool before refuelling; store fuel away from the home.',
      'Power medical devices first; Afterglow’s plan shares your batteries in that order.',
    ],
    sources: [READY_POWER, CDC_CO],
    words:
      'generator inverter backfeed transfer switch fuel petrol diesel extension cord battery ups power bank',
  },
  {
    id: 'water-safe',
    topic: 'water',
    title: 'Making water safe to drink',
    steps: [
      'If you are told to boil water, bring it to a rolling boil for 1 minute (3 minutes above 2 000 m), then let it cool.',
      'If you cannot boil it, use unscented household bleach: 8 drops of 6% bleach per gallon (about 2 drops per litre) of clear water. Stir and wait 30 minutes.',
      'If the water is cloudy, let it settle and filter it through a clean cloth first.',
      'Keep drinking water in clean, covered containers.',
    ],
    sources: [CDC_WATER],
    words: 'water make safe drink drinking boil bleach chlorine purify disinfect tap pump borehole',
  },
  {
    id: 'light-candles',
    topic: 'light',
    title: 'Light without starting a fire',
    steps: [
      'Use torches and battery lamps rather than candles. Afterglow can turn the screen into a red light.',
      'If you use candles, put them in sturdy holders, away from anything that can burn, and never leave them alone or near children and pets.',
      'Never use a candle near oxygen equipment.',
    ],
    sources: [USFA_CANDLES],
    words: 'candle torch flashlight lamp fire paraffin lantern light dark',
  },
  {
    id: 'phone-battery',
    topic: 'phone',
    title: 'Keeping your phone alive and in touch',
    steps: [
      'Turn on low-power mode, lower the brightness and close apps you do not need.',
      'Send texts rather than calls: a text retries until it gets through.',
      'Keep calls short so the network stays free for emergencies.',
      'Charge from a power bank, a laptop or a car while it runs outside.',
    ],
    sources: [FCC_PHONE, READY_POWER],
    words: 'phone battery charge text sms call signal network low power mode',
  },
  {
    id: 'devices-medical',
    topic: 'devices',
    title: 'Medical devices that need power',
    steps: [
      'Know how long each device’s battery lasts; Afterglow’s plan shows it from the watts you enter.',
      'Tell your electricity supplier that someone at home depends on powered medical equipment, if your country has a priority or medical register.',
      'Plan where you will go if the battery will not last: a hospital, a clinic or a place with backup power.',
      'Keep oxygen away from candles, stoves and anything with a flame.',
    ],
    danger: [
      'If a life-sustaining device will stop and you cannot reach power: call the emergency number before it stops.',
    ],
    sources: [READY_POWER],
    words:
      'oxygen concentrator cpap ventilator dialysis feeding pump wheelchair nebuliser medical device battery',
  },
];
