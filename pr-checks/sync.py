import ruamel.yaml
import os

defaultTestVersions = [
    # The oldest supported CodeQL version: 2.3.1. If bumping, update `CODEQL_MINIMUM_VERSION` in `codeql.ts`
    "stable-20201028",
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
defaultOperatingSystems = ["ubuntu-latest", "macos-latest", "windows-latest"]
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

    versions = defaultTestVersions
    if 'versions' in checkSpecification:
        versions = checkSpecification['versions']
    operatingSystems = defaultOperatingSystems
    if 'os' in checkSpecification:
        operatingSystems = checkSpecification['os']

    steps = [
        {
            'name': 'Check out repository',
            'uses': 'actions/checkout@v2'
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

    checkJob = {
        'strategy': {
            'matrix': {
                'version': versions,
                'os': operatingSystems
            }
        },
        'name': checkSpecification['name'],
        'runs-on': '${{ matrix.os }}',
        'steps': steps
    }

    for key in ["env", "container", "services"]:
        if key in checkSpecification:
            checkJob[key] = checkSpecification[key]

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
                    'branches': ['main', 'v1']
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
