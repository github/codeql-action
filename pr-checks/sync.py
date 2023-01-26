import ruamel.yaml
import os

# The default set of CodeQL Bundle versions to use for the PR checks.
defaultTestVersions = [
    # The oldest supported CodeQL version: 2.6.3. If bumping, update `CODEQL_MINIMUM_VERSION` in `codeql.ts`
    "stable-20211005",
    # The last CodeQL release in the 2.7 series: 2.7.6.
    "stable-20220120",
    # The last CodeQL release in the 2.8 series: 2.8.5.
    "stable-20220401",
    # The version of CodeQL currently in the toolcache. Typically either the latest release or the one before.
    "cached",
    # The latest release of CodeQL.
    "latest",
    # A nightly build directly from the our private repo, built in the last 24 hours.
    "nightly-latest"
]


def isCompatibleWithLatestImages(version):
    if version in ["cached", "latest", "nightly-latest"]:
        return True
    date = version.split("-")[1]
    # The first version of the CodeQL CLI compatible with `ubuntu-22.04` and `windows-2022` is
    # 2.8.2. This appears in CodeQL Bundle version codeql-bundle-20220224.
    return date >= "20220224"


def operatingSystemsForVersion(version):
    if isCompatibleWithLatestImages(version):
        return ["ubuntu-latest", "macos-latest", "windows-latest"]
    else:
        return ["ubuntu-20.04", "macos-latest", "windows-2019"]


header = """# Warning: This file is generated automatically, and should not be modified.
# Instead, please modify the template in the pr-checks directory and run:
#     pip install ruamel.yaml && python3 sync.py
# to regenerate this file.

"""


class NonAliasingRTRepresenter(ruamel.yaml.representer.RoundTripRepresenter):
    def ignore_aliases(self, data):
        return True


def writeHeader(checkStream):
    checkStream.write(header)


yaml = ruamel.yaml.YAML()
yaml.Representer = NonAliasingRTRepresenter
allJobs = {}
for file in os.listdir('checks'):
    with open(f"checks/{file}", 'r') as checkStream:
        checkSpecification = yaml.load(checkStream)

    matrix = []
    for version in checkSpecification.get('versions', defaultTestVersions):
        runnerImages = operatingSystemsForVersion(version)
        if checkSpecification.get('operatingSystems', None):
            runnerImages = [image for image in runnerImages for operatingSystem in checkSpecification['operatingSystems']
                            if image.startswith(operatingSystem)]

        for runnerImage in runnerImages:
            matrix.append({
                'os': runnerImage,
                'version': version
            })

    steps = [
        {
            'name': 'Check out repository',
            'uses': 'actions/checkout@v3'
        },
        {
            'name': 'Prepare test',
            'id': 'prepare-test',
            'uses': './.github/prepare-test',
            'with': {
                'version': '${{ matrix.version }}'
            }
        }
    ]

    if any(not isCompatibleWithLatestImages(m['version']) for m in matrix):
        steps.append({
            'name': 'Set up Go',
            'if': "matrix.os == 'ubuntu-20.04' || matrix.os == 'windows-2019'",
            'uses': 'actions/setup-go@v3',
            'with': {
                'go-version': '^1.13.1'
            }
        })

    steps.extend(checkSpecification['steps'])

    checkJob = {
        'strategy': {
            'matrix': {
                'include': matrix
            }
        },
        'name': checkSpecification['name'],
        'timeout-minutes': 45,
        'runs-on': '${{ matrix.os }}',
        'steps': steps
    }

    for key in ["env", "container", "services"]:
        if key in checkSpecification:
            checkJob[key] = checkSpecification[key]

    checkJob['env'] = checkJob.get('env', {})
    if 'CODEQL_ACTION_TEST_MODE' not in checkJob['env']:
        checkJob['env']['CODEQL_ACTION_TEST_MODE'] = True
    checkName = file[:len(file) - 4]

    with open(f"../.github/workflows/__{checkName}.yml", 'w') as output_stream:
        writeHeader(output_stream)
        yaml.dump({
            'name': f"PR Check - {checkSpecification['name']}",
            'env': {
                'GITHUB_TOKEN': '${{ secrets.GITHUB_TOKEN }}',
                'GO111MODULE': 'auto',
                # Disable Kotlin analysis while it's incompatible with Kotlin 1.8, until we find a
                # workaround for our PR checks.
                'CODEQL_EXTRACTOR_JAVA_AGENT_DISABLE_KOTLIN': 'true',
            },
            'on': {
                'push': {
                    'branches': ['main', 'releases/v2']
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
