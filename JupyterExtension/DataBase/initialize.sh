#!/bin/bash

# Get the script's directory
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Files
DB_FILE="$DIR/db.db"
CREATE_SQL="$DIR/create.sql"
FILL_SQL="$DIR/fill_initial.sql"

echo "----> Initializing Database..."

# 0️⃣ Check for SQLite3 installation
if ! command -v sqlite3 &>/dev/null; then
    echo "ERROR: sqlite3 is not installed. Please install SQLite3 to continue."
    exit 1
fi

# 1️⃣ Backup existing database
if [ -f "$DB_FILE" ]; then
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_NAME="${DB_FILE}_backup_$TIMESTAMP"
    
    echo "Backing up existing database to $BACKUP_NAME..."
    mv "$DB_FILE" "$BACKUP_NAME"
fi

# 2️⃣ Create empty database
echo "Creating empty database at $DB_FILE..."
sqlite3 "$DB_FILE" ".databases" >/dev/null

# 3️⃣ Execute create.sql
if [ -f "$CREATE_SQL" ]; then
    echo "Executing $CREATE_SQL..."
    sqlite3 "$DB_FILE" < "$CREATE_SQL"
else
    echo "Error: $CREATE_SQL does not exist."
    exit 1
fi

# 4️⃣ Execute fill.sql
if [ -f "$FILL_SQL" ]; then
    # echo "Executing $FILL_SQL..."
    # sqlite3 "$DB_FILE" < "$FILL_SQL"
    echo "Database data population skipped."
else
    echo "Error: $FILL_SQL does not exist."
    exit 1
fi

echo "Database initialized successfully."