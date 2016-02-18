/**
 * Ownership Error
 *
 * @constructor
 */
var OwnershipError = function() {
    this.name = "OwnershipError";
    this.code = 1013;
    this.message = "Tenant is not owner of entity";

    this.json = JSON.stringify({
        code: this.code,
        message: this.message
    });
};

OwnershipError.prototype = Object.create(Error.prototype);
module.exports = OwnershipError;