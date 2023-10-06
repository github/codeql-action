#! /usr/bin/pwsh

# If we are running greater than or equal to python 3.12, add src to the python path
Write-Host "Checking python version"
Write-Host "PYTHONPATH $Env:PYTHONPATH"
if ((py -3 -c "import sys; print(0 if sys.version_info >= (3, 12) else 1)") -eq "0") {
    Write-Host "Python 3.12+ detected, adding imp.py to PYTHONPATH"
    Write-Output "PYTHONPATH=$Env:PYTHONPATH;$PSScriptRoot/src" | Out-File -FilePath $Env:GITHUB_ENV -Encoding utf8 -Append
} else {
    Write-Host "Python 3.12+ not detected, not adding imp.py to PYTHONPATH"
}

py -2 -m pip install --user --upgrade pip setuptools wheel
py -3 -m pip install --user --upgrade pip setuptools wheel

# virtualenv is a bit nicer for setting up virtual environment, since it will provide up-to-date versions of
# pip/setuptools/wheel which basic `python3 -m venv venv` won't
py -2 -m pip install --user 'virtualenv!=20.12.0'
py -3 -m pip install --user virtualenv

py -3 -m pip install --user "poetry>=1.1"
py -3 -m pip install --user pipenv
