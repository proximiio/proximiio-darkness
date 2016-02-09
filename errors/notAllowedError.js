/**
 *
 * @param {DarkError} error
 * @constructor
 */
var NotAllowedError = function(error) {
    this.name = "NotAllowedError";
    this.code = error;
    this.message = (error.message || "");
};

NotAllowedError.prototype = Object.create(Error.prototype);

module.exports = NotAllowedError;