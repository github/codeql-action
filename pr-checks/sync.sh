#!/bin/bash
set -e

cd "$(dirname "$0")"
python3 -m venv env
source env/bin/activate
pip3 install ruamel.yaml
python3 sync.py

