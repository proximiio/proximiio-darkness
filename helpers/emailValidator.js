var Promise = require('bluebird');
var EmailValidator = require('email-validator');
var validateEmailUniqueness = function(schemaManager, email) {
    var Entity = schemaManager.storage.table(schemaManager.getTenantEntityPlural());
    return Entity.filter({email: email}).count().run().then(function(count) {
        return count == 0;
    });
};

module.exports = {
    format: EmailValidator.validate,
    uniqueness: validateEmailUniqueness,
    formatError: {
        code: 1011,
        message: "Invalid Email format"
    },
    uniquenessError: {
        code: 1012,
        message: "Email was already registered"
    }
};