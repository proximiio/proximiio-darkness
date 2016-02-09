/**
 * Invalid Email Format Error
 *
 * @constructor
 */
var InvalidEmailFormatError = function() {
    this.name = "InvalidEmailFormatError";
    this.code = 1011;
    this.message = "Invalid Email Format";

    this.json = JSON.stringify({
        code: this.code,
        message: this.message
    })
};

InvalidEmailFormatError.prototype = Object.create(Error.prototype);

module.exports = InvalidEmailFormatError;