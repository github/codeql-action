#!/bin/bash

gcc -o main main.c

dotnet build -p:UseSharedCompilation=false

javac Main.java

if [[ "$OSTYPE" == "darwin"* || "$OSTYPE" == "linux-gnu"* ]]; then
    swift build
fi
