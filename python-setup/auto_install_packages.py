#!/usr/bin/env python3

import sys
import os
import subprocess
from tempfile import mkdtemp
from typing import Optional
import shutil

import extractor_version


def _check_call(command, extra_env={}):
    print('+ {}'.format(' '.join(command)), flush=True)

    env = os.environ.copy()
    env.update(extra_env)
    subprocess.check_call(command, stdin=subprocess.DEVNULL, env=env)
    sys.stdout.flush()
    sys.stderr.flush()


def _check_output(command, extra_env={}):
    print('+ {}'.format(' '.join(command)), flush=True)

    env = os.environ.copy()
    env.update(extra_env)
    out = subprocess.check_output(command, stdin=subprocess.DEVNULL, env=env)
    print(out, flush=True)
    sys.stderr.flush()
    return out


def install_packages_with_poetry():

    extra_poetry_env = {
        # To handle poetry 1.2, which started to use keyring interaction MUCH more, we need
        # add a workaround. See
        # https://github.com/python-poetry/poetry/issues/2692#issuecomment-1235683370
        "PYTHON_KEYRING_BACKEND": "keyring.backends.null.Keyring",
        # Projects that specify `virtualenvs.in-project = true` in their poetry.toml
        # would get the venv created inside the repo directory, which would cause CodeQL
        # to consider it as user-written code. We don't want this to happen. see
        # https://python-poetry.org/docs/configuration/#virtualenvsin-project
        "POETRY_VIRTUALENVS_IN_PROJECT": "False",
    }

    command = [sys.executable, '-m', 'poetry']
    if sys.platform.startswith('win32'):
        # In windows the default path were the deps are installed gets wiped out between steps,
        # so we have to set it up to a folder that will be kept
        os.environ['POETRY_VIRTUALENVS_PATH'] = os.path.join(os.environ['RUNNER_WORKSPACE'], 'virtualenvs')
    try:
        _check_call(command + ['install', '--no-root'], extra_env=extra_poetry_env)
    except subprocess.CalledProcessError:
        sys.exit('package installation with poetry failed, see error above')

    # poetry is super annoying with `poetry run`, since it will put lots of output on
    # STDOUT if the current global python interpreter is not matching the one in the
    # virtualenv for the package, which was the case for using poetry for Python 2 when
    # default system interpreter was Python 3 :/

    poetry_out = _check_output(command + ['run', 'which', 'python'], extra_env=extra_poetry_env)
    python_executable_path = poetry_out.decode('utf-8').splitlines()[-1]

    if sys.platform.startswith('win32'):
        # Poetry produces a path that starts by /d instead of D:\ and Windows doesn't like that way of specifying the drive letter.
        # We completely remove it because it is not needed as everything is in the same drive (We are installing the dependencies in the RUNNER_WORKSPACE)
        python_executable_path = python_executable_path[2:]
    return python_executable_path


def install_packages_with_pipenv(has_lockfile):
    command = [sys.executable, '-m', 'pipenv']
    if sys.platform.startswith('win32'):
        # In windows the default path were the deps are installed gets wiped out between steps,
        # so we have to set it up to a folder that will be kept
        os.environ['WORKON_HOME'] = os.path.join(os.environ['RUNNER_WORKSPACE'], 'virtualenvs')
    lock_args = ['--keep-outdated', '--ignore-pipfile'] if has_lockfile else ['--skip-lock']
    try:
        _check_call(command + ['install'] + lock_args)
    except subprocess.CalledProcessError:
        sys.exit('package installation with pipenv failed, see error above')

    pipenv_out = _check_output(command + ['run', 'which', 'python'])
    python_executable_path = pipenv_out.decode('utf-8').splitlines()[-1]

    if sys.platform.startswith('win32'):
        # Pipenv produces a path that starts by /d instead of D:\ and Windows doesn't like that way of specifying the drive letter.
        # We completely remove it because it is not needed as everything is in the same drive (We are installing the dependencies in the RUNNER_WORKSPACE)
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
            return install_packages_with_pipenv(has_lockfile=True)
        else:
            print('Found Pipfile, will install packages with Pipenv', flush=True)
            return install_packages_with_pipenv(has_lockfile=False)

    # get_extractor_version returns the Python version the extractor thinks this repo is using
    version = extractor_version.get_extractor_version(codeql_base_dir, quiet=False)
    sys.stdout.flush()
    sys.stderr.flush()

    if version == 2 and not sys.platform.startswith('win32'):
        # On Ubuntu 22.04 'python2' is not available by default. We want to give a slightly better
        # error message than a traceback + `No such file or directory: 'python2'`
        if shutil.which("python2") is None:
            sys.exit(
                "Python package installation failed: we detected this code as Python 2, but the 'python2' executable was not available. "
                "To enable automatic package installation, please install 'python2' before the 'github/codeql-action/init' step, "
                "for example by running 'sudo apt install python2' (Ubuntu 22.04). "
                "If your code is not Python 2, but actually Python 3, please file a bug report at https://github.com/github/codeql-action/issues/new"
            )

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

    python_executable_path = install_packages(codeql_base_dir)

    if python_executable_path is not None:
        # see https://docs.github.com/en/free-pro-team@latest/actions/reference/workflow-commands-for-github-actions#setting-an-environment-variable
        env_file = open(os.environ["GITHUB_ENV"], mode="at")

        print("Setting CODEQL_PYTHON={}".format(python_executable_path))
        print("CODEQL_PYTHON={}".format(python_executable_path), file=env_file)
