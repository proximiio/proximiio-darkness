/**
 * Generic Darkness Error
 *
 * @constructor
 */
var DarkError = function(name, code, message) {
    this.name = name;
    this.code = code;
    this.message = message;

    this.json = JSON.stringify({
        code: this.code,
        message: this.message
    })
};

DarkError.prototype = Object.create(Error.prototype);

module.exports = DarkError;