# Martha · NRW Abitur Mathe Tutor — Webes verzió

## Architektúra

```
Diák böngészője ──→ GitHub Pages (index.html + tasks.json)
        │
        └──→ Cloudflare Worker (proxy) ──→ Groq API (Llama 3.3 70B)
                  ↑
            API key itt van elrejtve
```

Minden 100% ingyenes.

---

## 🚀 Setup (15 perc)

### 1. Cloudflare Worker létrehozása (API proxy)

1. Menj ide: [dash.cloudflare.com](https://dash.cloudflare.com) → regisztrálj (ingyenes)
2. Bal oldalt: **Workers & Pages** → **Create**
3. Válaszd: **Create Worker**
4. Név: `martha-proxy` → **Deploy**
5. Kattints: **Edit Code**
6. Töröld a meglévő kódot, és másold be a `worker.js` tartalmát
7. **Save and Deploy**

### 2. API Key hozzáadása a Worker-hez

1. A Worker oldalán: **Settings** → **Variables and Secrets**
2. **Add** → Name: `GROQ_API_KEY` → Value: a te Groq key-ed
3. Type: **Secret** → **Save**

A Worker URL-ed valami ilyesmi lesz:
```
https://martha-proxy.TENEVEDED.workers.dev
```

### 3. index.html frissítése

Nyisd meg az `index.html`-t és keresd meg ezt a sort:
```javascript
API_URL: "https://martha-proxy.TENEVEDED.workers.dev",
```
Cseréld ki a valódi Worker URL-re.

### 4. GitHub Pages

1. Hozz létre egy GitHub repót (pl. `Martha`)
2. Töltsd fel: `index.html` + `tasks.json`
3. **Settings** → **Pages** → Source: **Deploy from branch** → **main** / **(root)** → **Save**

Kész! Az oldal elérhető: `https://FELHASZNALONEV.github.io/Martha/`

---

## 📁 Fájlok

| Fájl | Hova kerül | Leírás |
|------|-----------|--------|
| `index.html` | GitHub repo | Frontend (PIN login + chat UI) |
| `tasks.json` | GitHub repo | 278 NRW Abitur matek feladat |
| `worker.js` | Cloudflare Worker | API proxy (elrejti a Groq key-t) |

---

## 🔧 PIN megváltoztatása

Az `index.html`-ben:
```javascript
PIN_HASH: "53d6668b...",
```

Új hash generálásához nyisd meg a böngésző konzolt:
```javascript
crypto.subtle.digest('SHA-256', new TextEncoder().encode('UJPIN'))
  .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
```

---

## 💰 Ingyenes limitek

| Szolgáltatás | Limit |
|-------------|-------|
| GitHub Pages | Korlátlan |
| Cloudflare Worker | 100.000 request/nap |
| Groq API | ~30 req/perc, ~14.400/nap |
