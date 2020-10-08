#!/usr/bin/env python3

import sys
import os
import subprocess
from tempfile import mkdtemp
from typing import Optional

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
    if sys.platform.startswith('win32'):
        os.environ['POETRY_VIRTUALENVS_PATH'] = os.path.join(os.environ['RUNNER_WORKSPACE', 'virtualenvs')
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

    if sys.platform.startswith('win32'):
        python_executable_path = python_executable_path[2:]
    return python_executable_path


def install_packages_with_pipenv():
    if sys.platform.startswith('win32'):
        os.environ['WORKON_HOME'] = os.path.join(os.environ['RUNNER_WORKSPACE'], 'virtualenvs')
    try:
        _check_call(['pipenv', 'install', '--keep-outdated', '--ignore-pipfile'])
    except subprocess.CalledProcessError:
        sys.exit('package installation with pipenv failed, see error above')

    pipenv_out = _check_output(['pipenv', 'run', 'which', 'python'])
    python_executable_path = pipenv_out.decode('utf-8').splitlines()[-1]

    if sys.platform.startswith('win32'):
        python_executable_path = python_executable_path[2:]
    return python_executable_path


def _create_venv(version: int):
    # create temporary directory ... that just lives "forever"
    venv_path = os.path.join(os.environ['RUNNER_WORKSPACE'], 'codeql-action-python-autoinstall')
    print ("Creating venv in " + venv_path, flush = True)

    # virtualenv is a bit nicer for setting up virtual environment, since it will provide
    # up-to-date versions of pip/setuptools/wheel which basic `python3 -m venv venv` won't

    if sys.platform.startswith('win32'):
        if version == 2:
            _check_call(['py', '-2', '-m', 'virtualenv', venv_path])
        elif version == 3:
            _check_call(['py', '-3', '-m', 'virtualenv', venv_path])
    else:
        if version == 2:
            _check_call(['python2', '-m', 'virtualenv', venv_path])
        elif version == 3:
            _check_call(['python3', '-m', 'virtualenv', venv_path])

    return venv_path


def install_requirements_txt_packages(version: int):
    venv_path = _create_venv(version)

    venv_pip = os.path.join(venv_path, 'bin', 'pip')
    venv_python = os.path.join(venv_path, 'bin', 'python')

    if sys.platform.startswith('win32'):
        venv_pip = os.path.join(venv_path, 'Scripts', 'pip')
        venv_python = os.path.join(venv_path, 'Scripts', 'python')

    try:
        _check_call([venv_pip, 'install', '-r', 'requirements.txt'])
    except subprocess.CalledProcessError:
        sys.exit('package installation with `pip install -r requirements.txt` failed, see error above')

    return venv_python


def install_with_setup_py(version: int):
    venv_path = _create_venv(version)

    venv_pip = os.path.join(venv_path, 'bin', 'pip')
    venv_python = os.path.join(venv_path, 'bin', 'python')

    if sys.platform.startswith('win32'):
        venv_pip = os.path.join(venv_path, 'Scripts', 'pip')
        venv_python = os.path.join(venv_path, 'Scripts', 'python')

    try:
        # We have to choose between `python setup.py develop` and `pip install -e .`.
        # Modern projects use `pip install -e .` and I wasn't able to see any downsides
        # to doing so. However, `python setup.py develop` has some downsides -- from
        # https://stackoverflow.com/a/19048754 :
        # > Note that it is highly recommended to use pip install . (install) and pip
        # > install -e . (developer install) to install packages, as invoking setup.py
        # > directly will do the wrong things for many dependencies, such as pull
        # > prereleases and incompatible package versions, or make the package hard to
        # > uninstall with pip.

        _check_call([venv_pip, 'install', '-e', '.'])
    except subprocess.CalledProcessError:
        sys.exit('package installation with `pip install -e .` failed, see error above')

    return venv_python


def install_packages(codeql_base_dir) -> Optional[str]:
    if os.path.exists('poetry.lock'):
        print('Found poetry.lock, will install packages with poetry', flush=True)
        return install_packages_with_poetry()

    if os.path.exists('Pipfile') or os.path.exists('Pipfile.lock'):
        if os.path.exists('Pipfile.lock'):
            print('Found Pipfile.lock, will install packages with Pipenv', flush=True)
        else:
            print('Found Pipfile, will install packages with Pipenv', flush=True)
        return install_packages_with_pipenv()

    # get_extractor_version returns the Python version the extractor thinks this repo is using
    version = extractor_version.get_extractor_version(codeql_base_dir, quiet=False)

    if os.path.exists('requirements.txt'):
        print('Found requirements.txt, will install packages with pip', flush=True)
        return install_requirements_txt_packages(version)

    if os.path.exists('setup.py'):
        print('Found setup.py, will install package with pip in editable mode', flush=True)
        return install_with_setup_py(version)

    print("was not able to install packages automatically", flush=True)
    return None


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit('Must provide base directory for codeql tool as only argument')

    codeql_base_dir = sys.argv[1]

    # The binaries for packages installed with `pip install --user` are not available on
    # PATH by default, so we need to manually add them.
    if sys.platform.startswith('win32'):
        os.environ['PATH'] = os.path.expandvars('%APPDATA%\Python\\Python38\\scripts') + os.pathsep + os.environ['PATH']
    else:
        os.environ['PATH'] = os.path.expanduser('~/.local/bin') + os.pathsep + os.environ['PATH']

    python_executable_path = install_packages(codeql_base_dir)

    if python_executable_path is not None:
        print("Setting CODEQL_PYTHON={}".format(python_executable_path))
        print("::set-env name=CODEQL_PYTHON::{}".format(python_executable_path))
