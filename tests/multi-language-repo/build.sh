#!/bin/bash

gcc -o main main.c
export
dotnet build -p:UseSharedCompilation=false

javac Main.java
