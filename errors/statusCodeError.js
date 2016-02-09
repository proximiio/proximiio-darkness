/**
 *
 * @param {int} statusCode
 * @param {String} message
 * @constructor
 */
function StatusCodeError(statusCode, message) {

    this.name = 'StatusCodeError';
    this.statusCode = statusCode;
    this.code = this.statusCode;
    this.message = statusCode + ' - ' + message;
    this.json = JSON.stringify({
        code: this.statusCode,
        message: this.message
    });
    if (Error.captureStackTrace) { // if required for non-V8 envs - see PR #40
        Error.captureStackTrace(this);
    }

}
StatusCodeError.prototype = Object.create(Error.prototype);
StatusCodeError.prototype.constructor = StatusCodeError;

module.exports = StatusCodeError;