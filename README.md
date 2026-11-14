# junction-2026

Per avviare il client dalla cartella principale:

```sh
npm install
npm run dev
```

Apri http://localhost:5173/. Le API del client usano le credenziali in `server/.env`.

Per abilitare la classificazione con Laya **in locale** (in un secondo terminale, dalla root):

```sh
uv venv --python 3.11 server/.venv
uv pip install --python server/.venv/bin/python torch --index-url https://download.pytorch.org/whl/cpu
uv pip install --python server/.venv/bin/python 'laya==0.4.31'
server/.venv/bin/python server/laya_server.py
```

Il primo avvio scarica il modello da Hugging Face (~808 MB) e può richiedere alcuni minuti. Imposta `LAYA_BASE_URL=http://127.0.0.1:8000` in `server/.env` (o in `client/.env`), poi riavvia `npm run dev`. Verifica il servizio con `curl http://127.0.0.1:8000/`. In alternativa, per usare l'API hosted di laya-ai.com (anche in produzione), imposta `LAYA_BASE_URL=https://api.laya-ai.com` e `LAYA_API_KEY` (chiave creata su https://console.laya-ai.com/keys) in `server/.env` o, su Vercel, nelle variabili d'ambiente del progetto: il server Python non è disponibile nel deployment. L'API è a consumo (20 chiamate gratuite, poi serve una ricarica); le risposte vengono tenute in memoria, quindi le chiamate restano poche. Non usare variabili `VITE_` per le chiavi.

L'indice di benessere finanziario è una **stima illustrativa, non la formula ufficiale di Intesa Sanpaolo**. Le quattro dimensioni pesano: resilienza 35, percezione 25, conoscenza 20 e comportamenti 20. I movimenti misurano risparmio, liquidità, scoperti e costanza mensile; anche percezione, conoscenza e comportamenti sono stimati in modo deterministico dai soli movimenti (regolarità della spesa, giorni con almeno due settimane di spesa sul conto, andamento del saldo; denaro investito o risparmiato e liquidità non lasciata ferma; extra nella norma e accantonamenti regolari), vedi `Signals` in `client/src/wellness.ts`. Se mancano almeno due mesi interi di dati, ma i movimenti sono sufficienti, viene mostrato un punteggio **preliminare** basato solo sulla resilienza (35 punti riscalati su 100), distinto dall'indice completo. Se mancano anche i dati per la resilienza non viene mostrato alcun valore. Debiti esterni, investimenti e assicurazioni non sono disponibili: il risultato non è una valutazione del credito.

La sezione “How Finnish households are doing” usa uno **snapshot statico** di Statistics Finland, [Financial accounts (rtp)](https://pxdata.stat.fi/PXWeb/pxweb/en/StatFin/StatFin__rtp/?tablelist=true), verificato il 14/11/2026. Tabella 11qp (fine 2025, settore S14, controparte S0, stock in milioni di euro): attivi finanziari F0 = 436871, contanti e depositi F2 = 131302, fondi comuni F52 = 54781; le quote sono F2/F0 e F52/F0. Tabella 129g (settore S14, indice F4_B6N): rapporto debito/reddito disponibile = 120,2% nel 2025Q2 e 117,6% nel 2026Q2. Sono aggregati nazionali di tutte le famiglie, **non** medie per persona né dati di clienti paragonabili per età o area; non sono aggiornati automaticamente né modificano il punteggio individuale.

Per far **parlare Walter** (sintesi vocale con ElevenLabs), esegui `npx -y @elevenlabs/cli@latest onboard init` dalla root: salva `ELEVENLABS_API_KEY` in `.env.local` (ignorato da git; vale anche `server/.env`). Su Vercel impostala nelle variabili d'ambiente del progetto. Poi riavvia `npm run dev`. Facoltativi: `ELEVENLABS_VOICE_ID` (predefinita: la voce “George”, `JBFqnCBsd6RMkjVDRZzb`) e `ELEVENLABS_MODEL` (predefinito: `eleven_flash_v2_5`, a bassa latenza). Nella chat, il pulsante con l'altoparlante attiva la lettura automatica delle risposte (la scelta resta nel browser); “Listen” sotto ogni risposta la fa riascoltare. Con l'interruttore **Chat / Talk** in alto nella finestra di Walter si sceglie come parlargli: *Chat* è la conversazione scritta; *Talk* è una conversazione a voce: tocchi il microfono e parli, Walter capisce quando hai finito (o tocchi di nuovo), trascrive con ElevenLabs Scribe (`scribe_v2`), risponde in modo breve e parlato, poi torna ad ascoltare finché non chiudi la conversazione. Toccare mentre parla lo interrompe. La chiave resta sul server: il browser chiama solo `/api/tts` e `/api/stt`.

**Call your future self** (scheda nella panoramica): si sceglie quanti anni avanti (1–10) e si vedono due futuri. In uno restano le abitudini di oggi e il denaro resta sul conto; nell'altro si mantiene un cambiamento (la sfida in corso, oppure un quinto in meno sulle spese voluttuarie) e si investe ogni mese ciò che resta, così l'interesse composto è visibile. I numeri sono deterministici, in `client/src/future.ts`, in euro di oggi, senza aumenti né inflazione; il denaro investito cresce per **ipotesi** del 5% l'anno (`RETURN`): **un'illustrazione, non una previsione né una consulenza**, i mercati possono scendere. La scheda compare solo quando ha qualcosa da dire: dopo 10 anni il futuro cambiato è avanti di almeno 12 mesi di spesa (`UPSIDE_MONTHS`), oppure le abitudini di oggi lasciano meno di un mese di spesa (`DANGER_MONTHS`). “Call this you” avvia una conversazione a voce con quel sé futuro: il modello lo interpreta usando solo quelle cifre (`FUTURE` in `client/chat.ts`), non nomina prodotti, e parla con una voce diversa da Walter (predefinita “River”; `ELEVENLABS_FUTURE_VOICE_ID` per cambiarla). Senza microfono si possono usare le domande pronte.

**Un'app diversa per ogni cliente** (`client/src/status.ts`): dai soli movimenti ogni cliente finisce in una modalità, e la panoramica ne prende colore, seconda cifra in evidenza, ordine delle schede, numero di insight e domande iniziali di Walter. *Rescue* (esce chiaramente più di quanto entra, o saldo sotto zero), *Buffer* (meno di 3 mesi di spesa da parte), *Growth* (cuscinetto pronto: far lavorare il denaro), *Cruise* (punteggio da 80 e almeno 6 mesi da parte), *Getting started* (storia insufficiente). Per una demo: CUST00008 (Rescue), CUST00001 (Buffer), CUST00010 (Growth), CUST00014 (Cruise).
