# Afterglow Voice and the Platform API — Requirements

Product description 7.17 (USSD, SMS for feature phones) and 7.15 (a public API). EARS notation.

- **VO-01** WHEN a USSD callback arrives (Africa's Talking: form fields sessionId, serviceCode, phoneNumber, text) THE SYSTEM SHALL answer one screen, "CON …" while the menu continues and "END …" when it ends, of at most 182 characters: 1 power in my area (asks for the 6-character area code), 2 fridge and food, 3 medicines, 4 generator safety, 5 safe water.
- **VO-02** WHEN an SMS arrives (Twilio-style: form field Body) THE SYSTEM SHALL answer with TwiML holding one message of at most 160 characters for STATUS <area code>, FOOD, MEDS, CO or WATER, and a short help text otherwise, saying Afterglow is not an emergency service.
- **VO-03** THE SYSTEM SHALL answer an area's status from the published crowd state only, so an area under k = 5 is "no answer yet", never a guess; guidance texts SHALL name their source.
- **VO-04** THE SYSTEM SHALL store and log nothing about the caller (no number, no text) and SHALL rate-limit per coarse requester bucket.
- **VO-05** THE SYSTEM SHALL fit every screen and message to its budget, cutting at a word and never inside a character.
- **VO-06** The app SHALL show the person their area code, the key the voice menus ask for.
- **PA-01** THE SYSTEM SHALL publish an OpenAPI 3.1 document of every public route at `/openapi.json` on the site, with the k-anonymity, proof-of-work and signing rules in the descriptions.
