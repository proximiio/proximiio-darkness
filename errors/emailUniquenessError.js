/**
 * Email Uniquness Error
 *
 * @constructor
 */
var EmailUniquenessError = function() {
    this.name = "EmailUniquenessError";
    this.code = 1012;
    this.message = "Email is already registered";

    this.json = JSON.stringify({
        code: this.code,
        message: this.message
    })
};

EmailUniquenessError.prototype = Object.create(Error.prototype);

module.exports = EmailUniquenessError;
