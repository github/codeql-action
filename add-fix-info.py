import json
import re
import sys

def main():
    if len(sys.argv) != 2:
        print('Usage: python3 add-fix-info.py <input.sarif>')
        sys.exit(1)

    with open(sys.argv[1]) as input_file:
        sarif = json.load(input_file)

    for run in sarif['runs']:
        for result in run['results']:
            if result['ruleId'] == 'js/regex/duplicate-in-character-class':
                if 'fixes' in result:
                    print('Found result for js/regex/duplicate-in-character-class but result already has fixes')
                    continue

                print('Adding fix for js/regex/duplicate-in-character-class')

                repeatedCharacter = re.search("^Character '(.)'", result['message']['text']).group(1)
                resultPhysicalLocation = result['locations'][0]['physicalLocation']
                result['fixes'] = [
                    {
                        "description": {
                            "text": "Remove repeated '" + repeatedCharacter + "' from character class"
                        },
                        "artifactChanges": [
                            {
                                "artifactLocation": {
                                    "uri": resultPhysicalLocation['artifactLocation']['uri']
                                },
                                "replacements": [
                                    {
                                        "deletedRegion": resultPhysicalLocation['region'],
                                        "insertedContent": {
                                            "text": ""
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                ]
    
    with open(sys.argv[1], 'w') as input_file:
        json.dump(sarif, input_file, indent = 2)

if __name__ == '__main__':
    main()
