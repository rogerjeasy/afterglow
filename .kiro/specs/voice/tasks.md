# Afterglow Voice and the Platform API — Tasks

Built 2026-11-26 without new tests at the founder's request. Every USSD screen and SMS reply was measured against its budget; both webhooks were smoke-tested live with simulated provider requests (placeholder numbers; nothing sends to anyone).

- [x] `services/crowd/src/voice.ts`: USSD and SMS engines, budget fitting, TwiML — VO-01, VO-02, VO-05
- [x] Routes `POST /v1/voice/ussd` and `POST /v1/voice/sms`, answers from the published state, rate-limited, nothing stored — VO-03, VO-04 (applied with the founder's approval)
- [x] Area code on the live Lantern — VO-06
- [x] `apps/mobile/public/openapi.json` — PA-01
- [ ] Connect a real USSD code and SMS number (needs the founder's provider account and keys)
- [ ] Verify the provider's request signature once the provider account exists
- [ ] Spoken (IVR) line with community-recorded phrase banks
- [ ] API keys and quotas for institutional users
