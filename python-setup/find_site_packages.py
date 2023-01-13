"""
Print the path to the site-packages directory for the current Python environment.
"""
from __future__ import print_function

try:
    import pip
    import os
    print(os.path.dirname(os.path.dirname(pip.__file__)))
except ImportError:
    import sys
    print("DEBUG: could not import pip", file=sys.stderr)
    # if you use poetry with `virtualenvs.options.no-pip = true` you might end up with a
    # virtualenv without pip, so the above trick doesn't actually work. See
    # https://python-poetry.org/docs/configuration/#virtualenvsoptionsno-pip
    #
    # A possible option is to install `pip` into the virtualenv created by poetry
    # (`poetry add pip`), but it turns out that doesn't always work :( for the test
    # poetry/requests-3, I was not allowed to install pip! So I did not pursue this
    # option further.
    #
    # Instead, testing `site.getsitepackages()` contains has the right path, whereas
    # `site.getusersitepackages()` is about the system python (very confusing).
    #
    # We can't use the environment variable POETRY_VIRTUALENVS_OPTIONS_NO_PIP because it
    # does not work, see https://github.com/python-poetry/poetry/issues/5906
    import site

    if sys.platform.startswith("win32"):
        # On windows, the last entry of `site.getsitepackages()` has the right path
        print(site.getsitepackages()[-1])
    else:
        # on unix, the first entry of `site.getsitepackages()` has the right path
        print(site.getsitepackages()[0])
