# Kommun AI-sök

En RAG-baserad söklösning för kommuner med Express-backend och en återanvändbar React-widget.

## Projektstruktur

```
kommun-ai/
├── src/
│   ├── components/
│   │   └── SearchWidget.jsx    # Återanvändbar sök-widget komponent
│   ├── App.jsx                 # Demo-sida (för Vite dev-server)
│   └── main.jsx                # React entrypoint
├── server.js                   # Express API med /search endpoint + statisk hosting av dist/
├── ingest.js                   # Crawler & data ingestion
├── vite.config.js              # Vite config med proxy i dev
└── package.json
```

## Snabbstart

### 1. Installera dependencies

```bash
npm install
```

### 2. Konfigurera miljövariabler

Skapa en `.env`-fil i projektets rot med följande:

```env
SUPABASE_URL=https://din-supabase-url.supabase.co
SUPABASE_SERVICE_ROLE_KEY=din-service-role-key
SUPABASE_ANON_KEY=din-anon-key   # används av ingest.js
OPENAI_API_KEY=sk-...
OPENAI_PROJECT_ID=proj_...
```

### 3. Utvecklingsläge (med HMR)

1. **Terminal 1 – Backend:** `npm run server`  
   Startar Express på `http://localhost:3000` och exponerar `/search`.
2. **Terminal 2 – Frontend:** `npm run dev`  
   Vite kör på `http://localhost:5173` (väljer ny port om upptagen) och proxar `/search` till Express.

Öppna Vite-URL:en i webbläsaren, ställ en fråga och klicka **Sök**.

### 4. Produktion / enbart Express

Vill du slippa separat dev-server kör du:

```bash
npm run build   # bygger frontend till dist/
npm run server  # Express servar både API och dist/
```

Öppna `http://localhost:3000` → samma widget laddas från `dist/index.html`.

> När `dist/` saknas loggar servern ett tips om att köra `npm run build`.

---

## SearchWidget API

### Props

| Prop | Typ | Default | Beskrivning |
|------|-----|---------|-------------|
| `apiUrl` | `string` | `"/search"` | Endpoint för backend (kan vara full URL) |
| `title` | `string` | `"Kommun-sök (demo)"` | Titel i modaldialogen |
| `heading` | `string` | `title` | Rubrik i widgetens header |
| `placeholder` | `string` | `"Skriv din fråga här..."` | Placeholder i sökfältet |
| `initialQuery` | `string` | `"Hur lång tid tar bygglov i Sandviken?"` | Förifylld fråga |
| `logo` | `ReactNode` | Blå "S" badge | Valfri logotyp i headern |
| `badge` | `ReactNode` | Blå "S" badge | Liten badge i sökknappen |
| `requestOptions` | `RequestInit` | `undefined` | Extra `fetch`-options (headers, metod etc.) |
| `onResult` | `(result) => void` | `undefined` | Callback med `{ query, answer, sources }` efter lyckad fetch |

### Exempel med anpassad logga och callback

```jsx
import SearchWidget from './components/SearchWidget';

export default function App() {
  return (
    <SearchWidget
      heading="Sandvikens kommun"
      title="AI-svar från sandviken.se"
      apiUrl="/search"
      initialQuery="Hur lång tid tar bygglov i Sandviken?"
      onResult={(result) => console.log('Sökresultat', result)}
      logo={
        <img
          src="/kommun-logo.svg"
          alt="Sandvikens kommun"
          style={{ width: 36, height: 36, borderRadius: 8 }}
        />
      }
      badge={
        <img
          src="/kommun-mini.svg"
          alt="K"
          style={{ width: 20, height: 20, borderRadius: 6 }}
        />
      }
    />
  );
}
```

### Exempel med backend på annan origin

```jsx
<SearchWidget
  apiUrl="https://kommunsok.demo.se/search"
  requestOptions={{ headers: { Authorization: 'Bearer xyz' } }}
/> 
```

---

## Funktioner

✅ **Återanvändbar React-komponent** – Inga externa UI-ramverk, redo för Next.js/Vite/CRA.  
✅ **Tillgänglig modal** – `role="dialog"`, ESC-stängning, fokus återställs efter stängning.  
✅ **Robust felhantering** – Visar nätverksfel och HTTP-fel på svenska.  
✅ **Källor som länkar** – Renderas som klickbara, unika URL:er.  
✅ **Enkel inbäddning** – Props för logga, badge, initial fråga och callbacks.  
✅ **Express serverar dist/** – Produktion kräver bara `npm run build` + `npm run server`.

---

## Backend API

`GET /search?q=<fråga>` returnerar `{ answer: string, sources: string[] }`.  
På fel returneras statuskod + `{ error: string }`.

**Exempel:**

```bash
curl "http://localhost:3000/search?q=Hur+l%C3%A5ng+tid+tar+bygglov%3F"
```

---

## Vanliga frågor

- **"Failed to fetch" i frontend** – Kontrollera att `npm run server` körs och att `apiUrl` pekar rätt.  
- **Vill använda widgeten i annan app** – Importera `SearchWidget` och ange `apiUrl` till din backend.  
- **Vill endast köra Express** – Kör `npm run build` före `npm run server` så servas `dist/` automatiskt.

---

## Nästa steg

- [ ] Justera prompt i `server.js` för mer mänsklig ton ("Kul att du frågar om...").
- [ ] Lagra historik per användare.
- [ ] Lägg till feedback-knappar (👍/👎) i modalen.
- [ ] Lägg till mörkt läge.

---

## Licens

ISC
