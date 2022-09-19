#! /usr/bin/pwsh

# while waiting for the next release of `virtualenv` after v20.16.5, we install an older
# version of `setuptools` to ensure that binaries are always put under
# `<venv-path>/bin`, which wouldn't always happen with the GitHub actions version of
# Ubuntu 22.04. See https://github.com/github/codeql-action/issues/1249
py -2 -m pip install --user --upgrade pip 'setuptools<60' wheel
py -3 -m pip install --user --upgrade pip 'setuptools<60' wheel

# virtualenv is a bit nicer for setting up virtual environment, since it will provide up-to-date versions of
# pip/setuptools/wheel which basic `python3 -m venv venv` won't
py -2 -m pip install --user 'virtualenv<20.11'
py -3 -m pip install --user 'virtualenv<20.11'

# We aren't compatible with poetry 1.2
py -3 -m pip install --user "poetry>=1.1,<1.2"
py -3 -m pip install --user pipenv
