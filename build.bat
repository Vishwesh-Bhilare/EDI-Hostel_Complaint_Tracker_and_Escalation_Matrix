@echo off
setlocal
title Hostel Complaint Tracker

rem Always launch from this file's folder, including when double-clicked.
cd /d "%~dp0"
if errorlevel 1 goto folder_error

rem Prefer JAVA_HOME, then an existing JDK on PATH, then Android Studio's JDK.
if defined JAVA_HOME (
    if exist "%JAVA_HOME%\bin\javac.exe" set "PATH=%JAVA_HOME%\bin;%PATH%"
)
where javac >nul 2>&1
if errorlevel 1 (
    if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\javac.exe" (
        set "PATH=%ProgramFiles%\Android\Android Studio\jbr\bin;%PATH%"
    )
)
where java >nul 2>&1
if errorlevel 1 goto java_error
where javac >nul 2>&1
if errorlevel 1 goto java_error

rem Python is used only as the launcher; all dependencies are standard library.
python --version >nul 2>&1
if errorlevel 1 goto try_python_launcher
set "HCT_PYTHON=python"
goto ready

:try_python_launcher
py -3 --version >nul 2>&1
if errorlevel 1 goto python_error
set "HCT_PYTHON=py -3"

:ready
if /i "%~1"=="--check" (
    echo Java and Python are available. The server has not been started.
    java -version
    javac -version
    %HCT_PYTHON% --version
    exit /b 0
)

echo Starting Hostel Complaint Tracker...
echo Make sure your MySQL server is running.
echo Keep this window open. Press Ctrl+C to stop the server.
echo.
%HCT_PYTHON% "%~dp0run_all.py"
set "HCT_EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%HCT_EXIT_CODE%"=="0" echo Startup failed. See the messages above.
pause
exit /b %HCT_EXIT_CODE%

:folder_error
echo Could not open the project folder.
goto failed

:java_error
echo Java development tools were not found.
echo Install a JDK or set JAVA_HOME to its folder, then run build.bat again.
goto failed

:python_error
echo Python 3 was not found.
echo Install Python 3 and enable its PATH option, then run build.bat again.

:failed
pause
exit /b 1
