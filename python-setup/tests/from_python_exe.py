#!/usr/bin/env python3

import sys
import os
import subprocess
from typing import Tuple

def get_details(path_to_python_exe: str) -> Tuple[str, str]:
    import_path = subprocess.check_output(
        [
            path_to_python_exe,
            "-c",
            "import os; import pip; print(os.path.dirname(os.path.dirname(pip.__file__)))",
        ],
        stdin=subprocess.DEVNULL,
    )
    version = subprocess.check_output(
        [path_to_python_exe, "-c", "import sys; print(sys.version_info[0])"],
        stdin=subprocess.DEVNULL,
    )

    return version.decode("utf-8").strip(), import_path.decode("utf-8").strip()


if __name__ == "__main__":
    version, import_path = get_details(sys.argv[1])

    # see https://docs.github.com/en/free-pro-team@latest/actions/reference/workflow-commands-for-github-actions#setting-an-environment-variable
    env_file = open(os.environ["GITHUB_ENV"], mode="at")

    print("Setting LGTM_PYTHON_SETUP_VERSION={}".format(version))
    print("LGTM_PYTHON_SETUP_VERSION={}".format(version), file=env_file)

    print("Setting LGTM_INDEX_IMPORT_PATH={}".format(import_path))
    print("LGTM_INDEX_IMPORT_PATH={}".format(import_path), file=env_file)
