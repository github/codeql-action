import ruamel.yaml
import os

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
defaultOperatingSystems = ["ubuntu-latest", "macos-latest", "windows-2019"]
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
    for version in versions:
        for os in operatingSystems:
            matrix.append({
                'os': os,
                'version': version
            })
            if (version == 'latest' or version == 'nightly-latest') and os == 'windows-2019':
                # New versions of the CLI should also work with Windows Server 2022.
                # Once all versions of the CLI that we test against work with Windows Server 2022,
                # we should remove this logic and instead just add windows-2022 to the test matrix.
                matrix.append({
                    'os': 'windows-2022',
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
