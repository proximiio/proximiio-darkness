/**
 * Organization Exists Error
 *
 * @constructor
 */
var OrganizationExistsError = function() {
    this.name = "OrganizationExistsError";
    this.code = 1011;
    this.message = "Organization with specified name already exists";

    this.json = JSON.stringify({
        code: this.code,
        message: this.message
    })
};

OrganizationExistsError.prototype = Object.create(Error.prototype);

module.exports = OrganizationExistsError;
