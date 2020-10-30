#! /usr/bin/pwsh

$EXPECTED_VERSION=$args[0]

$FOUND_VERSION="$Env:LGTM_PYTHON_SETUP_VERSION"
$FOUND_PYTHONPATH="$Env:LGTM_INDEX_IMPORT_PATH"

write-host "FOUND_VERSION=$FOUND_VERSION FOUND_PYTHONPATH=$FOUND_PYTHONPATH "

if ($FOUND_VERSION -ne $EXPECTED_VERSION) {
    write-host "Script told us to use Python $FOUND_VERSION, but expected $EXPECTED_VERSION"
    exit 1
} else {
    write-host "Script told us to use Python $FOUND_VERSION, which was expected"
}

$env:PYTHONPATH=$FOUND_PYTHONPATH

$INSTALLED_REQUESTS_VERSION = (py -3 -c "import requests; print(requests.__version__)")

$EXPECTED_REQUESTS="1.2.3"

if ($INSTALLED_REQUESTS_VERSION -ne $EXPECTED_REQUESTS) {
    write-host "Using $FOUND_PYTHONPATH as PYTHONPATH, we found version $INSTALLED_REQUESTS_VERSION of requests, but expected $EXPECTED_REQUESTS"
    exit 1
} else {
    write-host "Using $FOUND_PYTHONPATH as PYTHONPATH, we found version $INSTALLED_REQUESTS_VERSION of requests, which was expected"
}