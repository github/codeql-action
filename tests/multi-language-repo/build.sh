#!/bin/bash

gcc -o main main.c

dotnet build -p:UseSharedCompilation=false

javac Main.java

go build main.go

# Not all platforms support Swift
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Compiling Swift"
    swift build
fi

kotlinc main.kt
