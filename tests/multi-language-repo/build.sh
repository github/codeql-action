#!/bin/bash

gcc -o main main.c

dotnet build -p:UseSharedCompilation=false

javac Main.java

go build main.go

if [[ "$OSTYPE" == "darwin"* ]]; then
    swift build
fi

kotlinc main.kt
