#!/usr/bin/env python

# A quick hack to get package installation for Code Scanning to work,
# since it needs to know which version we're going to analyze the project as.

# This file needs to be placed next to `python_tracer.py`, so in
# `<codeql-path>/python/tools/`

from __future__ import print_function, division

import os
import sys
from contextlib import contextmanager


@contextmanager
def suppress_stdout_stderr():
    # taken from
    # https://thesmithfam.org/blog/2012/10/25/temporarily-suppress-console-output-in-python/
    with open(os.devnull, "w") as devnull:
        old_stdout = sys.stdout
        old_stderr = sys.stderr
        sys.stdout = devnull
        sys.stderr = devnull
        try:
            yield
        finally:
            sys.stdout = old_stdout
            sys.stderr = old_stderr


def get_extractor_version(codeql_base_dir: str, quiet: bool = True) -> int:

    extractor_dir = os.path.join(codeql_base_dir, 'python', 'tools')
    sys.path = [extractor_dir] + sys.path

    from python_tracer import getzipfilename

    zippath = os.path.join(extractor_dir, getzipfilename())
    sys.path = [zippath] + sys.path
    import buildtools.discover

    if quiet:
        with suppress_stdout_stderr():
            return buildtools.discover.get_version()
    else:
        return buildtools.discover.get_version()


if __name__ == "__main__":
    codeql_base_dir = sys.argv[1]
    version = get_extractor_version(codeql_base_dir)
    print('{!r}'.format(version))