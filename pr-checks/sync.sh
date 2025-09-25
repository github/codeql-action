#!/bin/bash
set -e

cd "$(dirname "$0")"
python3 -m venv env
source env/*/activate
pip3 install ruamel.yaml==0.17.31
python3 sync.py

