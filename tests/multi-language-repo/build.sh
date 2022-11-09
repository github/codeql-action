#!/bin/bash

gcc -o main main.c

dotnet build -p:UseSharedCompilation=false

javac Main.java

if [[ "$OSTYPE" == "darwin"* ]]; then
    xcodebuild build ARCH=x86_64
fi
