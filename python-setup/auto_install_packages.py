#!/usr/bin/env python3

import sys
import os
import subprocess
from tempfile import mkdtemp

import extractor_version


def _check_call(command):
    print('+ {}'.format(' '.join(command)), flush=True)
    subprocess.check_call(command, stdin=subprocess.DEVNULL)


def _check_output(command):
    print('+ {}'.format(' '.join(command)), flush=True)
    out = subprocess.check_output(command, stdin=subprocess.DEVNULL)
    print(out, flush=True)
    sys.stderr.flush()
    return out


def install_packages_with_poetry():
    try:
        _check_call(['poetry', 'install', '--no-root'])
    except subprocess.CalledProcessError:
        sys.exit('package installation with poetry failed, see error above')

    # poetry is super annoying with `poetry run`, since it will put lots of output on
    # STDOUT if the current global python interpreter is not matching the one in the
    # virtualenv for the package, which was the case for using poetry for Python 2 when
    # default system interpreter was Python 3 :/

    poetry_out = _check_output(['poetry', 'run', 'which', 'python'])
    python_executable_path = poetry_out.decode('utf-8').splitlines()[-1]

    return python_executable_path


def install_packages_with_pipenv():
    try:
        _check_call(['pipenv', 'install', '--keep-outdated', '--ignore-pipfile'])
    except subprocess.CalledProcessError:
        sys.exit('package installation with pipenv failed, see error above')

    pipenv_out = _check_output(['pipenv', 'run', 'which', 'python'])
    python_executable_path = pipenv_out.decode('utf-8').splitlines()[-1]

    return python_executable_path


def install_requirements_txt_packages(version: int, requirements_txt_path: str):
    # create temporary directory ... that just lives "forever"
    venv_path = mkdtemp(prefix='codeql-action-python-autoinstall-')

    # virtualenv is a bit nicer for setting up virtual environment, since it will provide
    # up-to-date versions of pip/setuptools/wheel which basic `python3 -m venv venv` won't

    if version == 2:
        _check_call(['python2', '-m', 'virtualenv', venv_path])
    elif version == 3:
        _check_call(['python3', '-m', 'virtualenv', venv_path])

    venv_pip = os.path.join(venv_path, 'bin', 'pip')
    try:
        _check_call([venv_pip, 'install', '-r', requirements_txt_path])
    except subprocess.CalledProcessError:
        sys.exit('package installation with pip failed, see error above')

    venv_python = os.path.join(venv_path, 'bin', 'python')

    return venv_python


def install_packages() -> str:
    if os.path.exists('poetry.lock'):
        print('Found poetry.lock, will install packages with poetry', flush=True)
        return install_packages_with_poetry()

    if os.path.exists('Pipfile') or os.path.exists('Pipfile.lock'):
        if os.path.exists('Pipfile.lock'):
            print('Found Pipfile.lock, will install packages with Pipenv', flush=True)
        else:
            print('Found Pipfile, will install packages with Pipenv', flush=True)
        return install_packages_with_pipenv()

    version = extractor_version.get_extractor_version(sys.argv[1], quiet=False)

    if os.path.exists('requirements.txt'):
        print('Found requirements.txt, will install packages with pip', flush=True)
        return install_requirements_txt_packages(version, 'requirements.txt')

    print("was not able to install packages automatically", flush=True)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit('Must provide base directory for codeql tool as only argument')

    # The binaries for packages installed with `pip install --user` are not available on
    # PATH by default, so we need to manually add them.
    os.environ['PATH'] = os.path.expanduser('~/.local/bin') + os.pathsep + os.environ['PATH']

    python_executable_path = install_packages()

    if python_executable_path is not None:
        print("Setting CODEQL_PYTHON={}".format(python_executable_path))
        print("::set-env name=CODEQL_PYTHON::{}".format(python_executable_path))

# TODO:
# - no packages
# - poetry without version
# - pipenv without version
# - pipenv without lockfile