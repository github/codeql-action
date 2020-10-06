#! /usr/bin/pwsh

py -2 -m pip install --user --upgrade pip setuptools wheel
py -3 -m pip install --user --upgrade pip setuptools wheel

# virtualenv is a bit nicer for setting up virtual environment, since it will provide up-to-date versions of
# pip/setuptools/wheel which basic `python3 -m venv venv` won't
py -2 -m pip install --user virtualenv
py -3 -m pip install --user virtualenv

# poetry 1.0.10 has error (https://github.com/python-poetry/poetry/issues/2711)
py -3 -m pip install --user poetry!=1.0.10
py -3 -m pip install --user pipenv