"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const v1_js_1 = require("./v1.js");
const v3_js_1 = require("./v3.js");
const v4_js_1 = require("./v4.js");
const v5_js_1 = require("./v5.js");
const v6_js_1 = require("./v6.js");
const v7_js_1 = require("./v7.js");
function usage() {
    console.log('Usage:');
    console.log('  uuid');
    console.log('  uuid v1');
    console.log('  uuid v3 <name> <namespace uuid>');
    console.log('  uuid v4');
    console.log('  uuid v5 <name> <namespace uuid>');
    console.log('  uuid v6');
    console.log('  uuid v7');
    console.log('  uuid --help');
    console.log('\nNote: <namespace uuid> may be "URL" or "DNS" to use the corresponding UUIDs defined by RFC9562');
}
const args = process.argv.slice(2);
if (args.indexOf('--help') >= 0) {
    usage();
    process.exit(0);
}
const version = args.shift() || 'v4';
switch (version) {
    case 'v1':
        console.log((0, v1_js_1.default)());
        break;
    case 'v3': {
        const name = args.shift();
        let namespace = args.shift();
        assert.ok(name != null, 'v3 name not specified');
        assert.ok(namespace != null, 'v3 namespace not specified');
        if (namespace === 'URL') {
            namespace = v3_js_1.default.URL;
        }
        if (namespace === 'DNS') {
            namespace = v3_js_1.default.DNS;
        }
        console.log((0, v3_js_1.default)(name, namespace));
        break;
    }
    case 'v4':
        console.log((0, v4_js_1.default)());
        break;
    case 'v5': {
        const name = args.shift();
        let namespace = args.shift();
        assert.ok(name != null, 'v5 name not specified');
        assert.ok(namespace != null, 'v5 namespace not specified');
        if (namespace === 'URL') {
            namespace = v5_js_1.default.URL;
        }
        if (namespace === 'DNS') {
            namespace = v5_js_1.default.DNS;
        }
        console.log((0, v5_js_1.default)(name, namespace));
        break;
    }
    case 'v6':
        console.log((0, v6_js_1.default)());
        break;
    case 'v7':
        console.log((0, v7_js_1.default)());
        break;
    default:
        usage();
        process.exit(1);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXVpZC1iaW4uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvdXVpZC1iaW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxpQ0FBaUM7QUFFakMsbUNBQXlCO0FBQ3pCLG1DQUF5QjtBQUN6QixtQ0FBeUI7QUFDekIsbUNBQXlCO0FBQ3pCLG1DQUF5QjtBQUN6QixtQ0FBeUI7QUFFekIsU0FBUyxLQUFLO0lBQ1osT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUN0QixPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3RCLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDekIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO0lBQ2pELE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDekIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO0lBQ2pELE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDekIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUN6QixPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQzdCLE9BQU8sQ0FBQyxHQUFHLENBQ1Qsa0dBQWtHLENBQ25HLENBQUM7QUFDSixDQUFDO0FBRUQsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFFbkMsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO0lBQ2hDLEtBQUssRUFBRSxDQUFDO0lBQ1IsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNsQixDQUFDO0FBRUQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFJLElBQUksQ0FBQztBQUVyQyxRQUFRLE9BQU8sRUFBRSxDQUFDO0lBQ2hCLEtBQUssSUFBSTtRQUNQLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBQSxlQUFFLEdBQUUsQ0FBQyxDQUFDO1FBQ2xCLE1BQU07SUFFUixLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDVixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDMUIsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBRTdCLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxJQUFJLElBQUksRUFBRSx1QkFBdUIsQ0FBQyxDQUFDO1FBQ2pELE1BQU0sQ0FBQyxFQUFFLENBQUMsU0FBUyxJQUFJLElBQUksRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO1FBRTNELElBQUksU0FBUyxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQ3hCLFNBQVMsR0FBRyxlQUFFLENBQUMsR0FBRyxDQUFDO1FBQ3JCLENBQUM7UUFFRCxJQUFJLFNBQVMsS0FBSyxLQUFLLEVBQUUsQ0FBQztZQUN4QixTQUFTLEdBQUcsZUFBRSxDQUFDLEdBQUcsQ0FBQztRQUNyQixDQUFDO1FBRUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFBLGVBQUUsRUFBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUNqQyxNQUFNO0lBQ1IsQ0FBQztJQUVELEtBQUssSUFBSTtRQUNQLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBQSxlQUFFLEdBQUUsQ0FBQyxDQUFDO1FBQ2xCLE1BQU07SUFFUixLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDVixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDMUIsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBRTdCLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxJQUFJLElBQUksRUFBRSx1QkFBdUIsQ0FBQyxDQUFDO1FBQ2pELE1BQU0sQ0FBQyxFQUFFLENBQUMsU0FBUyxJQUFJLElBQUksRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO1FBRTNELElBQUksU0FBUyxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQ3hCLFNBQVMsR0FBRyxlQUFFLENBQUMsR0FBRyxDQUFDO1FBQ3JCLENBQUM7UUFFRCxJQUFJLFNBQVMsS0FBSyxLQUFLLEVBQUUsQ0FBQztZQUN4QixTQUFTLEdBQUcsZUFBRSxDQUFDLEdBQUcsQ0FBQztRQUNyQixDQUFDO1FBRUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFBLGVBQUUsRUFBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUNqQyxNQUFNO0lBQ1IsQ0FBQztJQUVELEtBQUssSUFBSTtRQUNQLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBQSxlQUFFLEdBQUUsQ0FBQyxDQUFDO1FBQ2xCLE1BQU07SUFFUixLQUFLLElBQUk7UUFDUCxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUEsZUFBRSxHQUFFLENBQUMsQ0FBQztRQUNsQixNQUFNO0lBRVI7UUFDRSxLQUFLLEVBQUUsQ0FBQztRQUNSLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDcEIsQ0FBQyJ9