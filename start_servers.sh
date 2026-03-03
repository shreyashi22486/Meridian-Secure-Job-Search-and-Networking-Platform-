#!/bin/bash
echo "Stopping existing servers..."
pkill -f "uvicorn" 2>/dev/null
pkill -f "vite" 2>/dev/null
sleep 2

echo "Starting backend..."
cd /home/iiitd/Secure-Job-Portal/backend
source venv/bin/activate
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > /tmp/backend.log 2>&1 &
BACKEND_PID=$!

echo "Starting frontend..."
cd /home/iiitd/Secure-Job-Portal/frontend
nohup npx vite --host 0.0.0.0 --port 5173 > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!

echo "Servers started!"
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
exit 0
