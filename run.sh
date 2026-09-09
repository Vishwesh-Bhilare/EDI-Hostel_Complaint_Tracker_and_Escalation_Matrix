#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

MYSQL_JAR="jdbc/mysql-connector-j-26.7.0.jar"

javac -cp "$MYSQL_JAR" jdbc/DBConnection.java jdbc/HostelCareServer.java
java -cp "jdbc:$MYSQL_JAR" HostelCareServer
