var Log = require('./logger');
var Promise = require("bluebird");
var request = Promise.promisify(require("request"));
var pluralize = require('plur');
Promise.promisifyAll(request);

/**
 * ElasticSearch Adapter
 *
 * determines elasticsearch index paths and provides convenience methods for updating and deleting index records
 *
 * @param schemaManager
 * @returns {module}
 * @constructor
 */
var ElasticAdapter = function(schemaManager) {
    var TAG = 'ElasticAdapter';

    /**
     * Validates elasticsearch configuration in Darkness Schema
     *
     * @returns {boolean}
     */
    this.validateSchemaPresence = function() {
        var errors = [];
        if (typeof schemaManager.schema.elasticsearch == 'undefined') {
            errors.push("Schema is missing elasticsearch settings");
        } else {
            if (typeof schemaManager.schema.elasticsearch.root == 'undefined') {
                errors.push('Schema is missing elasticsearch root');
            }
            if (typeof schemaManager.schema.elasticsearch.indexKey == 'undefined') {
                errors.push('Schema is missing elasticsearch indexKey');
            }
        }
        return errors.length == 0;
    };

    var elasticPresent = this.validateSchemaPresence();

    /**
     * returns true if all requirements for successful elasticsearch record are met
     *
     * @param id {String} Resource UUID
     * @param [tenantId] {String} Tenant ID/UUID
     * @returns {boolean}
     */
    var available = function(id, tenantId) {
        if (!elasticPresent) {
            return false;
        }

        var errors = [];
        if (typeof id == 'undefined') {
            errors.push('Request is missing entity id');
        }

        if (schemaManager.multitenancy && typeof tenantId == 'undefined') {
            errors.push('Request is missing tenant id');
        }

        if (errors.length > 0) {
            Log.error(TAG, errors.join('. '));
        }

        return errors.length == 0;
    };

    /**
     * returns elastic record path with respect to multitenancy config
     *
     * @param id {String} Resource UUID
     * @param [tenantId] {String} Tenant ID/UUID
     * @returns {string}
     */
    var path = function(resource, id, tenantId) {
        var index = schemaManager.schema.elasticsearch.indexKey;
        if (schemaManager.multitenancy) {
            index += '-' + tenantId;
        }
        return schemaManager.schema.elasticsearch.root + '/' + index + '/' + pluralize(resource) + '/' + id;
    };


    /**
     * updates elasticsearch record
     *
     * @param data
     * @param [tenantId] {String} Tenant ID/UUID
     * @param [callback]
     */

    this.update = function(resource, data, tenantId, callback) {
        if (available(data.id, tenantId)) {
            var requestData = {url: path(resource, data.id, tenantId), body: JSON.stringify(data)};
            request.putAsync(requestData)
                   .then(function(response, body) {
                        Log.system(TAG, 'updated: ', data.id);
                        if (typeof callback != 'undefined') {
                            callback(null, body);
                        }
                   }).catch(function(error) {
                        Log.error(TAG, 'update error', error);
                        if (typeof callback != 'undefined') {
                            callback(error, null);
                        }
                   })
        }
    };

    /**
     * deletes elasticsearch record
     *
     * @param id {String} Resource UUID
     * @param [tenantId] {String} Tenant ID/UUID
     * @param [callback]
     */
    this.delete = function(resource, id, tenantId, callback) {
        if (available(id, tenantId)) {
            var requestData = {url: path(resource, tenantId, id)};
            request.delAsync(requestData)
                   .then(function(response, body) {
                        Log.system(TAG, 'deleted: ', id);
                        if (typeof callback != 'undefined') {
                            callback(body);
                        }
                   }).catch(function(error) {
                        Log.error(TAG, "delete error", error);
                        if (typeof callback != 'undefined') {
                            callback(error, null);
                        }
                   })
        }
    };

    return this;
};

module.exports = ElasticAdapter;