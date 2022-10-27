import ruamel.yaml
import os

# The default set of CodeQL Bundle versions to use for the PR checks.
defaultTestVersions = [
    # The oldest supported CodeQL version: 2.4.5. If bumping, update `CODEQL_MINIMUM_VERSION` in `codeql.ts`
    "stable-20210308",
    # The last CodeQL release in the 2.4 series: 2.4.6.
    "stable-20210319",
    # The last CodeQL release in the 2.5 series: 2.5.9.
    "stable-20210809",
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
    # The first version of the CodeQL CLI compatible with the latest runner images is 2.7.3.
    # This appears in CodeQL Bundle version codeql-bundle-20211208.
    return date >= "20211208"


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
    steps.extend(checkSpecification['steps'])

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
    checkJob['env']['INTERNAL_CODEQL_ACTION_DEBUG_LOC'] = True
    checkName = file[:len(file) - 4]

    with open(f"../.github/workflows/__{checkName}.yml", 'w') as output_stream:
        writeHeader(output_stream)
        yaml.dump({
            'name': f"PR Check - {checkSpecification['name']}",
            'env': {
                'GITHUB_TOKEN': '${{ secrets.GITHUB_TOKEN }}',
                'GO111MODULE': 'auto',
            },
            'on': {
                'push': {
                    'branches': ['main', 'releases/v1', 'releases/v2']
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
