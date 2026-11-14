# Walter: a personal economic trainer for White

Junction 2026 · S-Pankki challenge "Personal Economic Trainer". An independent hackathon prototype on S-Pankki's synthetic dataset, not an official S-Pankki service.

Live demo: https://client-gamma-smoky-40.vercel.app (log in with a customer ID, for example `CUST00001`).

## Run it

From the repository root:

```sh
npm install
npm run dev
```

Open http://localhost:5173/. The client's API routes use the credentials in `server/.env`.

### Optional: Laya classification

To classify spending with Laya **locally** (in a second terminal, from the root):

```sh
uv venv --python 3.11 server/.venv
uv pip install --python server/.venv/bin/python torch --index-url https://download.pytorch.org/whl/cpu
uv pip install --python server/.venv/bin/python 'laya==0.4.31'
server/.venv/bin/python server/laya_server.py
```

The first start downloads the model from Hugging Face (~808 MB) and can take a few minutes. Set `LAYA_BASE_URL=http://127.0.0.1:8000` in `server/.env` (or `client/.env`), then restart `npm run dev`. Check the service with `curl http://127.0.0.1:8000/`.

To use the hosted laya-ai.com API instead (also in production), set `LAYA_BASE_URL=https://api.laya-ai.com` and `LAYA_API_KEY` (create a key at https://console.laya-ai.com/keys) in `server/.env` or, on Vercel, in the project's environment variables: the Python server is not part of the deployment. The API is pay-per-use (20 free calls, then a top-up); answers are cached in memory, so calls stay few. Never put keys in `VITE_` variables.

### Optional: Walter's voice

Walter speaks with ElevenLabs. Run `npx -y @elevenlabs/cli@latest onboard init` from the root: it saves `ELEVENLABS_API_KEY` in `.env.local` (ignored by git; `server/.env` works too). On Vercel, set it in the project's environment variables. Then restart `npm run dev`. Optional: `ELEVENLABS_VOICE_ID` (default: the voice "George", `JBFqnCBsd6RMkjVDRZzb`) and `ELEVENLABS_MODEL` (default: `eleven_flash_v2_5`, low latency). The key stays on the server: the browser only calls `/api/tts` and `/api/stt`.

## What it does

**Chat with your own money.** Walter answers from a summary of the customer's account and looks up anything specific (a period, a category, a kind of place) with tools that run on the transactions, so figures come from the data rather than the model. Each lookup is shown as a small card above the reply.

**Three baskets**, as S-Pankki teaches them: *Must pay every month* (rent, utilities, groceries, getting around), *Must pay sometimes* (health care, home and appliances) and *Fun extras*, the spending that slips through your fingers (eating out, fun, shopping, travel, taxis, convenience stores). See `client/src/baskets.ts`.

**Safe to spend this week** (`client/src/safe.ts`) is worked out by the app, not the model: the smaller of the weekly pace the income allows (after both must-pay baskets and, while the buffer is not full, what is being saved) and the room left in the balance before the next salary (after rent and bills still due, groceries and getting around until payday, and a share of the must-pay-sometimes costs). A large balance is not presented as spendable: it holds savings and has to last until payday.

**A different app for each customer** (`client/src/status.ts`): from the transactions alone, each customer lands in a mode, which sets the overview's colour, its second headline figure, the order of the cards, the number of insights and Walter's opening questions. *Rescue* (clearly more going out than coming in, or a balance below zero), *Buffer* (less than 3 months of spending set aside), *Growth* (buffer ready: put the money to work), *Cruise* (score of 80 or more and at least 6 months set aside), *Getting started* (not enough history). For a demo: CUST00008 (Rescue), CUST00001 (Buffer), CUST00010 (Growth), CUST00014 (Cruise).

**Talk mode.** The **Chat / Talk** switch at the top of Walter's window picks how to talk to him: *Chat* is written; *Talk* is spoken: tap the microphone and speak, Walter notices when you are done (or tap again), transcribes with ElevenLabs Scribe (`scribe_v2`), answers briefly, then listens again until you close the conversation. Tapping while he speaks interrupts him.

**Call your future self** (a card on the overview): pick how many years ahead (1–10) and see two futures. In one, today's habits stay and the money stays in the account; in the other, one change sticks (the current challenge, or a fifth less on fun extras) and what is left each month is invested, so compound interest becomes visible. The figures are deterministic (`client/src/future.ts`), in today's euros, with no raises or inflation; invested money grows at an **assumed** 5% a year (`RETURN`): **an illustration, not a forecast or advice**; markets can fall. The card only appears when it has something to say: after 10 years the changed future is at least 12 months of spending ahead (`UPSIDE_MONTHS`), or today's habits leave less than one month of spending (`DANGER_MONTHS`). "Call this you" starts a voice conversation with that future self: the model plays them using only those figures (`FUTURE` in `client/chat.ts`), names no products, and speaks with a different voice from Walter (default "River"; set `ELEVENLABS_FUTURE_VOICE_ID` to change it). Without a microphone, the ready-made questions work.

**Comparisons with open data.** Spending per category is compared with Finns of the same age (Statistics Finland, Household Budget Survey 2022, at 2025 prices). Only optional categories (eating out, travel, entertainment, shopping) are ever suggested as a place to spend less; needs such as health care or groceries above the typical figure are not.

## Honest about its figures

**The financial wellness score is an illustrative estimate, not an official bank formula.** The four dimensions weigh: resilience 35, perception 25, knowledge 20 and behaviours 20. The transactions measure saving, liquidity, overdrafts and month-to-month consistency; perception, knowledge and behaviours are also estimated deterministically from the transactions alone (regular spending, days with at least two weeks of spending in the account, the balance trend; money invested or saved and cash not left idle; extras within the usual range and regular set-asides), see `Signals` in `client/src/wellness.ts`. Without at least two full months of data, but with enough transactions, a **preliminary** score based only on resilience is shown (35 points scaled to 100), labelled apart from the full index. Without the data for resilience, no value is shown. External debts, investments and insurance are not available: the result is not a credit assessment.

**"How Finnish households are doing"** uses a **static snapshot** of Statistics Finland, [Financial accounts (rtp)](https://pxdata.stat.fi/PXWeb/pxweb/en/StatFin/StatFin__rtp/?tablelist=true), checked on 14 November 2026. Table 11qp (end of 2025, sector S14, counterpart S0, stocks in millions of euros): financial assets F0 = 436871, currency and deposits F2 = 131302, investment fund shares F52 = 54781; the shares are F2/F0 and F52/F0. Table 129g (sector S14, indicator F4_B6N): debt to disposable income = 120.2% in 2025Q2 and 117.6% in 2026Q2. These are national aggregates for all households, **not** per-person averages or figures for comparable customers by age or area; they are not updated automatically and do not change the individual score.

The dataset's amounts are synthetic, so some gaps against public figures are large on demo customers. Background on the data and the spending logic: [docs/spending-insights.md](docs/spending-insights.md).
