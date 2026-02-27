start /b npm run backend
timeout /t 5 /nobreak
curl http://localhost:3001/health
echo.
curl http://localhost:3001/api/config
