
#! /usr/bin/pwsh

# If we are running greater than or equal to python 3.12, add src to the python path
Write-Host "Checking python version"
if ((py -3 -c "import sys; print(0 if sys.version_info >= (3, 12) else 1)") -eq "0") {
  Write-Host "Python 3.12+ detected, setting PY_PYTHON3=3.11"
  py -3.11 -c "import imp"
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Python 3.11 detected, using this version instead of 3.12+."
    Write-Output "PY_PYTHON3=3.11" | Out-File -FilePath $Env:GITHUB_ENV -Encoding utf8 -Append
  } else {
    Write-Host "FAILURE: Python 3.12+ is not supported. Please install Python 3.11."
    exit 1
  }
} else {
  Write-Host "Python 3.12+ not detected, not making any changes."
}
