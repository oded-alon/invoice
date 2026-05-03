$ErrorActionPreference = "Stop"

Write-Host "[1/4] בודק קובץ .env" -ForegroundColor Cyan
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "נוצר קובץ .env מתוך .env.example" -ForegroundColor Green
}

Write-Host "[2/4] מתקין תלויות" -ForegroundColor Cyan
pnpm install

Write-Host "[3/4] מרים Docker services" -ForegroundColor Cyan
docker compose up -d

Write-Host "[4/4] יוצר Prisma Client" -ForegroundColor Cyan
pnpm db:generate

Write-Host "ההתקנה הסתיימה. להפעלה: pnpm dev" -ForegroundColor Green
