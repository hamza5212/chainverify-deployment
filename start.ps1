# ChainVerify — start backend and frontend in separate windows.
# Run from the project root:  .\start.ps1

Write-Host "Starting ChainVerify..." -ForegroundColor Cyan

# Backend
Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$PSScriptRoot'; python -m backend.app"
)

Start-Sleep -Seconds 2

# Frontend
Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$PSScriptRoot\frontend'; npm run dev"
)

Write-Host "Backend: http://localhost:5000" -ForegroundColor Green
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Green