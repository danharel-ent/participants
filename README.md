# סריקת מימוש כרטיסים — WineNot Ops

מערכת ניהול לצוות: סריקה במקום, מימוש בזמן אמת, סנכרון בין מכשירים, כניסה מאובטחת בסיסמה.

## הפעלה מהירה

```bash
npm install
cp .env.example .env.local      # מלאו את הסיסמה וה-secret
npm run dev                     # בונה נתונים → מפעיל אתר על http://localhost:3000
```

## פריסה (Vercel + GitHub)

1. עדכנו קבצים ב-`purim/` ו-`future projects/`
2. דחפו ל-GitHub → Vercel בונה אוטומטית
3. פקודת build ב-Vercel: `npm run build` (כולל `build:data`)

חיבור ראשון: [vercel.com](https://vercel.com) → Import Project → `danharel-ent/participants` → Deploy.

### משתני סביבה ב-Vercel (Settings → Environment Variables)

| משתנה | חובה? | הסבר |
|--------|-------|------|
| `ACCESS_PASSWORD` | ✅ פרודקשן | סיסמת כניסה. ריק = גישה פתוחה (dev בלבד). |
| `AUTH_SECRET` | ✅ פרודקשן | מחרוזת אקראית 32+ תווים לחתימת cookie. |
| `GITHUB_TOKEN` | ✅ פרודקשן | PAT עם Contents: Read/write לריפו של הפרויקט. |
| `GITHUB_REPO` | ✅ פרודקשן | בפורמט `owner/repo` (לדוגמה `dandary/participants`). |
| `GITHUB_BRANCH` | אופציונלי | ברירת מחדל: `main`. |
| `GITHUB_REDEEMS_PATH` | אופציונלי | ברירת מחדל: `data/redeems.json`. |
| `UPSTASH_REDIS_REST_URL` | חלופי | להעדפת Redis במקום GitHub (אופציונלי). |
| `UPSTASH_REDIS_REST_TOKEN` | חלופי | טוקן REST של Upstash. |

### Persistence — איך מימושים נשמרים

המערכת בוחרת אחסון לפי הסדר הזה:

1. **GitHub (ברירת מחדל)** — מימושים נשמרים בקובץ `data/redeems.json` בריפו דרך GitHub Contents API.
   * עמיד בין deployments, cold starts, ועדכוני git.
   * audit מלא בהיסטוריית commits.
   * commits מסומנים `[skip ci]` כדי לא להפעיל deploy מחדש.
   * concurrency-safe דרך SHA-based optimistic locking ועד 3 retries.
2. **Upstash Redis** — נכנס לתוקף אם הגדרת `UPSTASH_REDIS_REST_URL`+`TOKEN` ואין `GITHUB_TOKEN`/`GITHUB_REPO`.
3. **Memory (פיתוח בלבד)** — fallback אחרון. **מתאפס בכל cold start**. אם המערכת נכנסת למצב הזה — באנר אזהרה צהוב מופיע בראש האתר.

> איך יוצרים `GITHUB_TOKEN`: github.com → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token → Repository access: Only select repositories → סמנו את הריפו → Permissions → Repository → **Contents: Read and write**. הדביקו את הטוקן ב-Vercel ועשו Redeploy.

## תכונות מובנות

- **כניסה בסיסמה** – cookie מוצפן (sha256 + secret), Edge-runtime compatible.
- **Rate limiting** – הגנה מ-brute force על login (10 ניסיונות/דקה) ועל API מימושים.
- **סנכרון חי** – polling כל 2.5 שניות, אינדיקטור online/offline בכל מסך.
- **מימוש אופטימי** – לחיצה מעדכנת מיידית, השרת מאשר ברקע, fallback בטוח על שגיאה.
- **לוג מימושים** – טאב "פעילות" עם זמן, מכשיר, וכפתור ביטול.
- **קבלה גלובלית של מימוש** – נשמר ב-GitHub (או Redis), כל המכשירים רואים תוך פחות מ-3 שניות.
- **Persistence אמיתי** – המימושים נשמרים מחוץ לזיכרון, יציבים בין logout/login, cold-start ו-deployments.
- **Validation + structured errors** – כל ה-API מחזיר `{ok, data, meta}` או `{ok:false, error:{code,message}}`.
- **A11y** – skip-link, aria-live, focus management, contrast ≥4.5:1, touch ≥44px.

## API פנימי

| endpoint | מטרה | rate limit |
|----------|------|------------|
| `POST /api/auth/login` | כניסה בסיסמה → cookie | 10/min per IP |
| `POST /api/auth/logout` | ניקוי cookie | — |
| `GET /api/redeems` | רשימת מימושים גלובלית | 120/min per IP |
| `POST /api/redeems` | מימוש חדש (idempotent לפי key) | 60/min per IP |
| `DELETE /api/redeems` | ביטול לפי key, או reset כללי | 20/min per IP |

כל route דרך middleware `auth` מלבד `/api/auth/*`.

## מודל זכאות (v8)

| שלב | מה קורה |
|-----|---------|
| 1 | `purim/` — כרטיסים בתשלום |
| 2 | מינוס נסרקו ב-purim |
| 3 | מינוס כרטיס **חינם** בשבועות / רוקח (התאמת שם/טלפון/מייל) |
| 4 | מינוס `future projects/כרטיסים שמומשו.xlsx` (טלפון + שם fuzzy) |
| 5 | זכאים סופיים באתר |

מימושים בזמן ריצה מסונכרנים דרך `/api/redeems`.

## קבצי purim פעילים

- `משתמשים גו אאוט הרצליה.csv` → הרצליה גו-אאוט
- `גו אאוט פרדס חנה.csv` → פרדס חנה גו-אאוט
- `WineNOT Back2Reality-bought-tickets.csv` → **הרצליה זיגו** (כל השורות)
- `¿WineNot_ - Back2Rea-bought-tickets.csv` → **פרדס חנה זיגו**

## בדיקות

```bash
npm run build:data       # בניית data/*.json
npm run audit:security   # בדיקת זליגות זכאות
npm run build            # בנייה מלאה (כולל data) + Next build
```

## עדכון נתונים → פרודקשן

```bash
npm run build:data
git add purim/ "future projects/" data/
git commit -m "עדכון קבצי זכאות"
git push
```
