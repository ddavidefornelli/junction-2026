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

L'indice di benessere finanziario è una **stima illustrativa, non la formula ufficiale di Intesa Sanpaolo**. Le quattro dimensioni pesano: resilienza 35, percezione 25, conoscenza 20 e comportamenti 20. I movimenti misurano risparmio, liquidità, scoperti e costanza mensile; le altre informazioni richiedono risposte nell'app. Senza risposte complete, almeno due mesi interi di dati e dati sufficienti per la resilienza, il totale non viene mostrato. Debiti esterni, investimenti e assicurazioni non sono disponibili: il risultato non è una valutazione del credito. Le risposte vengono conservate solo nel browser per ID cliente.
