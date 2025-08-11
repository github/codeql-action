#!/bin/bash
set -e

cd "$(dirname "$0")"
python3 -m venv env
source env/bin/activate
pip3 install ruamel.yaml==0.18.14
python3 sync.py

