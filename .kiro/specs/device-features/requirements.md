# Device features — Requirements

Product description 7.2 (Lantern mode, eyes-free mode) and 7.9 (acoustic channel). EARS notation.

## Light (Lantern mode)

- **DF-01** WHEN the person opens the light THE SYSTEM SHALL fill the screen with the mode's red at the chosen level (dim, medium, bright) and keep the screen awake while it is open.
- **DF-02** THE SYSTEM SHALL keep a dark strip at the top of the light with a Close control, and SHALL close on Escape.
- **DF-03** WHEN the person asks for white light THE SYSTEM SHALL first say that it ends night vision for about 20 minutes, show white only after a confirmation, return to red by itself after 30 seconds, and then show how long the eyes still need to readjust.
- **DF-04** WHEN the person asks for SOS THE SYSTEM SHALL warn about flashing light, and after a confirmation flash · · · — — — · · · in Morse with a 300 ms unit (below 3 flashes a second), repeated until stopped.
- **DF-05** THE SYSTEM SHALL offer a steady beacon at full red for being found and for Heliograph receivers to lock on.

## Eyes-free

- **DF-06** THE SYSTEM SHALL keep reading aloud, vibration and voice commands off until the person turns each on, and SHALL say when the browser or device cannot do one.
- **DF-07** WHILE vibration is on, WHEN the outage starts, ends, or a HELP is received THE SYSTEM SHALL vibrate one long, two short, or three short respectively (the haptic grammar), and offer a way to feel each pattern.
- **DF-08** WHILE reading aloud is on, WHEN the outage starts or ends or a new alert appears THE SYSTEM SHALL say it once, and the Hearth SHALL offer "Read it to me" for the home line and the hours of safety.
- **DF-09** WHILE voice commands are on, WHEN the person presses "Speak a command" THE SYSTEM SHALL hear one phrase, match it by whole words to one of the ten commands (power out, power back, read it to me, light on/off, alerts, lantern, séance, cold, plan, listen to the room), act, and say what it did; anything not understood is said back, never guessed.
- **DF-10** THE SYSTEM SHALL disclose that voice commands use the browser's recogniser (Google's service in Chrome), and that reading aloud sends nothing.

## Acoustic Heliograph

- **DF-11** WHEN the person sends a code by sound THE SYSTEM SHALL play the same transmit plan as the light as two tones (mark where lit, space where dark), scheduled on the audio clock, audible (2400/1600 Hz) or near-silent (18 600/17 800 Hz).
- **DF-12** WHEN the person listens for tones THE SYSTEM SHALL turn each ~20 ms of microphone audio into the mark tone's share of energy (silence reads as dark) and decode the series with the same decoder, error correction and repeat vote as the camera, recording a heard message with channel `sound`.
- **DF-13** THE SYSTEM SHALL stop listening after 90 seconds without a message and ask for a repeat, never guess.
