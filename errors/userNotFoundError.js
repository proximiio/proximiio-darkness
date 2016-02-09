/**
 * @constructor
 */
var UserNotFoundError = function() {
    this.name = "UserNotFoundError";
    this.code = 401;
    this.message = "UserNotFound";

    this.json = JSON.stringify({
        code: this.code,
        message: this.message
    })
};

UserNotFoundError.prototype = Object.create(Error.prototype);

module.exports = UserNotFoundError;