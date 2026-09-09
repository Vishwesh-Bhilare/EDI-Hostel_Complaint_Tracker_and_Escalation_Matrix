@echo off
setlocal
cd /d "%~dp0"

set "MYSQL_JAR=jdbc\mysql-connector-j-26.7.0.jar"

if not exist "%MYSQL_JAR%" (
  echo ERROR: %MYSQL_JAR% was not found.
  pause
  exit /b 1
)

if not defined HOSTELCARE_DB_USER set "HOSTELCARE_DB_USER=root"
if not defined HOSTELCARE_PORT set "HOSTELCARE_PORT=8000"
if not defined HOSTELCARE_DB_PASSWORD (
  echo MySQL user: %HOSTELCARE_DB_USER%
  set /p "HOSTELCARE_DB_PASSWORD=MySQL password (press Enter if blank): "
)

javac -cp "%MYSQL_JAR%" jdbc\DBConnection.java jdbc\HostelCareServer.java
if errorlevel 1 (
  echo.
  echo Compilation failed. Make sure a JDK is installed and javac is on PATH.
  pause
  exit /b 1
)

echo.
echo Starting HostelCare on http://localhost:%HOSTELCARE_PORT%/
echo Press Ctrl+C to stop the server.
echo.
java -cp "jdbc;%MYSQL_JAR%" HostelCareServer

if errorlevel 1 (
  echo.
  echo HostelCare stopped with an error. Check that MySQL is running,
  echo hostelcare_db exists, and the credentials above are correct.
  pause
)
