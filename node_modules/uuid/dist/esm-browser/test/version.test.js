import * as assert from 'assert';
import test, { describe } from 'node:test';
import version from '../version.js';
import { TESTS } from './test_constants.js';
describe('version()', () => {
    test('TESTS cases', () => {
        for (const { value, expectedValidate, expectedVersion } of TESTS) {
            try {
                const actualVersion = version(value);
                assert.ok(expectedValidate, `version(${value}) should throw`);
                assert.strictEqual(actualVersion, expectedVersion);
            }
            catch {
                assert.ok(!expectedValidate, `version(${value}) threw unexpectedly`);
            }
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyc2lvbi50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3Rlc3QvdmVyc2lvbi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sS0FBSyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ2pDLE9BQU8sSUFBSSxFQUFFLEVBQUUsUUFBUSxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBQzNDLE9BQU8sT0FBTyxNQUFNLGVBQWUsQ0FBQztBQUNwQyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFFNUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxHQUFHLEVBQUU7SUFDekIsSUFBSSxDQUFDLGFBQWEsRUFBRSxHQUFHLEVBQUU7UUFDdkIsS0FBSyxNQUFNLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLGVBQWUsRUFBRSxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ2pFLElBQUksQ0FBQztnQkFFSCxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBRXJDLE1BQU0sQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLEVBQUUsV0FBVyxLQUFLLGdCQUFnQixDQUFDLENBQUM7Z0JBQzlELE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1lBQ3JELENBQUM7WUFBQyxNQUFNLENBQUM7Z0JBQ1AsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLGdCQUFnQixFQUFFLFdBQVcsS0FBSyxzQkFBc0IsQ0FBQyxDQUFDO1lBQ3ZFLENBQUM7UUFDSCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyJ9