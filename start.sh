#!/bin/bash
# Valletta Command Center — startup script
# Kills stale processes, starts API + UI, opens browser

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Kill anything on our ports ────────────────────────────────────────────────
lsof -ti:8000 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null

# ── Start FastAPI ─────────────────────────────────────────────────────────────
echo "Starting API..."
cd "$ROOT"
python3 -m uvicorn db.api:app --host 127.0.0.1 --port 8000 \
  >> "$ROOT/db/api.log" 2>&1 &
API_PID=$!

# Felix Discord bot runs on the production server (vallettamusic.com)
# Do not start locally to avoid duplicate responses
BOT_PID=""

# ── Start Vite dev server ─────────────────────────────────────────────────────
echo "Starting UI..."
cd "$ROOT/app"
npm run dev >> "$ROOT/db/ui.log" 2>&1 &
UI_PID=$!

# ── Wait for both servers ─────────────────────────────────────────────────────
echo "Waiting for servers..."
for i in $(seq 1 15); do
  sleep 1
  API_UP=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/dashboard 2>/dev/null)
  UI_UP=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173 2>/dev/null)
  if [ "$API_UP" = "200" ] && [ "$UI_UP" = "200" ]; then
    break
  fi
done

# ── Open browser ──────────────────────────────────────────────────────────────
echo "Opening Valletta Command Center..."
open "http://localhost:5173"

echo ""
echo "Valletta Command Center is running."
echo "  UI:  http://localhost:5173"
echo "  API: http://localhost:8000"
echo "  API docs: http://localhost:8000/docs"
echo "  Felix Discord bot: logs at db/discord_bot.log"
echo ""
echo "Press Ctrl+C to stop all servers."

# Keep script alive so Ctrl+C kills children
trap "kill $API_PID $UI_PID 2>/dev/null; echo 'Stopped.'; exit" INT TERM
wait
