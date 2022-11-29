#!/bin/sh
set -x
set -e

# The binaries for packages installed with `pip install --user` are not available on PATH
# by default, so we fix up PATH to suppress warnings by pip. This also needs to be done by
# any script that needs to access poetry/pipenv.
#
# Using `::add-path::` from the actions toolkit is not enough, since that only affects
# subsequent actions in the current job, and not the current action.
export PATH="$HOME/.local/bin:$PATH"

# Setup Python 3 dependency installation tools.

python3 -m pip install --user --upgrade pip setuptools wheel

# virtualenv is a bit nicer for setting up virtual environment, since it will provide
# up-to-date versions of pip/setuptools/wheel which basic `python3 -m venv venv` won't.
#
# version 20.16.5 (Python 3 only) had some problems when used together with newer
# versions of setuptools (60+) and would not always put binaries under `<venv-path>/bin`
# -- see https://github.com/github/codeql-action/issues/1249 for more details.
python3 -m pip install --user --upgrade 'virtualenv>20.16.5'

# We install poetry with pip instead of the recommended way, since the recommended way
# caused some problem since `poetry run` gives output like:
#
#     /root/.poetry/lib/poetry/_vendor/py2.7/subprocess32.py:149: RuntimeWarning: The _posixsubprocess module is not being used. Child process reliability may suffer if your program uses threads.
#       "program uses threads.", RuntimeWarning)
#     LGTM_PYTHON_SETUP_VERSION=The currently activated Python version 2.7.18 is not supported by the project (^3.5). Trying to find and use a compatible version. Using python3 (3.8.2) 3

python3 -m pip install --user "poetry>=1.1"
python3 -m pip install --user pipenv

if command -v python2 >/dev/null 2>&1; then
	# Setup Python 2 dependency installation tools. The Ubuntu 20.04 GHA environment
	# does not come with a Python 2 pip, but if it is already installed, don't try to
	# install it again (since that causes problems).
	#
	# This might seem like a hypothetical situation, but it happens all the time in our
	# internal testing where we run the action twice in a row.
	if ! python2 -m pip --version; then
		echo "Will install pip for python2"
		curl --location --fail https://bootstrap.pypa.io/pip/2.7/get-pip.py | python2
	fi

	python2 -m pip install --user --upgrade pip setuptools wheel

	python2 -m pip install --user 'virtualenv!=20.12.0'
fi
