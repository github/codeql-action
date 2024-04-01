#!/usr/bin/env python

import ruamel.yaml
from ruamel.yaml.scalarstring import FoldedScalarString
import pathlib
import textwrap

# The default set of CodeQL Bundle versions to use for the PR checks.
defaultTestVersions = [
    # The oldest supported CodeQL version: 2.11.6. If bumping, update `CODEQL_MINIMUM_VERSION` in `codeql.ts`
    "stable-20221211",
    # The last CodeQL release in the 2.12 series: 2.12.7.
    "stable-20230418",
    # The last CodeQL release in the 2.13 series: 2.13.5.
    "stable-v2.13.5",
    # The last CodeQL release in the 2.14 series: 2.14.6.
    "stable-v2.14.6",
    # The default version of CodeQL for Dotcom, as determined by feature flags.
    "default",
    # The version of CodeQL shipped with the Action in `defaults.json`. During the release process
    # for a new CodeQL release, there will be a period of time during which this will be newer than
    # the default version on Dotcom.
    "latest",
    # A nightly build directly from the our private repo, built in the last 24 hours.
    "nightly-latest"
]

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

this_dir = pathlib.Path(__file__).resolve().parent

allJobs = {}
for file in (this_dir / 'checks').glob('*.yml'):
    with open(file, 'r') as checkStream:
        checkSpecification = yaml.load(checkStream)

    matrix = []
    for version in checkSpecification.get('versions', defaultTestVersions):
        runnerImages = ["ubuntu-latest", "macos-latest", "windows-latest"]
        if checkSpecification.get('operatingSystems', None):
            runnerImages = [image for image in runnerImages for operatingSystem in checkSpecification['operatingSystems']
                            if image.startswith(operatingSystem)]

        for runnerImage in runnerImages:
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
                    matrix.os == 'macos-latest' && (
                    matrix.version == 'stable-20221211' ||
                    matrix.version == 'stable-20230418' ||
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
                'setup-kotlin': not 'container' in checkSpecification,
            }
        },
        # We don't support Swift on Windows or prior versions of the CLI.
        {
            'name': 'Set environment variable for Swift enablement',
            'if': "runner.os != 'Windows' && matrix.version == '20221211'",
            'shell': 'bash',
            'run': 'echo "CODEQL_ENABLE_EXPERIMENTAL_FEATURES_SWIFT=true" >> $GITHUB_ENV'
        },
    ]

    steps.extend(checkSpecification['steps'])

    checkJob = {
        'strategy': {
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
                'workflow_dispatch': {}
            },
            'jobs': {
                checkName: checkJob
            }
        }, output_stream)
