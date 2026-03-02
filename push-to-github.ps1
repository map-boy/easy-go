# Easy GO - Push to GitHub
# Run this PowerShell script from your project folder
# Make sure you created the repo at: https://github.com/new
# Repo name: easy-go

Write-Host "🚀 Pushing Easy GO to GitHub (map-boy/easy-go)..." -ForegroundColor Yellow

# Initialize git if needed
if (-not (Test-Path ".git")) {
    git init
    Write-Host "✅ Git initialized" -ForegroundColor Green
}

# Stage all files
git add .

# Commit
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
git commit -m "🚀 Easy GO v1.0 - Full app with receiver panel, MoMo payments, live GPS - $timestamp"

# Add remote (only if not already added)
$remotes = git remote
if ($remotes -notcontains "origin") {
    git remote add origin https://github.com/map-boy/easy-go.git
    Write-Host "✅ Remote added" -ForegroundColor Green
}

# Push
git branch -M main
git push -u origin main

Write-Host "`n🎉 Pushed to https://github.com/map-boy/easy-go" -ForegroundColor Green
Write-Host "🌐 Connect to Vercel at https://vercel.com for auto-deploy" -ForegroundColor Cyan
