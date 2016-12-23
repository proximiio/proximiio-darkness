"use strict";

var express = require('express');
var router = express.Router();
var pluralize = require('plur');
var fs = require('fs');
var request = require('request');
var when = require('when');
var Log = require('./logger');
var capitalize = require('./helpers/capitalize')(); // extends String.prototype
var SchemaHandler = require('./schema_model_handler');
var Organization = require('./tenant');
var ElasticAdapter = require('./elastic_adapter');
var Promise = require('bluebird');
var OwnershipError = require('./errors/ownershipError');
var NotFoundError = require('./errors/notFoundError');
var requestPromise = require('request-promise');
var _ = require('underscore');

var DEFAULT_LIMIT = 500;

module.exports = function RestController(resource, schemaModelHandler, datastore, schemaManager) {
    var _this = this;

    this.resource = resource;
    this.plural = pluralize(resource);
    var TAG = ((this.plural) + 'Controller').capitalize();
    this.tag = TAG;
    this.datastore = datastore;

    this.schemaManager = schemaManager;
    var Model = this.datastore.table(this.plural);
    var elasticAdapter = new ElasticAdapter(schemaManager);

    var hasExtensions = (callback) => {
        var fileName = schemaManager.schema.filePath + '/extensions/' + pluralize(resource).capitalize() + 'Controller.js';
        fs.access(fileName, fs.F_OK, (error) => {
            callback(error, fileName);
        });
    };

    hasExtensions((error, fileName) => {
        if (error) {
        } else {
            Log.d(TAG, 'loading extensions from path: ', fileName);
            var Extension = require(fileName);
            _this.extensions = new Extension(resource, _this);
        }
    });

    var formatOutput = (data) => {
        return JSON.stringify(data);
    };

    var dbErrorHandler = (res) => {
        return (error) => {
            return res.status(500).send(JSON.stringify({error: error.message}));
        }
    };

    this.index = (req, res) => {
        //console.log('index called for resource: ', resource, req.path, 'params', req.params, 'query', req.query);
        if (resource.substring(0,3) == 'red') {
          //console.log('is red resource');
          schemaManager.storage.table(_this.plural)
                               .getAll(req.tenant.id, {index: 'organization_id'})
                               .then((flows) => {
                                 res.send(formatOutput(flows));
                               });
        } else {
        var limit = parseInt(req.query.limit) || DEFAULT_LIMIT;
        var skip = parseInt(req.query.skip) || 0;
        var orderField = req.query.order || 'createdAt';
        var orderDirection = req.query.dir || 'desc'; 

        var radius = req.query.search_radius || '100';
        var geoSearchAllowed = typeof schemaManager.schema.resources[resource].schema.geoSearch != 'undefined' && 
			       typeof req.query.search_latitude != 'undefined' &&
                               typeof req.query.search_longitude != 'undefined'; 
        var geoSearchField = schemaManager.schema.resources[resource].schema.geoSearch;

/*
        var organizationFilter = {
          "filtered": {
            "filter": {
              "match": {
                "organization_id": req.tenant.id
              }
            }
          }
        };
*/
        var organizationFilter = {
          "bool": {
             "must": {
               "match": { "organization_id": req.tenant.id }
             }
          }
        }

        var filters = [ organizationFilter ]; 
        var notFilters = [];
       
        var query = {
          "bool": {
            "must": filters,
            "must_not": notFilters
          }
        };
        //console.log('filters stage 1', JSON.stringify(filters));
        if (typeof req.query.q != "undefined" && req.query.q.length > 2) {
          filters.push({"bool": { "must": { "wildcard": { "name": "*" + req.query.q.toLowerCase() + "*" } } } });
        } 

        if (typeof req.query.filter != "undefined" && req.query.filter.length > 0) {
          var kv = req.query.filter.split(':');
          var q = {bool: { must: {match: {}}}};
          q.bool.must.match[kv[0]] = kv[1];
          filters.push(q);
        }

        var sort = {};
        sort[orderField] = {"order": orderDirection.toLowerCase()}; 

        if (resource == 'event') {
          if (typeof req.query.type != 'undefined') {
            var split = req.query.type.split(',');
            if (split.length > 1) {
              notFilters.push({"match": { "event" : 'config-change' }});
            } else {
              filters.push({"match": { "event" : req.query.type }});
            }
          }
        }
        //console.log('filters starge 2', JSON.stringify(filters));
        if (geoSearchAllowed) {
          var geoQuery = {
            "bool": {
               "must": {
                  "match": {
                    "organization_id": req.tenant.id
                  }
               },
               "filter": {
                  "geo_distance": {
                    "distance": req.query.search_radius + "m",
                    "geopoint": [parseFloat(req.query.search_longitude), parseFloat(req.query.search_latitude)]
                  }
               }
            }
          };
/*
          var geoQuery = { 
            "filtered": {
              "filter": {
                "geo_distance": {
                  "distance": req.query.search_radius + "m",
                  "geopoint": [parseFloat(req.query.search_longitude), parseFloat(req.query.search_latitude)]
                }
              }
            }
          }
*/
          filters.push(geoQuery);
          sort = [{
            "_geo_distance": {
              "geopoint": [parseFloat(req.query.search_longitude), parseFloat(req.query.search_latitude)],
              "order": "asc",
              "unit": "m", 
              "distance_type": "plane"
            }
          }]
        };

        var bundle = {
          "query": query,
          "from": skip,
          "size": limit,
          "sort": sort
        };

        //console.log('index bundle:', JSON.stringify(bundle, null, 4));

        schemaManager.elasticAdapter.count(resource, req.tenant.id)
          .then((count) => { 
             res.set('RecordCount', count);
             schemaManager.elasticAdapter.search(resource, bundle)
               .then((response) => {
                 res.set('SearchCount', response.total);
                 res.send(formatOutput(response.results));
               });
          }).catch((error) => { 
            console.log('search_error', error);
          });
        }
    };

    this.count = (req, res) => {
       schemaManager.elasticAdapter.count(resource, req.tenant.id)
        .then((count) => {
          res.send(formatOutput({count: count}));
       });
    };

    var visitorsInGeofence = (geofenceId) => {
       return (data) => {
         return schemaManager.storage.table('events')
                            .filter({organization_id: req.tenant.id, event: 'enter', geofence_id: geofenceId})
                            .filter(function(doc) {
                              return doc.hasFields('dwellTime').not();
                            })
                           .count()
                           .then((resultCount) => {
                              return {presentVisitors: resultCount};
                           });
       };
    };

    this.show = (req, res) => {
        var geofenceId = req.query.id;
        getEntity(req.params)
            .then(validateOwnership(req))
            .then((data) => {
               if (resource == 'geofence') {
		        return schemaManager.storage.table('events')
                            .filter({organization_id: req.tenant.id, event: 'enter', geofence_id: req.params.geofence_id})
                            .filter(function(doc) {
                              return doc.hasFields('dwellTime').not();
                            })
                           .count()
                           .then((visitorsCount) => {
                              data.visitorsCount = visitorsCount;
                              return data;
                           });
               } else { return data; };
            })
            .then(respond(req, res))
            .catch(respondWithError(res))
            .error(respondWithError(res));
    };

    let validateOwnership = (req) => {
        return function(params) {
            //console.log('received params: ', params);
            if (req.tenant.validatesOwnership(params)) {
                return params;
            } else {
                throw new OwnershipError();
            }
        }
    };

    let getRedEntity = (params) => {
      return Model.filter({data: {redId: params.id}}).then((result) => {
          if (result == null || result.length == 0) {
             throw new NotFoundError();
          } else {
             //console.log('getRedEntity returning ', result[0]);
             return result;
          }
      });
    };

    let getEntity = (params) => {
        //console.log('getEntity', params);
        return Model.get(params.id).then(function(result) {
          if (result == null) {
             throw new NotFoundError();
          } else {
             //console.log('getEntity returning ', result);
             return result;
          }
        });
    };

    let fetchFloor = (params) => {
      if (params.hasOwnProperty('floor_id') && params.floor_id != null && !params.hasOwnProperty('floor_name')) {
        return schemaManager.storage.table('floors').get(params.floor_id)
          .then((result) => {
            console.log('assign floor result', result);
            if (result != null) {
              params.floor_name = result.name;
            } else {
              params.floor_name = '';
            }
            console.log('assigned floor', result.name);
            return params;
          });
      } else {
        console.log('skipping floor assigning', params);
        return params;
      }
    };

    let fetchPlace = (params) => {
      if (params.hasOwnProperty('place_id') && params.place_id != null && !params.hasOwnProperty('place_name')) {
        console.log('should fetch place', params.place_id);
        return schemaManager.storage.table('places').get(params.place_id)
          .then((result) => {
            console.log('assign place result', result);
            if (result != null) {
              params.place_name = result.name;
            } else {
              params.place_name = '';
            }
            console.log('assigned place', result.name);
            return params;
          });
      } else {
        console.log('skipping place assigning', params);
        return params;
      }
    };

    let fetchDepartment = (params) => {
      if (params.hasOwnProperty('department_id') && !params.hasOwnProperty('department_name')) {
        console.log('should fetch department', params.department_id);
        return schemaManager.storage.table('departments').get(params.department_id)
          .then((result) => {
            console.log('assign department result', result);
            if (result != null) {
              params.department_name = result.name;
            } else {
              params.department_name = '';
            }
            console.log('assigned department', result.name);
            return params;
          });
      } else {
        console.log('skipping department assigning', params);
        return params;
      }
    };

    let createEntity = (params) => {
        return Model.insert(params).then(function (result) {
            params.id = result.generated_keys[0];
            //console.log('created record', params);
            return params;
        });
    };

    let updateEntity = (params) => {
        //console.log('update entity with params:', params);
        return Model.get(params.id).update(params)
            .then((result) => {
                return params;
            });
    };

    let destroyEntity = (params) => {
        return Model.get(params.id).delete().then((result) => {
            params.isDeleted = true;
            return params;
        });
    };

    let updateElasticRecord = (req) => {
        return (data) => {
            //console.log('should update elastic record with tenant id', req.tenant.id, 'data', data, 'name', req.tenant.getName());
            elasticAdapter.update(resource, data, req.tenant.id, req.tenant.getName());
            return data;
        }
    };

    let deleteElasticRecord = (req) => {
        return (data) => {
            elasticAdapter.delete(resource, data.id, req.tenant.id);
            return data;
        }
    };

    let callExtensions = (req, res, callbackType) => {
        return (data) => {
            if (typeof (_this.extensions) != 'undefined' && _this.extensions.callbackExists(callbackType)) {
                return _this.extensions.callback(callbackType, req, res, data);
            } else {
                return data;
            }
        };
    };

    var respond = (req, res) => {
        return (params) => {
          // console.log('should respond:', formatOutput(params));
            res.send(formatOutput(params));
            //console.log('response sent');
            return params;
        }
    };

    var respondWithError = (res) => {
        return (error) => {
          console.log('respond with error', error);
          if (error.code == 404) {
            res.status(404).send(error.message);
          } else {
            res.status(500).send(JSON.stringify(error));
          }
        }
    };

    let emitConfigChange = (req, action) => {
      return (params) => {
       if (!req.query.ignore_config_change) {
        var event = {
          event: 'config-change',
          data: {
              operation: action,
              target: params.id,
              type: resource
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        event[schemaManager.getTenantIdField()] = req.consumer.id;

        const geoSearchField = schemaManager.schema.resources[resource].schema.geoSearch;
        const resourceAllowsGeoSearch = typeof geoSearchField != 'undefined'; 
 
        if (resourceAllowsGeoSearch) {
          event.data.location = params[geoSearchField];
        }

        return requestPromise({
          uri: 'https://api.proximi.fi/core/events',
          method: 'POST',
          headers: {
              'Authorization': req.headers.authorization,
              'x-authorization-request-issuer': schemaManager.schema.name + ' (' + schemaManager.schema.version + ')'
          },
          json: true,
          body: event
        }).then((response) => {
          return params;
        }); 
       } else {
        console.log('ignoring config change');
       }
      }
    };

    let fixNamespace = (params) => {
      if (resource == 'input' && params.type == 'Eddystone Beacon') {
        if (!params.data.hasOwnProperty('namespace') && params.data.hasOwnProperty('namespaceid')) {
          params.data.namespace = params.data.namespaceid;
        }
        if (!params.data.hasOwnProperty('instanceId') && params.data.hasOwnProperty('instanceid')) {
          params.data.instanceId = params.data.instanceid;
        }
        console.log('namespace fix called', params);
      }

      return params;
    };
 
    this.create = (req, res) => {
        var params = req.body;
        params[schemaManager.getTenantIdField()] = req.tenant.id;
        params.organization_name = req.tenant.getName();
        params.createdAt = new Date().toISOString();
        params.updatedAt = params.createdAt;
        //console.log('create params:', params);
        if (typeof _this.extensions != 'undefined' &&
            _this.extensions.hasOwnProperty('overrides') &&
            _this.extensions.overrides.hasOwnProperty('create')) {
            //console.log('calling create override for resource: ', resource);
            _this.extensions.overrides.create(req, res);
        } else {
            if (typeof params['id'] != "undefined") {
                delete params['id'];
            }
            schemaModelHandler.checkParams(req.body, true, true)
                .then(validateOwnership(req))
                .then(fetchFloor)
                .then(fetchPlace)
                .then(fixNamespace)
                .then(createEntity)
                .then(getEntity)
                .then(callExtensions(req, res, "create:after"))
                .then(updateElasticRecord(req))
                .then(respond(req, res))
                .then(emitConfigChange(req, 'create'))
                .catch(respondWithError(res))
                .error(respondWithError(res));
        }
    };

    this.update = (req, res) => {
        //console.log('update for entity: ', resource, ' with params: ', req.body); 
        var params = req.body;

        if (schemaManager.multitenancy) {
            params[schemaManager.getTenantIdField()] = req.tenant.id;
        }

        if (typeof params.id == "undefined") {
          params.id = req.params.id;
        }

        params.updatedAt = (new Date()).toISOString();
        
        getEntity(req.body)
            .then((entity) => {
                Object.assign(entity, params);
                return schemaModelHandler.checkParams(entity, true);
            })
            .then(validateOwnership(req))
            .then(fetchFloor)
            .then(fetchPlace)
            .then(fixNamespace)
            .then(updateEntity)
            .then(getEntity)
            .then(callExtensions(req, res, "update:after"))
            .then(updateElasticRecord(req))
            .then(respond(req, res))
            .then(emitConfigChange(req, 'update'))
            .catch(respondWithError(res))
            .error(respondWithError(res));
    };
  
    this.removePreviousRedBundle = (req, params) => {
      //console.log('should remove previous bundle, current:', params.bundle_id);
      return Model.getAll(req.tenant.id, { index: 'organization_id' })
                  .filter((record) => {
                    return record('bundle_id').eq(params.bundle_id).not();
                  })
                  .delete()
                  .then(() => { return params; })
    };
 
    this.redUpdate = (req, res) => {
      var params = req.body;
      //console.log('redUpdate called for: ', params);
      var redId = params.data.id;

      if (schemaManager.multitenancy) {
            params[schemaManager.getTenantIdField()] = req.tenant.id;
      }

      let create = (params) => {
        //console.log('should create: ', params);
        return Model.insert(params, {conflict: 'replace'});
      }

      this.removePreviousRedBundle(req, params)
           .then(create)
           .then(getRedEntity)
           .then(respond(req, res))
           .catch(respondWithError(res))
           .error(respondWithError(res));
    };

    this.destroy = (req, res) => {
        getEntity(req.params)
            .then(validateOwnership(req))
            .then(destroyEntity)
            .then(callExtensions(req, res, "delete:after"))
            .then(respond(req, res))
            .then(emitConfigChange(req, 'delete'))
            .then(deleteElasticRecord(req))
            .catch(respondWithError(res))
            .error(respondWithError(res));
    };

    this.upsert = (req, res) => {
        if (req.query.red) {
          _this.redUpdate(req, res);
        } else {
          //console.log('upsert params:', req.body);
          if (req.body.id != null &&
              req.body.id != "null" &&
              req.body.id != "new" &&
              typeof req.body.id != 'undefined') {
              //console.log('upsert calling update');
              _this.update(req, res);
          } else {
              //console.log('upsert calling insert');
              _this.create(req ,res);
          }
       }
    };

    this.actions = (req, res) => {
      // just a dummy /actions action to workaround express id wildcard routing when adding custom ones
      res.send({success: true});
    }

    router.get('/' + this.plural, this.index);
    router.get('/' + this.plural + '/count', this.count);
    router.post('/' + this.plural + '/actions', this.actions);
    router.get('/' + this.plural + '/:id', this.show);
    router.post('/' + this.plural, this.create);
    router.put('/' + this.plural, this.upsert);
    router.put('/' + this.plural + '/:id', this.update);
    router.delete('/' + this.plural + '/:id', this.destroy);

    this.router = router;

    return this;

};
