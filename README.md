# סריקת מימוש כרטיסים

מערכת לצוות: סריקה במקום, מימוש מהרשימה, סנכרון מקבצי CSV.

## פריסה (Vercel + GitHub)

1. עדכנו קבצים ב-`purim/` ו-`future projects/`
2. דחיפה ל-GitHub → Vercel בונה אוטומטית
3. פקודת build ב-Vercel: `npm run build` (כולל `build:data`)

חיבור ראשון ב-[vercel.com](https://vercel.com): Import Project → `danharel-ent/participants` → Deploy.

## עדכון נתונים

```bash
npm run build:data
git add purim/ "future projects/" data/
git commit -m "עדכון קבצי זכאות"
git push
```

אחרי push, Vercel מפרסם גרסה חדשה תוך דקות.

## מודל זכאות (v6)

| שלב | מה קורה |
|-----|---------|
| 1 | `purim/` — כרטיסים בתשלום |
| 2 | מינוס נסרקו ב-purim |
| 3 | מינוס כרטיס **חינם** בשבועות / רוקח (התאמת שם/טלפון/מייל) |
| 4 | זכאים סופיים באתר |

מימושים בדלפן נשמרים ב-localStorage (לכל מכשיר בנפרד).

## קבצי purim פעילים

- `משתמשים גו אאוט הרצליה.csv`
- `גו אאוט פרדס חנה.csv`
- `WineNOT Back2Reality-bought-tickets.csv` (זיגו + WineNot — מפוצל לפי שם כרטיס)

## פיתוח מקומי (אופציונלי)

```bash
npm install
npm run dev
```
