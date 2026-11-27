# Afterglow Voice and the Platform API — Tasks

Built 2026-11-26 in Claude Code; tests added 2026-11-27 (14 tests in `services/crowd/src/voice.property.test.ts`, ids VO-01..VO-05, PA-01). VO-06 (the area code on the Lantern) is screen-only and has no test yet. The PA-01 test found four public routes missing from `openapi.json` (`/v1/history`, `/v1/advisories`, `/v1/sites`, `/v1/ask`); they were added. Every USSD screen and SMS reply was measured against its budget; both webhooks were smoke-tested live with simulated provider requests (placeholder numbers; nothing sends to anyone).

- [x] `services/crowd/src/voice.ts`: USSD and SMS engines, budget fitting, TwiML — VO-01, VO-02, VO-05
- [x] Routes `POST /v1/voice/ussd` and `POST /v1/voice/sms`, answers from the published state, rate-limited, nothing stored — VO-03, VO-04 (applied with the founder's approval)
- [x] Area code on the live Lantern — VO-06
- [x] `apps/mobile/public/openapi.json` — PA-01
- [ ] Connect a real USSD code and SMS number (needs the founder's provider account and keys)
- [ ] Verify the provider's request signature once the provider account exists
- [ ] Spoken (IVR) line with community-recorded phrase banks
- [ ] API keys and quotas for institutional users
