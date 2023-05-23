#! /usr/bin/pwsh

$EXPECTED_PYTHON_VERSION=$args[0]
$EXPECTED_REQUESTS_VERSION=$args[1]

$FOUND_PYTHON_VERSION="$Env:LGTM_PYTHON_SETUP_VERSION"
$FOUND_PYTHONPATH="$Env:LGTM_INDEX_IMPORT_PATH"

write-host "FOUND_PYTHON_VERSION=$FOUND_PYTHON_VERSION FOUND_PYTHONPATH=$FOUND_PYTHONPATH "

if ($FOUND_PYTHON_VERSION -ne $EXPECTED_PYTHON_VERSION) {
    write-host "Script told us to use Python $FOUND_PYTHON_VERSION, but expected $EXPECTED_PYTHON_VERSION"
    exit 1
} else {
    write-host "Script told us to use Python $FOUND_PYTHON_VERSION, which was expected"
}

$env:PYTHONPATH=$FOUND_PYTHONPATH

$INSTALLED_REQUESTS_VERSION = (py -3 -c "import requests; print(requests.__version__)")

if ($INSTALLED_REQUESTS_VERSION -ne $EXPECTED_REQUESTS_VERSION) {
    write-host "Using $FOUND_PYTHONPATH as PYTHONPATH, we found version $INSTALLED_REQUESTS_VERSION of requests, but expected $EXPECTED_REQUESTS_VERSION"
    exit 1
} else {
    write-host "Using $FOUND_PYTHONPATH as PYTHONPATH, we found version $INSTALLED_REQUESTS_VERSION of requests, which was expected"
}
