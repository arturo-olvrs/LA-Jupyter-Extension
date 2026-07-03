#!/bin/bash

echo "----> 1. Checking prerequisites..."

if ! command -v docker &>/dev/null; then
    echo "ERROR: Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &>/dev/null && ! command -v docker &>/dev/null; then
    echo "ERROR: Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

if ! docker info &>/dev/null; then
    echo "ERROR: Docker does not seem to be running. Please start the Docker service."
    exit 1
fi

INITIALIZE_SCRIPT="./DataBase/initialize.sh"
if [ -f "$INITIALIZE_SCRIPT" ]; then
    echo "----> 2. Running database initialization script..."
    bash "$INITIALIZE_SCRIPT"
else
    echo "WARNING: Database initialization script not found at $INITIALIZE_SCRIPT. Skipping."
fi


TARGET_DIR="./NoteBooks/"

if [ -d "$TARGET_DIR" ]; then
    echo "----> 3. Removing write permissions from files in $TARGET_DIR"
    find "$TARGET_DIR" -maxdepth 1 -type f -exec chmod -w {} +
    chmod -w "$TARGET_DIR"
else
    echo "WARNING: $TARGET_DIR does not exist. Skipping permissions adjustment."
fi

echo "----> 4. Cleaning up previous containers..."

if docker ps -a --format '{{.Names}}' | grep -Eq "^la_extension_container\$"; then
    docker stop la_extension_container 2>/dev/null
    docker rm la_extension_container 2>/dev/null
else
    echo "----> No previous container named 'la_extension_container' found."
fi

# Limpiar servicios huérfanos de Docker Compose
docker-compose down --remove-orphans 2>/dev/null

echo "----> 5. Building and starting containers (this may take a few minutes)..."
docker compose up -d

echo "----> 6. Waiting for JupyterLab to start..."
sleep 5

URL="http://localhost:8888/lab/tree/NoteBooks"
echo "----> 7. Opening JupyterLab in your browser..."

case "$OSTYPE" in
  msys*|win32*) start "$URL" ;;
  darwin*) open "$URL" ;;
  *) xdg-open "$URL" ;;
esac

echo "----> 8. All set. You can access Jupyter at $URL."