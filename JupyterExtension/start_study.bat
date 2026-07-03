@echo off
SETLOCAL

echo ----> 1. Checking prerequisites...

REM Check Docker installation
docker --version >nul 2>&1
IF ERRORLEVEL 1 (
    echo ERROR: Docker is not installed. Please install Docker Desktop first.
    pause
    exit /b 1
)

REM Check Docker Compose
docker compose version >nul 2>&1
IF ERRORLEVEL 1 (
    echo ERROR: Docker Compose is not available. Make sure Docker Desktop is updated.
    pause
    exit /b 1
)

REM Check if Docker is running
docker info >nul 2>&1
IF ERRORLEVEL 1 (
    echo ERROR: Docker does not seem to be running. Please start Docker Desktop.
    pause
    exit /b 1
)

set "INITIALIZE_SCRIPT=.\DataBase\initialize.bat"

if exist "%INITIALIZE_SCRIPT%" (
    echo ----^> 2. Running database initialization script...
    call "%INITIALIZE_SCRIPT%"
) else (
    echo WARNING: Database initialization script not found at %INITIALIZE_SCRIPT%. Skipping.
)

SET "TARGET_DIR=.\NoteBooks"

IF EXIST "%TARGET_DIR%" (
    echo ----> 3. Removing write permissions from files in %TARGET_DIR%

    REM Make all files in the target directory read-only (non-recursive)
    for %%F in ("%TARGET_DIR%\*") do (
        if exist "%%F" attrib +R "%%F"
    )

    REM Make the target directory itself read-only
    attrib +R "%TARGET_DIR%"
) ELSE (
    echo WARNING: %TARGET_DIR% does not exist. Skipping permissions adjustment.
)

echo ----> 4. Cleaning up previous containers...

REM Check if the container exists and remove it
docker ps -a --format "{{.Names}}" | findstr /i "^la_extension_container$" >nul
IF %ERRORLEVEL%==0 (
    docker stop la_extension_container >nul 2>&1
    docker rm la_extension_container >nul 2>&1
) ELSE (
    echo ----> No previous container named 'la_extension_container' found.
)

REM Clean up orphaned Docker Compose services
docker-compose down --remove-orphans >nul 2>&1

echo ----> 5. Building and starting containers (this may take a few minutes)...
docker compose up --build -d

echo ----> 6. Waiting for JupyterLab to start...
timeout /t 5 >nul

SET URL=http://localhost:8888/lab/tree/NoteBooks
echo ----> 7. Opening JupyterLab in your browser...
start "" "%URL%"

echo ----> 8. All set. You can access Jupyter at %URL%.
pause
ENDLOCAL
