"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const node_test_1 = require("node:test");
const rng_js_1 = require("../rng.js");
(0, node_test_1.describe)('rng', () => {
    (0, node_test_1.default)('Node.js RNG', () => {
        const bytes = (0, rng_js_1.default)();
        assert.equal(bytes.length, 16);
        for (let i = 0; i < bytes.length; ++i) {
            assert.equal(typeof bytes[i], 'number');
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm5nLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvdGVzdC9ybmcudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLGlDQUFpQztBQUNqQyx5Q0FBMkM7QUFDM0Msc0NBQTRCO0FBRTVCLElBQUEsb0JBQVEsRUFBQyxLQUFLLEVBQUUsR0FBRyxFQUFFO0lBQ25CLElBQUEsbUJBQUksRUFBQyxhQUFhLEVBQUUsR0FBRyxFQUFFO1FBQ3ZCLE1BQU0sS0FBSyxHQUFHLElBQUEsZ0JBQUcsR0FBRSxDQUFDO1FBQ3BCLE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztRQUUvQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQ3RDLE1BQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDMUMsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0FBSUwsQ0FBQyxDQUFDLENBQUMifQ==