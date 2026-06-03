#!/bin/bash
# LAST UPDATED: June 20, 2025 (cross-platform Windows + macOS/Linux)

set -e

# Detect OS and set Python executable
# macOS/Linux
if [[ "$OSTYPE" != "msys"* && "$OSTYPE" != "win32"* && "$OSTYPE" != "cygwin"* ]]; then
    PYTHON=$(command -v python3 || command -v python)
else
    # Windows Git Bash: prefer python.exe over py launcher
    if command -v python >/dev/null 2>&1; then
        PYTHON=$(command -v python)
    elif command -v python3 >/dev/null 2>&1; then
        PYTHON=$(command -v python3)
    elif command -v py >/dev/null 2>&1; then
        PYTHON=$(command -v py)
    else
        echo "Python not found. Please install Python from https://www.python.org/downloads/"
        exit 1
    fi
fi

if [[ -z "$PYTHON" ]]; then
  echo "Python not found. Please install Python from https://www.python.org/downloads/"
  exit 1
fi

cleanup() {
  echo "Shutting down FastAPI server..."
  pkill -P $$ uvicorn || true
  exit 0
}
trap cleanup SIGINT SIGTERM

echo "Pulling latest code..."
git pull

# Check Python version
PYTHON_VERSION=$("$PYTHON" -c 'import sys; print(".".join(map(str, sys.version_info[:3])))')
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)

if [ "$PYTHON_MAJOR" -lt 3 ] || { [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 8 ]; }; then
  echo "Python 3.8 or higher is required. You have $PYTHON_VERSION"
  exit 1
fi


CURRENT_BRANCH=$(git branch --show-current)
FORCE=${FORCE:-}

if [[ "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "dev" ]]; then
  echo -n "You are on branch '$CURRENT_BRANCH'. Do you want to continue? (y/n) "
  read -n 1 answer
  echo
  if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    echo "Exiting."
    exit 1
  fi
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
  echo "Creating virtual environment..."
  "$PYTHON" -m venv "venv"
fi

# Activate virtual environment
if [[ "$OSTYPE" == "msys"* || "$OSTYPE" == "win32"* || "$OSTYPE" == "cygwin"* ]]; then
  source venv/Scripts/activate
else
  source venv/bin/activate
fi

echo "Installing Python requirements..."
pip install -r requirements.txt || { echo "Pip install failed. See error above."; exit 1; }

# Detect local IP address
LOCAL_IP=""
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  if command -v ipconfig >/dev/null 2>&1 && ipconfig getifaddr en0 >/dev/null 2>&1; then
    LOCAL_IP=$(ipconfig getifaddr en0)
  fi
elif [[ "$OSTYPE" == "msys"* || "$OSTYPE" == "win32"* || "$OSTYPE" == "cygwin"* ]]; then
  # Windows
  if command -v ipconfig >/dev/null 2>&1; then
    LOCAL_IP=$(ipconfig | grep -E 'IPv4 Address|IPv4.*:' | head -n1 | awk -F: '{print $2}' | xargs)
  fi
else
  # Linux
  if command -v hostname >/dev/null 2>&1 && hostname -I >/dev/null 2>&1; then
    LOCAL_IP=$(hostname -I | awk '{print $1}')
  fi
fi

if [[ -z "$LOCAL_IP" ]]; then
  echo "Could not detect local IP address."
  exit 1
fi

echo "Detected IP: $LOCAL_IP"



update_env() {
  local key="$1" value="$2"
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  ENV_FILE="$SCRIPT_DIR/.env"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    if [[ "$OSTYPE" == "msys"* || "$OSTYPE" == "win32"* || "$OSTYPE" == "cygwin"* ]]; then
      sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    else
      sed -i.bak "s|^${key}=.*|${key}=${value}|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
    fi
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

update_env "NEXT_PUBLIC_LOCAL_IP" "$LOCAL_IP"
update_env "ENVIRONMENT" "DEVELOPMENT"

# SUPABASE_URL and SUPABASE_KEY must be set in .env before running this script.
# See .env.example for the full list of required environment variables.
if ! grep -q "^SUPABASE_URL=" .env 2>/dev/null || ! grep -q "^SUPABASE_KEY=" .env 2>/dev/null; then
  echo "ERROR: SUPABASE_URL and SUPABASE_KEY must be set in .env"
  echo "Copy .env.example to .env and fill in your Supabase project credentials."
  exit 1
fi

echo ".env updated!"
echo "LOCALHOST_IP is $LOCAL_IP"

# Run FastAPI
echo "Starting FastAPI..."

cleanup_all() {
    echo
    echo "Shutting down all services..."
    kill $UVICORN_PID 2>/dev/null || true
    exit 0
}
trap cleanup_all SIGINT SIGTERM

# Start FastAPI in background
echo "Running FastAPI on port 8000"
echo "Project setup complete."
echo "Swagger docs will be available at: http://localhost:8000/docs"
echo -e "\n\033[1;31m=============================\nYou are on branch: $CURRENT_BRANCH\n=============================\033[0m"
echo -e "\033[1;32m=============================\nAPP IS LIVE\n=============================\033[0m"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --log-level warning &
UVICORN_PID=$!

echo "FastAPI PID: $UVICORN_PID"
echo "Press Ctrl+C to stop all services."

# Wait for both processes
wait $UVICORN_PID

