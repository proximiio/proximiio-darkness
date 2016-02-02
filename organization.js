var _ = require('underscore');
var TokenManager = require('./token_manager');

var Organization = function(organization) {

    var _this = this;
    this.id = organization.id;
    this.data = organization;

    this.decodeToken = function(token, callback) {
        var orgSecret = TokenManager.decode(this.data.secret, appSchema.secret);
        if (orgSecret == null) {
            callback(false, null);
        } else {
            var payload = TokenManager.decode(token, orgSecret);
            if (payload == null) {
                callback(false, null);
            } else {
                callback(true, payload);
            }
        }
    };

    this.getWriteToken = function() {
        var writeToken = null;
        console.log('iterating tokens:', this.data.tokens);
        var orgSecret = TokenManager.decode(this.data.secret, appSchema.secret);
        _.each(this.data.tokens, function(token) {
            console.log('decoding token', token, ' with secret', _this.data.secret);
            var decoded = TokenManager.decode(token, orgSecret);
            console.log('decoded:', decoded);
            if (decoded != null && decoded.write) {
                writeToken = token;
            }
        });
        return writeToken;
    };

    this.validateReadToken = function(token, callback) {
        this.decodeToken(token, function(success, payload) {
            callback(success);
        });
    };

    this.validateWriteToken = function(token, callback) {
        this.decodeToken(token, function(success, payload) {
            callback(success && payload.write);
        });
    };

    this.validatesOwnership = function(entity) {
        return entity.organization_id == this.data.id;
    };

    this.public = function() {
        return {
            id: this.data.id,
            name: this.data.name
        }
    };

    return this;

};

Organization.initFromConsumer = function(consumer, datastore, callback) {
    datastore.table('organizations').get(consumer.id).run().then(function(data) {
        console.log('fetched organization: ', data);
        if (data) {
            var organization = new Organization(data);
            callback(null, organization);
        } else {
            callback(null, null);
        }
    }).error(callback);
};

module.exports = Organization;