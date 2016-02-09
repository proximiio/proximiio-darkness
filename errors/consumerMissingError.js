/**
 * Consumer Missing Error
 *
 * @constructor
 */
var ConsumerMissingError = function() {
    this.name = "ConsumerMissingError";
    this.code = 1003;
    this.message = "Consumer Missing";

    this.json = JSON.stringify({
        code: this.code,
        message: this.message
    })
};

ConsumerMissingError.prototype = Object.create(Error.prototype);

module.exports = ConsumerMissingError;