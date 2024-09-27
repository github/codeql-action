#!/usr/bin/env python

import ruamel.yaml
from ruamel.yaml.scalarstring import FoldedScalarString, SingleQuotedScalarString
import pathlib
import textwrap

# The default set of CodeQL Bundle versions to use for the PR checks.
defaultTestVersions = [
    # The oldest supported CodeQL version. If bumping, update `CODEQL_MINIMUM_VERSION` in `codeql.ts`
    "stable-v2.13.5",
    # The last CodeQL release in the 2.14 series.
    "stable-v2.14.6",
    # The last CodeQL release in the 2.15 series.
    "stable-v2.15.5",
    # The last CodeQL release in the 2.16 series.
    "stable-v2.16.6",
    # The last CodeQL release in the 2.17 series.
    "stable-v2.17.6",
    # The default version of CodeQL for Dotcom, as determined by feature flags.
    "default",
    # The version of CodeQL shipped with the Action in `defaults.json`. During the release process
    # for a new CodeQL release, there will be a period of time during which this will be newer than
    # the default version on Dotcom.
    "linked",
    # A nightly build directly from the our private repo, built in the last 24 hours.
    "nightly-latest"
]

def is_os_and_version_excluded(os, version, exclude_params):
    for exclude_param in exclude_params:
        if exclude_param[0] == os and exclude_param[1] == version:
            return True
    return False

# When updating the ruamel.yaml version here, update the PR check in
# `.github/workflows/pr-checks.yml` too.
header = """# Warning: This file is generated automatically, and should not be modified.
# Instead, please modify the template in the pr-checks directory and run:
#     (cd pr-checks; pip install ruamel.yaml@0.17.31 && python3 sync.py)
# to regenerate this file.

"""


class NonAliasingRTRepresenter(ruamel.yaml.representer.RoundTripRepresenter):
    def ignore_aliases(self, data):
        return True


def writeHeader(checkStream):
    checkStream.write(header)


yaml = ruamel.yaml.YAML()
yaml.Representer = NonAliasingRTRepresenter
yaml.indent(mapping=2, sequence=4, offset=2)

this_dir = pathlib.Path(__file__).resolve().parent

allJobs = {}
for file in (this_dir / 'checks').glob('*.yml'):
    with open(file, 'r') as checkStream:
        checkSpecification = yaml.load(checkStream)
    matrix = []
    excludedOsesAndVersions = checkSpecification.get('excludeOsAndVersionCombination', [])
    for version in checkSpecification.get('versions', defaultTestVersions):
        if version == "latest":
            raise ValueError('Did not recognize "version: latest". Did you mean "version: linked"?')

        runnerImages = ["ubuntu-latest", "macos-latest", "windows-latest"]
        operatingSystems = checkSpecification.get('operatingSystems', ["ubuntu", "macos", "windows"])

        for operatingSystem in operatingSystems:
            runnerImagesForOs = [image for image in runnerImages if image.startswith(operatingSystem)]

            for runnerImage in runnerImagesForOs:
                # Skip appending this combination to the matrix if it is explicitly excluded.
                if is_os_and_version_excluded(operatingSystem, version, excludedOsesAndVersions):
                    continue

                # Prior to CLI v2.15.1, ARM runners were not supported by the build tracer.
                # "macos-latest" is now an ARM runner, so we run tests on the old CLIs on Intel runners instead.
                if version in ["stable-v2.13.5", "stable-v2.14.6"] and runnerImage == "macos-latest":
                    matrix.append({
                        'os': "macos-12",
                        'version': version
                    })
                else:
                    matrix.append({
                        'os': runnerImage,
                        'version': version
                    })

        useAllPlatformBundle = "false" # Default to false
        if checkSpecification.get('useAllPlatformBundle'):
            useAllPlatformBundle = checkSpecification['useAllPlatformBundle']

    steps = [
        {
            'name': 'Setup Python on MacOS',
            'uses': 'actions/setup-python@v5',
            # Ensure that this is serialized as a folded (`>`) string to preserve the readability
            # of the generated workflow.
            'if': FoldedScalarString(textwrap.dedent('''
                    runner.os == 'macOS' && (
                    matrix.version == 'stable-v2.13.5' ||
                    matrix.version == 'stable-v2.14.6')
            ''').strip()),
            'with': {
                'python-version': '3.11'
            }
        },
        {
            'name': 'Check out repository',
            'uses': 'actions/checkout@v4'
        },
        {
            'name': 'Prepare test',
            'id': 'prepare-test',
            'uses': './.github/actions/prepare-test',
            'with': {
                'version': '${{ matrix.version }}',
                'use-all-platform-bundle': useAllPlatformBundle,
                # If the action is being run from a container, then do not setup kotlin.
                # This is because the kotlin binaries cannot be downloaded from the container.
                'setup-kotlin': str(not 'container' in checkSpecification).lower(),
            }
        },
    ]

    steps.extend(checkSpecification['steps'])

    checkJob = {
        'strategy': {
            'fail-fast': False,
            'matrix': {
                'include': matrix
            }
        },
        'name': checkSpecification['name'],
        'permissions': {
            'contents': 'read',
            'security-events': 'write'
        },
        'timeout-minutes': 45,
        'runs-on': '${{ matrix.os }}',
        'steps': steps,
    }
    if 'permissions' in checkSpecification:
        checkJob['permissions'] = checkSpecification['permissions']

    for key in ["env", "container", "services"]:
        if key in checkSpecification:
            checkJob[key] = checkSpecification[key]

    checkJob['env'] = checkJob.get('env', {})
    if 'CODEQL_ACTION_TEST_MODE' not in checkJob['env']:
        checkJob['env']['CODEQL_ACTION_TEST_MODE'] = True
    checkName = file.stem

    with open(this_dir.parent / ".github" / "workflows" / f"__{checkName}.yml", 'w') as output_stream:
        writeHeader(output_stream)
        yaml.dump({
            'name': f"PR Check - {checkSpecification['name']}",
            'env': {
                'GITHUB_TOKEN': '${{ secrets.GITHUB_TOKEN }}',
                'GO111MODULE': 'auto'
            },
            'on': {
                'push': {
                    'branches': ['main', 'releases/v*']
                },
                'pull_request': {
                    'types': ["opened", "synchronize", "reopened", "ready_for_review"]
                },
                'schedule': [{'cron': SingleQuotedScalarString('0 5 * * *')}],
                'workflow_dispatch': {}
            },
            'jobs': {
                checkName: checkJob
            }
        }, output_stream)
