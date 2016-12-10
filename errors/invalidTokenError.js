/**
 * Invalid Token Error
 *
 * @param {DarkError} error
 * @constructor
 */
var InvalidTokenError = function(error) {
    this.name = "InvalidTokenError";
    this.code = 403;
    this.message = "Invalid Token";

    this.json = JSON.stringify({
        code: this.code,
        message: this.message
    })
};

InvalidTokenError.prototype = Object.create(Error.prototype);

module.exports = InvalidTokenError;
