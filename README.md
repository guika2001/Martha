# Martha · NRW Abitur Mathe Tutor — Webes verzió

## 🚀 Deployment GitHub Pages-re (100% ingyenes)

### 1. lépés: GitHub repo létrehozása
```bash
# Hozz létre egy új repot a GitHub-on, pl. "martha-tutor"
# Klónold le:
git clone https://github.com/FELHASZNALONEV/martha-tutor.git
cd martha-tutor

# Másold be a fájlokat:
# - index.html
# - tasks.json
```

### 2. lépés: Push és GitHub Pages bekapcsolása
```bash
git add .
git commit -m "Martha tutor v1"
git push origin main
```

Ezután:
1. Menj a GitHub repo **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: **main** / **(root)**
4. **Save**

Pár perc múlva elérhető lesz: `https://FELHASZNALONEV.github.io/martha-tutor/`

### 3. lépés: Groq API Key (ingyenes)
1. Menj ide: [console.groq.com/keys](https://console.groq.com/keys)
2. Regisztrálj (ingyenes, Google/GitHub login)
3. Hozz létre egy API key-t
4. Az oldalon a ⚙️ gombbal add meg a key-t

> **Groq ingyenes limit**: ~30 request/perc, napi ~14.400 request — bőven elég néhány diáknak.

---

## 🔧 Konfigurálás

### PIN megváltoztatása
A PIN hash-t az `index.html` CONFIG részében találod:
```javascript
PIN_HASH: "53d6668b995a4117d05d7799f6563672f4659d05f9f9fd45f961164de256b5d0",
```

Új PIN generálásához nyisd meg a böngésző konzolt és futtasd:
```javascript
crypto.subtle.digest('SHA-256', new TextEncoder().encode('UJPIN'))
  .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
```

### Modell választás
Az alapértelmezett `llama-3.3-70b-versatile` a legjobb ingyenes opció matekra.
Alternatívák: `llama-3.1-8b-instant` (gyorsabb, kevésbé pontos).

---

## 📁 Fájlok

| Fájl | Leírás |
|------|--------|
| `index.html` | Teljes alkalmazás (frontend + Groq API hívás) |
| `tasks.json` | 278 NRW Abitur matek feladat (Analysis, Stochastik, Geometrie) |

---

## ⚠️ Fontos megjegyzések

- **A Groq API key a böngésző localStorage-jában tárolódik** — minden diáknak egyszer meg kell adnia. Ha nem szeretnéd hogy minden diák saját key-t csináljon, beégetheted a kódba (de ez biztonsági kockázat publikus repóban).
- **A PIN kliens-oldali** — nem 100% biztonságos, de a cél csak az, hogy ne használja bárki véletlenül.
- **Nincs szerver** — minden a böngészőben fut, nincs havi költség.
