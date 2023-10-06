#! /usr/bin/pwsh

py -2 -m pip install --user --upgrade pip setuptools wheel
py -3 -m pip install --user --upgrade pip setuptools wheel

# virtualenv is a bit nicer for setting up virtual environment, since it will provide up-to-date versions of
# pip/setuptools/wheel which basic `python3 -m venv venv` won't
py -2 -m pip install --user 'virtualenv!=20.12.0'
py -3 -m pip install --user virtualenv

py -3 -m pip install --user "poetry>=1.1"
py -3 -m pip install --user pipenv


# If we are running greater than or equal to python 3.12, add src to the python path
if (python -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)"); then
    echo "Python 3.12+ detected, adding imp.py to PYTHONPATH"
    echo "export PYTHONPATH=\$PYTHONPATH:$(pwd)/src" >> $GITHUB_ENV
fi
