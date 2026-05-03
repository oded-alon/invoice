# Invoice IL SaaS (Hebrew RTL)

Monorepo בסיסי למערכת הנהלת חשבונות SaaS לשוק הישראלי (`עוסק פטור` / `עוסק מורשה`).

## מבנה

- `apps/api` - שרת Node.js + TypeScript (Fastify)
- `apps/web` - אפליקציית React + Tailwind + RTL
- `packages/db` - Prisma schema ומודלים למסד נתונים
- `packages/shared` - טיפוסים, enums ולוגיקה משותפת

## התחלה מהירה

1. העתקת משתני סביבה:
   - `Copy-Item .env.example .env`
2. הרמת תלויות תשתית:
   - `docker compose up -d`
3. התקנת תלויות:
   - `pnpm install`
4. יצירת Prisma Client:
   - `pnpm db:generate`
5. הרצת סביבת פיתוח:
   - `pnpm dev`

## עקרונות תאימות לשוק הישראלי (MVP)

- מספור מסמכים רציף לפי עסק, סוג מסמך ושנת מס
- מניעת עריכה למסמך שהונפק (immutable)
- תמיכה ב-RTL ו-`he-IL` כברירת מחדל
- שדות חובה למסמכי חשבונית/קבלה מותאמים לשוק המקומי
