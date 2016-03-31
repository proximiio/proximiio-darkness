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

var DEFAULT_LIMIT = 1000;

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
        console.log('index called for resource: ', resource);
        var limit = parseInt(req.query.limit) || DEFAULT_LIMIT;
        var skip = parseInt(req.query.skip) || 0;
        var order = req.query.order || 'id';
        var filter = {};

        if (schemaManager.multitenancy) {
            filter[schemaManager.schema.multitenancy.entity + '_id'] = req.consumer.id;
        }

        Model.orderBy({index: order})
             .filter(filter)
             .skip(skip)
             .limit(limit)
             .run().then((result) => {
                res.send(formatOutput(result));
             })             .error(dbErrorHandler(res));
    };

    this.count = (req, res) => {
        Model.filter({organization_id: req.tenant.id}).count().run().then((result) => {
            if (result == null) {
                res.status(404).send("Resource for count Not Found");
            } else {
                res.send(formatOutput({count: result}));
            }
        }).error(dbErrorHandler(res));
    };

    this.show = (req, res) => {
        getEntity(req.params)
            .then(validateOwnership(req))
            .then(respond(req, res))
            .catch(respondWithError(res))
            .error(respondWithError(res));
    };

    let validateOwnership = (req) => {
        return function(params) {
            console.log('received params: ', params);
            if (req.tenant.validatesOwnership(params)) {
                return params;
            } else {
                throw new OwnershipError();
            }
        }
    };

    let getEntity = (params) => {
        console.log('getEntity', params);
        return Model.get(params.id).then(function(result) {
          if (result == null) {
             throw new NotFoundError();
          } else {
             console.log('getEntity returning ', result);
             return result;
          }
        });
    };

    let createEntity = (params) => {
        return Model.insert(params).then(function (result) {
            params.id = result.generated_keys[0];
            console.log('created record', params);
            return params;
        });
    };

    let updateEntity = (params) => {
        console.log('update entity with params:', params);
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
            console.log('should update elastic record with tenant id', req.tenant.id, 'data', data);
            elasticAdapter.update(resource, data, req.tenant.id);
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
            console.log('should respond:', formatOutput(params));
            res.send(formatOutput(params));
            console.log('response sent');
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
        var event = {
          event: 'config-change',
          data: {
              operation: action,
              target: params.id,
              type: resource
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        event[schemaManager.getTenantIdField()] = req.consumer.id;

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
      }
    };
 
    this.create = (req, res) => {
        var params = req.body;
        params[schemaManager.getTenantIdField()] = req.tenant.id;
        params.createdAt = new Date().toISOString();
        params.updatedAt = params.createdAt;
        console.log('create params:', params);
        if (typeof _this.extensions != 'undefined' &&
            _this.extensions.hasOwnProperty('overrides') &&
            _this.extensions.overrides.hasOwnProperty('create')) {
            console.log('calling create override for resource: ', resource);
            _this.extensions.overrides.create(req, res);
        } else {
            if (typeof params['id'] != "undefined") {
                delete params['id'];
            }
            schemaModelHandler.checkParams(req.body, true, true)
                .then(validateOwnership(req))
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
        console.log('update for entity: ', resource, ' with params: ', req.body); 
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
            .then(updateEntity)
            .then(getEntity)
            .then(callExtensions(req, res, "update:after"))
            .then(updateElasticRecord(req))
            .then(respond(req, res))
            .then(emitConfigChange(req, 'update'))
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
        if (req.body.id != null &&  req.body.id != "null" &&  req.body.id != "new" &&  typeof req.body.id != 'undefined') {
            console.log('upsert calling update');
            _this.update(req, res);
        } else {
            console.log('upsert calling insert');
            _this.create(req ,res);
        }

    };

    router.get('/' + this.plural, this.index);
    router.get('/' + this.plural + '/count', this.count);
    router.get('/' + this.plural + '/:id', this.show);
    router.post('/' + this.plural, this.create);
    router.put('/' + this.plural, this.upsert);
    router.put('/' + this.plural + '/:id', this.update);
    router.delete('/' + this.plural + '/:id', this.destroy);

    this.router = router;

    return this;

};
