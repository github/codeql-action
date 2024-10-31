import * as assert from 'assert';
import test, { describe } from 'node:test';
import validate from '../validate.js';
import { TESTS } from './test_constants.js';
describe('validate()', () => {
    test('TESTS cases', () => {
        for (const { value, expectedValidate } of TESTS) {
            assert.strictEqual(validate(value), expectedValidate, `validate(${value}) should be ${expectedValidate}`);
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdGUudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy90ZXN0L3ZhbGlkYXRlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxLQUFLLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDakMsT0FBTyxJQUFJLEVBQUUsRUFBRSxRQUFRLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFDM0MsT0FBTyxRQUFRLE1BQU0sZ0JBQWdCLENBQUM7QUFDdEMsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRTVDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsR0FBRyxFQUFFO0lBQzFCLElBQUksQ0FBQyxhQUFhLEVBQUUsR0FBRyxFQUFFO1FBQ3ZCLEtBQUssTUFBTSxFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ2hELE1BQU0sQ0FBQyxXQUFXLENBQ2hCLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFDZixnQkFBZ0IsRUFDaEIsWUFBWSxLQUFLLGVBQWUsZ0JBQWdCLEVBQUUsQ0FDbkQsQ0FBQztRQUNKLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIn0=