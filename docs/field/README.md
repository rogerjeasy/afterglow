# Field checks: Afterglow against the real world

Afterglow's clocks come from models anchored to published guidance. This folder is where they meet real thermometers, real nights and real phones. **No results are published here yet.** Each check below says how to run it, so anyone can repeat it and get a comparable number.

Everything is recorded in the app at **[/app/field](https://afterglow-flax.vercel.app/app/field)** (You → Field checks). A check never starts the outage clock and never sends a crowd report. Export the CSV when you finish and add it here as `YYYY-MM-DD-<kind>.csv`, with a short note in the table at the bottom.

## 1. A fridge against a thermometer (about 5 hours)

You need a fridge thermometer that reads to 0.1 °C (an appliance thermometer, about $5) and a calm afternoon with little food at risk.

1. Set the fridge up on the Cold tab: kind and how full it is.
2. Put the thermometer on the middle shelf, away from the walls and the door, and leave it an hour.
3. In Field checks, type the thermometer reading and the room temperature, pull the plug, and press **I pulled the plug: start**.
4. Every 30 to 60 minutes, open the door just long enough to read it and **Add reading**. Note each opening; the app's door model is not used in a check.
5. Stop when it passes 4.4 °C (40 °F), or after 6 hours. Plug it back in. Press **Finish this check**.

What to report: the number of readings, the mean and largest error, the bias, the minute the thermometer reached 4.4 °C against the model's minute, and the fitted time constant against the default. If the app offers **Use what I measured**, say whether you applied it. It can only shorten the clock.

A freezer works the same way over one to two days, with readings every few hours and 0 °C as the line.

## 2. A night with the heating off (one night)

1. Set up your home on the Hearth (building, your line, the outdoor temperature).
2. Choose a night you are not worried about. Put a thermometer in the room you sleep in.
3. Turn the heating off, type the indoor and outdoor temperatures, and press **The heating is off: start**.
4. Add a reading every hour or two and one in the morning. Turn the heating back on at any time; the check is not worth being cold for.

What to report: how many readings fell inside the range the Graveyard Shift draws, the error against its likely curve, and when the home crossed your line against the headstone. Note the real overnight outdoor low.

## 3. Séance at a distance (about 30 minutes per distance)

1. Two phones, both with Afterglow open on Séance, a tape measure, a dim room.
2. On the watching phone, open Field checks, set the distance and the place, and **Start counting**.
3. On the sending phone, send "I'm safe". On the watching phone, tap **The other phone is sending now**, watch, then tap what it showed.
4. Ten attempts at 1, 3 and 5 m. Then try through a window.

What to report: the success rate at each distance, the typical time to a read, refusals, and above all **any attempt that showed a different message**. The codec promises that never happens (HL-09); if it does, record it in `docs/kiro/pbt-catches.md` with the conditions.

## 4. People in a real outage

Numbers from our own kitchen are a start. What matters is whether people in places where the power fails often find it useful.

- **Who:** 3 to 10 households in a city with frequent outages, each told plainly that Afterglow is a prototype and not an emergency service.
- **Consent:** ask before quoting anyone, and quote by first name and city only, or not at all. Never record a person's location, a phone number or a medical condition here.
- **What to ask after their next outage:** which screen they opened first; whether any number was wrong or confusing; what they did because of the app (threw food out, kept food, went somewhere warm, checked on someone); what was missing.
- **What to report:** the answers as written, including the unflattering ones.

## Results

| Date | Check | Setup | Result | File |
|---|---|---|---|---|
| | | | No results yet. | |
