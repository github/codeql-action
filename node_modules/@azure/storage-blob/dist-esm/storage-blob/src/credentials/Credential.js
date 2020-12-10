// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
/**
 * Credential is an abstract class for Azure Storage HTTP requests signing. This
 * class will host an credentialPolicyCreator factory which generates CredentialPolicy.
 *
 * @export
 * @abstract
 * @class Credential
 */
var Credential = /** @class */ (function () {
    function Credential() {
    }
    /**
     * Creates a RequestPolicy object.
     *
     * @param {RequestPolicy} _nextPolicy
     * @param {RequestPolicyOptions} _options
     * @returns {RequestPolicy}
     * @memberof Credential
     */
    Credential.prototype.create = function (
    // tslint:disable-next-line:variable-name
    _nextPolicy, 
    // tslint:disable-next-line:variable-name
    _options) {
        throw new Error("Method should be implemented in children classes.");
    };
    return Credential;
}());
export { Credential };
//# sourceMappingURL=Credential.js.map