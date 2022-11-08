#!/bin/bash

gcc -o main main.c

dotnet build -p:UseSharedCompilation=false

javac Main.java

if [[ "$OSTYPE" == "linux-gnu"* || "$OSTYPE" == "darwin"* ]]; then
    swift build
fi
