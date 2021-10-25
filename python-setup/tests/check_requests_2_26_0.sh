#!/bin/bash

set -e

SCRIPTDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

EXPECTED_VERSION=$1

FOUND_VERSION="$LGTM_PYTHON_SETUP_VERSION"
FOUND_PYTHONPATH="$LGTM_INDEX_IMPORT_PATH"

echo "FOUND_VERSION=${FOUND_VERSION} FOUND_PYTHONPATH=${FOUND_PYTHONPATH} "

if [[ $FOUND_VERSION != $EXPECTED_VERSION ]]; then
    echo "Script told us to use Python ${FOUND_VERSION}, but expected ${EXPECTED_VERSION}"
    exit 1
else
    echo "Script told us to use Python ${FOUND_VERSION}, which was expected"
fi

PYTHON_EXE="python${EXPECTED_VERSION}"

INSTALLED_REQUESTS_VERSION=$(PYTHONPATH="${FOUND_PYTHONPATH}" "${PYTHON_EXE}" -c 'import requests; print(requests.__version__)')

EXPECTED_REQUESTS="2.26.0"

if [[ "$INSTALLED_REQUESTS_VERSION" != "$EXPECTED_REQUESTS" ]]; then
    echo "Using ${FOUND_PYTHONPATH} as PYTHONPATH, we found version $INSTALLED_REQUESTS_VERSION of requests, but expected $EXPECTED_REQUESTS"
    exit 1
else
    echo "Using ${FOUND_PYTHONPATH} as PYTHONPATH, we found version $INSTALLED_REQUESTS_VERSION of requests, which was expected"
fi
