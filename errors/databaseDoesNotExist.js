/**
 * Database Does Not Exist Error
 *
 * @constructor
 */
var DatabaseDoesNotExistError = function() {
    this.name = "DatabaseDoesNotExistError";
    this.code = 1040;
    this.message = "Database Exists Format";

    this.json = JSON.stringify({
        code: this.code,
        message: this.message
    })
};

DatabaseDoesNotExistError.prototype = Object.create(Error.prototype);

module.exports = DatabaseDoesNotExistError;