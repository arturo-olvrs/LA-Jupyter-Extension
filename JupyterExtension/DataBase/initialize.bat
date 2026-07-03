@echo off
setlocal enabledelayedexpansion

:: Get the script's directory
set "DIR=%~dp0"

:: Files
set "DB_FILE=%DIR%db.db"
set "CREATE_SQL=%DIR%create.sql"
set "FILL_SQL=%DIR%fill_initial.sql"

echo ----^> Initializing Database...

:: 0️⃣ Check for SQLite3 installation
where sqlite3 >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: sqlite3 is not installed or not in PATH. Please install SQLite3 to continue.
    exit /b 1
)

:: 1️⃣ Backup existing database
if exist "%DB_FILE%" (
    set "TIMESTAMP=%DATE:~10,4%%DATE:~4,2%%DATE:~7,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%"
    set "TIMESTAMP=%TIMESTAMP: =0%"
    
    echo Backing up %DB_FILE% to %DB_FILE%_backup_%TIMESTAMP%...
    ren "%DB_FILE%" "%DB_FILE%_backup_%TIMESTAMP%"
)

:: 2️⃣ Create empty database
echo Creating empty database at %DB_FILE%...
sqlite3 "%DB_FILE%" ".databases" >nul

:: 3️⃣ Execute create.sql
if exist "%CREATE_SQL%" (
    echo Executing %CREATE_SQL%...
    sqlite3 "%DB_FILE%" < "%CREATE_SQL%"
) else (
    echo Error: %CREATE_SQL% does not exist.
    exit /b 1
)

:: 4️⃣ Execute fill.sql
if exist "%FILL_SQL%" (
    :: echo Executing %FILL_SQL%...
    :: sqlite3 "%DB_FILE%" ^< "%FILL_SQL%"
    echo Database data population skipped.
) else (
    echo Error: %FILL_SQL% does not exist.
    exit /b 1
)

echo Database initialized successfully.
pause