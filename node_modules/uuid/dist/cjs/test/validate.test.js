"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const node_test_1 = require("node:test");
const validate_js_1 = require("../validate.js");
const test_constants_js_1 = require("./test_constants.js");
(0, node_test_1.describe)('validate()', () => {
    (0, node_test_1.default)('TESTS cases', () => {
        for (const { value, expectedValidate } of test_constants_js_1.TESTS) {
            assert.strictEqual((0, validate_js_1.default)(value), expectedValidate, `validate(${value}) should be ${expectedValidate}`);
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdGUudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy90ZXN0L3ZhbGlkYXRlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxpQ0FBaUM7QUFDakMseUNBQTJDO0FBQzNDLGdEQUFzQztBQUN0QywyREFBNEM7QUFFNUMsSUFBQSxvQkFBUSxFQUFDLFlBQVksRUFBRSxHQUFHLEVBQUU7SUFDMUIsSUFBQSxtQkFBSSxFQUFDLGFBQWEsRUFBRSxHQUFHLEVBQUU7UUFDdkIsS0FBSyxNQUFNLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLElBQUkseUJBQUssRUFBRSxDQUFDO1lBQ2hELE1BQU0sQ0FBQyxXQUFXLENBQ2hCLElBQUEscUJBQVEsRUFBQyxLQUFLLENBQUMsRUFDZixnQkFBZ0IsRUFDaEIsWUFBWSxLQUFLLGVBQWUsZ0JBQWdCLEVBQUUsQ0FDbkQsQ0FBQztRQUNKLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIn0=