var request = require('request');
var Log = require('./logger');

module.exports = function ElasticAdapter(schemaManager) {
    var TAG = 'ElasticAdapter';

    var available = function(id, tenantId) {
        if (typeof schemaManager.schema.elasticRoot != 'undefined' &&
            typeof schemaManager.schema.elasticIndexKey != 'undefined' &&
            typeof tenantId != 'undefined' &&
            typeof id != 'undefined') {
            return true;
        } else {
            if (typeof id != 'undefined' &&
                typeof tenantId != 'undefined') {
                Log.error(TAG, 'Elastic Search not set in schema');
            } else {
                if (typeof id != 'undefined') {
                    Log.error(TAG, 'Request is missing tennant id');
                } else {
                    Log.error(TAG, 'Request is missing entity id');
                }
            }
            return false;
        }
    };

    var path = function(tenantId, id) {
        return schemaManager.schema.elasticRoot + '/' + schemaManager.schema.elasticIndexKey + '-' + tenantId + '/' + pluralize(resource) + '/' + id;
    };

    this.update = function(tenantId, data, callback) {
        if (available(data.id, tenantId)) {
            request.put({url: path(tenantId, data.id), body: JSON.stringify(data)}, function(error, response, body) {
                Log.system(TAG, 'updated: ', data.id);
                if (typeof callback != 'undefined') {
                    callback();
                }
            });
        }
    };

    this.delete = function(id, tenantId, callback) {
        if (available(id, tenantId)) {
            request.del({url: path(tenantId, id)}, function (error, response, body) {
                Log.system(TAG, 'deleted: ', id);
                if (typeof callback != 'undefined') {
                    callback();
                }
            });
        }
    };

    return this;
};