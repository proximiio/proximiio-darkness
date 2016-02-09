/**
 * @constructor
 */
var TenantNotFoundError = function() {
    this.name = "TenantNotFoundError";
    this.code = 401;
    this.message = "TenantNotFound";

    this.json = JSON.stringify({
        code: this.code,
        message: this.message
    })
};

TenantNotFoundError.prototype = Object.create(Error.prototype);

module.exports = TenantNotFoundError;