/**
 * Permission Denied Error
 *
 * @constructor
 */
var PermissionDeniedError = function() {
    this.name = "PermissionDeniedError";
    this.code = 1003;
    this.message = "Permission Denied";

    this.json = JSON.stringify({
        code: this.code,
        message: this.message
    })
};

PermissionDeniedError.prototype = Object.create(Error.prototype);

module.exports = PermissionDeniedError;