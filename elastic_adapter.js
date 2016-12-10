var Log = require('./logger');
var Promise = require("bluebird");
var request = Promise.promisifyAll(require("request"));
var plur = require('plur');
var _ = require('underscore');
var updateElasticRecord = require('./queue/elasticQueue').updateRecord;

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
 
    var eClient = schemaManager.elasticClient;

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
     * @param {String} resource
     * @param {String}id
     * @param [tenantId] {String} Tenant ID/UUID
     * @returns {string}
     */
    var path = function(resource, id, tenantId) {
        var index = schemaManager.schema.elasticsearch.indexKey;
        tenantId = 'master';
        if (resource == 'events' || resource == 'positions') {
          index += '-' + resource;
        } else {
          index += '-' + plur(resource);
        }
        if (schemaManager.multitenancy) {
            index += '-' + tenantId;
        }
        return schemaManager.schema.elasticsearch.root + '/' + index + '/' + resource + '/' + id;
    };

    var indexPath = function(resource, id, tenantId) {
       var index = schemaManager.schema.elasticsearch.indexKey;
       tenantId = 'master';
       //if (resource == 'events' || resource == 'positions') {
          index += '-' + plur(resource);
       //} 
      
       if (schemaManager.multitenancy) {
         index += '-' + tenantId;
       }
       return schemaManager.schema.elasticsearch.root + '/' + index + '/' + resource + '/' + id;
    };

    this.search = function(resource, body) {
      return new Promise((resolve, reject) => {
        eClient.search({
          index: 'proximi-' + plur(resource) + '-master',
          body: body
        }, function(error, response) {
          if (error) {
            console.log('elastic error', error);
            reject(error);
          } else {
            var results = [];
            if (typeof body.fields != 'undefined') {
              results = _.map(response.hits.hits, (result) => { return result.fields; });
            } else {
              results = _.map(response.hits.hits, (result) => { return result._source; });
            }
            resolve({total: response.hits.total, results: results});
          }
        });
      });
    };

    this.count = function(resource, tenantId) {
      return new Promise((resolve, reject) => {
        eClient.count({
          index: 'proximi-' + plur(resource) + '-master',
          body: {
            query: {
	      "constant_score" : { 
                "filter" : {
                  "match" : { "organization_id" : tenantId }
                }
              }
            }
          }
        }, function(error, response) {
          if (error) {
            reject(error);
          } else {
            resolve(response.count);
          }
        });
      });
    }

    /**
     * updates elasticsearch record
     *
     * @param {String} resource
     * @param {Object} data
     * @param [tenantId] {String} Tenant ID/UUID
     * @param [callback]
     */

    this.update = function(resource, data, tenantId, tenantName) {
//        console.log('1updating elasticsearch with ', 'resource', resource, 'data',  data, ' tenantId', tenantId);
        if (available(data.id, tenantId)) {
            if (resource == 'floor' && typeof data.anchors != 'undefined') {
     	      data.geopoint = [parseFloat(data.anchors[0].lng), parseFloat(data.anchors[0].lat)];
              for (var i=0; i < data.anchors.length; i++) {
                var anchor = data.anchors[i];
                anchor.lat = parseFloat(anchor.lat);
                anchor.lng = parseFloat(anchor.lng);
                //data.anchors[i] = anchorX;
              }
              //data.geopoint = [parseFloat(data.anchors[0].lng), parseFloat(data.anchors[0].lat)];
            }
            if (resource == 'geofence' && typeof data.area != 'undefined') {
              data.geopoint = [parseFloat(data.area.lng), parseFloat(data.area.lat)];
            }
            if ((resource == 'place' || resource == 'position') && typeof data.location != 'undefined') {
              data.geopoint = [parseFloat(data.location.lng), parseFloat(data.location.lat)];
            }
            if (resource == 'event' && typeof data.data != 'undefined' && typeof data.data.location != 'undefined') {
              data.geopoint = [parseFloat(data.data.location.lng), parseFloat(data.data.location.lat)];
            }
            if (resource == 'input' && typeof data.data != 'undefined' && typeof data.data.marker != 'undefined') {
              data.geopoint = [parseFloat(data.data.marker.lng), parseFloat(data.data.marker.lat)];
            }
            var requestData = {url: path(resource, data.id, tenantId), body: JSON.stringify(data)};
            //console.log('requestData', requestData);

            updateElasticRecord({index: 'proximi-' + plur(resource) + '-master', id: data.id, type: resource, body: { doc: data, doc_as_upsert: true }}, function() {});
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
            var requestData = {url: path(resource, id, tenantId)};
            console.log('delete request data', requestData);
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
