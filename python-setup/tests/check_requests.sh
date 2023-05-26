#!/bin/bash

set -e

SCRIPTDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

EXPECTED_PYTHON_VERSION=$1
EXPECTED_REQUESTS_VERSION=$2

FOUND_PYTHON_VERSION="$LGTM_PYTHON_SETUP_VERSION"
FOUND_PYTHONPATH="$LGTM_INDEX_IMPORT_PATH"

echo "FOUND_PYTHON_VERSION=${FOUND_PYTHON_VERSION} FOUND_PYTHONPATH=${FOUND_PYTHONPATH} "

if [[ $FOUND_PYTHON_VERSION != $EXPECTED_PYTHON_VERSION ]]; then
    echo "Script told us to use Python ${FOUND_PYTHON_VERSION}, but expected ${EXPECTED_PYTHON_VERSION}"
    exit 1
else
    echo "Script told us to use Python ${FOUND_PYTHON_VERSION}, which was expected"
fi

PYTHON_EXE="python${EXPECTED_PYTHON_VERSION}"

INSTALLED_REQUESTS_VERSION=$(PYTHONPATH="${FOUND_PYTHONPATH}" "${PYTHON_EXE}" -c 'import requests; print(requests.__version__)')

if [[ "$INSTALLED_REQUESTS_VERSION" != "$EXPECTED_REQUESTS_VERSION" ]]; then
    echo "Using ${FOUND_PYTHONPATH} as PYTHONPATH, we found version $INSTALLED_REQUESTS_VERSION of requests, but expected $EXPECTED_REQUESTS_VERSION"
    exit 1
else
    echo "Using ${FOUND_PYTHONPATH} as PYTHONPATH, we found version $INSTALLED_REQUESTS_VERSION of requests, which was expected"
fi
