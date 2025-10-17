#!/usr/bin/env python

import ruamel.yaml
from ruamel.yaml.scalarstring import SingleQuotedScalarString
import pathlib
import os

# The default set of CodeQL Bundle versions to use for the PR checks.
defaultTestVersions = [
    # The oldest supported CodeQL version. If bumping, update `CODEQL_MINIMUM_VERSION` in `codeql.ts`
    "stable-v2.17.6",
    # The last CodeQL release in the 2.18 series.
    "stable-v2.18.4",
    # The last CodeQL release in the 2.19 series.
    "stable-v2.19.4",
    # The last CodeQL release in the 2.20 series.
    "stable-v2.20.7",
    # The last CodeQL release in the 2.21 series.
    "stable-v2.21.4",
    # The last CodeQL release in the 2.22 series.
    "stable-v2.22.4",
    # The default version of CodeQL for Dotcom, as determined by feature flags.
    "default",
    # The version of CodeQL shipped with the Action in `defaults.json`. During the release process
    # for a new CodeQL release, there will be a period of time during which this will be newer than
    # the default version on Dotcom.
    "linked",
    # A nightly build directly from the our private repo, built in the last 24 hours.
    "nightly-latest"
]

# When updating the ruamel.yaml version here, update the PR check in
# `.github/workflows/pr-checks.yml` too.
header = """# Warning: This file is generated automatically, and should not be modified.
# Instead, please modify the template in the pr-checks directory and run:
#     pr-checks/sync.sh
# to regenerate this file.

"""


def is_truthy(value):
    if isinstance(value, str):
        return value.lower() == 'true'
    return bool(value)



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
collections = {}
for file in sorted((this_dir / 'checks').glob('*.yml')):
    with open(file, 'r') as checkStream:
        checkSpecification = yaml.load(checkStream)
    matrix = []

    workflowInputs = {}
    if 'inputs' in checkSpecification:
        workflowInputs = checkSpecification['inputs']

    for version in checkSpecification.get('versions', defaultTestVersions):
        if version == "latest":
            raise ValueError('Did not recognize "version: latest". Did you mean "version: linked"?')

        runnerImages = ["ubuntu-latest", "macos-latest", "windows-latest"]
        operatingSystems = checkSpecification.get('operatingSystems', ["ubuntu"])

        for operatingSystem in operatingSystems:
            runnerImagesForOs = [image for image in runnerImages if image.startswith(operatingSystem)]

            for runnerImage in runnerImagesForOs:
                matrix.append({
                    'os': runnerImage,
                    'version': version
                })

        useAllPlatformBundle = "false" # Default to false
        if checkSpecification.get('useAllPlatformBundle'):
            useAllPlatformBundle = checkSpecification['useAllPlatformBundle']


    if 'analysisKinds' in checkSpecification:
        newMatrix = []
        for matrixInclude in matrix:
            for analysisKind in checkSpecification.get('analysisKinds'):
                newMatrix.append(
                    matrixInclude |
                    { 'analysis-kinds': analysisKind }
                )
        matrix = newMatrix

    # Construct the workflow steps needed for this check.
    steps = [
        {
            'name': 'Check out repository',
            'uses': 'actions/checkout@v5'
        },
    ]

    installNode = is_truthy(checkSpecification.get('installNode', ''))

    if installNode:
        steps.extend([
            {
                'name': 'Install Node.js',
                'uses': 'actions/setup-node@v5',
                'with': {
                    'node-version': '20.x',
                    'cache': 'npm',
                },
            },
            {
                'name': 'Install dependencies',
                'run': 'npm ci',
            },
        ])

    steps.append({
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
    })

    installGo = is_truthy(checkSpecification.get('installGo', ''))

    if installGo:
        baseGoVersionExpr = '>=1.21.0'
        workflowInputs['go-version'] = {
            'type': 'string',
            'description': 'The version of Go to install',
            'required': False,
            'default': baseGoVersionExpr,
        }

        steps.append({
            'name': 'Install Go',
            'uses': 'actions/setup-go@v6',
            'with': {
                'go-version': '${{ inputs.go-version || \'' + baseGoVersionExpr + '\' }}',
                # to avoid potentially misleading autobuilder results where we expect it to download
                # dependencies successfully, but they actually come from a warm cache
                'cache': False
            }
        })

    installJava = is_truthy(checkSpecification.get('installJava', ''))

    if installJava:
        baseJavaVersionExpr = '17'
        workflowInputs['java-version'] = {
            'type': 'string',
            'description': 'The version of Java to install',
            'required': False,
            'default': baseJavaVersionExpr,
        }

        steps.append({
            'name': 'Install Java',
            'uses': 'actions/setup-java@v5',
            'with': {
                'java-version': '${{ inputs.java-version || \'' + baseJavaVersionExpr + '\' }}',
                'distribution': 'temurin'
            }
        })

    installPython = is_truthy(checkSpecification.get('installPython', ''))

    if installPython:
        basePythonVersionExpr = '3.13'
        workflowInputs['python-version'] = {
            'type': 'string',
            'description': 'The version of Python to install',
            'required': False,
            'default': basePythonVersionExpr,
        }

        steps.append({
            'name': 'Install Python',
            'if': 'matrix.version != \'nightly-latest\'',
            'uses': 'actions/setup-python@v6',
            'with': {
                'python-version': '${{ inputs.python-version || \'' + basePythonVersionExpr + '\' }}'
            }
        })

    # If container initialisation steps are present in the check specification,
    # make sure to execute them first.
    if 'container' in checkSpecification and 'container-init-steps' in checkSpecification:
        steps.insert(0, checkSpecification['container-init-steps'])


    steps.extend(checkSpecification['steps'])

    checkJob = {
        'strategy': {
            'fail-fast': False,
            'matrix': {
                'include': matrix
            }
        },
        'name': checkSpecification['name'],
        'if': 'github.triggering_actor != \'dependabot[bot]\'',
        'permissions': {
            'contents': 'read',
            'security-events': 'read'
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

    # If this check belongs to a named collection, record it.
    if 'collection' in checkSpecification:
        collection_name = checkSpecification['collection']
        collections.setdefault(collection_name, []).append({
            'specification': checkSpecification,
            'checkName': checkName,
            'inputs': workflowInputs
        })

    raw_file = this_dir.parent / ".github" / "workflows" / f"__{checkName}.yml.raw"
    with open(raw_file, 'w', newline='\n') as output_stream:
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
                'workflow_dispatch': {
                    'inputs': workflowInputs
                },
                'workflow_call': {
                    'inputs': workflowInputs
                }
            },
            'defaults': {
                'run': {
                    'shell': 'bash',
                },
            },
            'concurrency': {
                # Cancel in-progress workflows in the same 'group' for pull_request events,
                # but not other event types. This should have the effect that workflows on PRs
                # get cancelled if there is a newer workflow in the same concurrency group.
                # For other events, the new workflows should wait until earlier ones have finished.
                # This should help reduce the number of concurrent workflows on the repo, and
                # consequently the number of concurrent API requests.
                'cancel-in-progress': "${{ github.event_name == 'pull_request' }}",
                # The group is determined by the workflow name + the ref
                'group': "${{ github.workflow }}-${{ github.ref }}"
            },
            'jobs': {
                checkName: checkJob
            }
        }, output_stream)

    with open(raw_file, 'r') as input_stream:
        with open(this_dir.parent / ".github" / "workflows" / f"__{checkName}.yml", 'w', newline='\n') as output_stream:
            content = input_stream.read()
            output_stream.write("\n".join(list(map(lambda x:x.rstrip(), content.splitlines()))+['']))
    os.remove(raw_file)

# write workflow files for collections
for collection_name in collections:
    jobs = {}
    combinedInputs = {}

    for check in collections[collection_name]:
        checkName = check['checkName']
        checkSpecification = check['specification']
        checkInputs = check['inputs']
        checkWith = {}

        combinedInputs |= checkInputs

        for inputName in checkInputs.keys():
            checkWith[inputName] = "${{ inputs." + inputName + " }}"

        jobs[checkName] = {
            'name': checkSpecification['name'],
            'permissions': {
                'contents': 'read',
                'security-events': 'read'
            },
            'uses': "./.github/workflows/" + f"__{checkName}.yml",
            'with': checkWith
        }

    raw_file = this_dir.parent / ".github" / "workflows" / f"__{collection_name}.yml.raw"
    with open(raw_file, 'w') as output_stream:
        writeHeader(output_stream)
        yaml.dump({
            'name': f"Manual Check - {collection_name}",
            'env': {
                'GITHUB_TOKEN': '${{ secrets.GITHUB_TOKEN }}',
                'GO111MODULE': 'auto'
            },
            'on': {
                'push': {
                    'paths': [
                        f'.github/workflows/__{collection_name}.yml'
                    ]
                },
                'workflow_dispatch': {
                    'inputs': combinedInputs
                },
            },
            'jobs': jobs
        }, output_stream)

    with open(raw_file, 'r') as input_stream:
        with open(this_dir.parent / ".github" / "workflows" / f"__{collection_name}.yml", 'w', newline='\n') as output_stream:
            content = input_stream.read()
            output_stream.write("\n".join(list(map(lambda x:x.rstrip(), content.splitlines()))+['']))
    os.remove(raw_file)
