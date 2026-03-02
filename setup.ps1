# Easy GO - Quick Setup Script
# Run this in PowerShell inside the project folder

Write-Host "🚀 Setting up Easy GO..." -ForegroundColor Yellow

# 1. Install dependencies
Write-Host "`n📦 Installing dependencies..." -ForegroundColor Cyan
npm install

# 2. Create .env if it doesn't exist
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "`n✅ Created .env file" -ForegroundColor Green
    Write-Host "⚠️  Edit .env and add your Supabase keys before running!" -ForegroundColor Yellow
} else {
    Write-Host "`n✅ .env already exists" -ForegroundColor Green
}

Write-Host "`n🎉 Setup complete! Run: npm run dev" -ForegroundColor Green
