# Guidance library and Ask Afterglow — Tasks

Built 2026-11-26 without new tests at the founder's request. Checked with 13 everyday questions (chicken in the fridge, insulin, generator in the garage, a cold baby, safe water, oxygen concentrator, candles, phone battery, heat, refreezing, headache near a heater, an off-topic question): each went to the right guide, and the off-topic one was "outside the library". Checked in the browser on Plan.

- [x] `library/content.ts`: ten cited guides — GL-01, GL-02
- [x] `library/ask.ts`: offline retrieval with IDF weights and own-keyword bonus; danger signs always included — GL-03, GL-04
- [x] `library/LibrarySection.tsx` on Plan: ask, read, read aloud, sources — GL-05, GL-06
- [x] Phrasing by a model (Claude on Bedrock), restricted to the retrieved passages, with a check that rejects any number not in them; specified as GL-07 in `consoles` and live on `POST /v1/ask`
- [ ] Translations reviewed by native speakers
- [x] Insulin guidance under the medicine refusal on Cold — GL-08
