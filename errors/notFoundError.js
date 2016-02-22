/**
 * @constructor
 */
function NotFoundError() {

    this.name = 'NotFoundError';
    this.statusCode = 404;
    this.code = this.statusCode;
    this.message = this.statusCode + ' - Document Not Found';
    this.json = JSON.stringify({
        code: this.statusCode,
        message: this.message
    });
    if (Error.captureStackTrace) { // if required for non-V8 envs - see PR #40
        Error.captureStackTrace(this);
    }

}
NotFoundError.prototype = Object.create(Error.prototype);
NotFoundError.prototype.constructor = NotFoundError;

module.exports = NotFoundError;
