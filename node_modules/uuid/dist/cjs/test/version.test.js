"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const node_test_1 = require("node:test");
const version_js_1 = require("../version.js");
const test_constants_js_1 = require("./test_constants.js");
(0, node_test_1.describe)('version()', () => {
    (0, node_test_1.default)('TESTS cases', () => {
        for (const { value, expectedValidate, expectedVersion } of test_constants_js_1.TESTS) {
            try {
                const actualVersion = (0, version_js_1.default)(value);
                assert.ok(expectedValidate, `version(${value}) should throw`);
                assert.strictEqual(actualVersion, expectedVersion);
            }
            catch {
                assert.ok(!expectedValidate, `version(${value}) threw unexpectedly`);
            }
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyc2lvbi50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3Rlc3QvdmVyc2lvbi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsaUNBQWlDO0FBQ2pDLHlDQUEyQztBQUMzQyw4Q0FBb0M7QUFDcEMsMkRBQTRDO0FBRTVDLElBQUEsb0JBQVEsRUFBQyxXQUFXLEVBQUUsR0FBRyxFQUFFO0lBQ3pCLElBQUEsbUJBQUksRUFBQyxhQUFhLEVBQUUsR0FBRyxFQUFFO1FBQ3ZCLEtBQUssTUFBTSxFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxlQUFlLEVBQUUsSUFBSSx5QkFBSyxFQUFFLENBQUM7WUFDakUsSUFBSSxDQUFDO2dCQUVILE1BQU0sYUFBYSxHQUFHLElBQUEsb0JBQU8sRUFBQyxLQUFLLENBQUMsQ0FBQztnQkFFckMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsRUFBRSxXQUFXLEtBQUssZ0JBQWdCLENBQUMsQ0FBQztnQkFDOUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLEVBQUUsZUFBZSxDQUFDLENBQUM7WUFDckQsQ0FBQztZQUFDLE1BQU0sQ0FBQztnQkFDUCxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsZ0JBQWdCLEVBQUUsV0FBVyxLQUFLLHNCQUFzQixDQUFDLENBQUM7WUFDdkUsQ0FBQztRQUNILENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIn0=