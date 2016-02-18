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

var DEFAULT_LIMIT = 10;

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
        console.log('has extensions called');
        var fileName = '/Users/wired/mika/core/extensions/' + pluralize(resource).capitalize() + 'Controller.js';
        fs.access(fileName, fs.F_OK, (error) => {
            console.log('has extensions found file', fileName);
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
        Model.count().run().then((result) => {
            if (result == null) {
                res.status(404).send("Resource for count Not Found");
            } else {
                res.send(formatOutput({count: result}));
            }
        }).error(dbErrorHandler(res));
    };

    this.show = (req, res) => {
        getEntity(req.params)
            .then(validateOwnership)
            .then(respond(req, res))
            .error(respondWithError);
    };

    let validateOwnership = (params) => {
        if (req.tenant.validatesOwnership(params)) {
            return params;
        } else {
            throw new OwnershipError();
        }
    };

    let getEntity = (params) => {
        return Model.get(params.id).run();
    };

    let createEntity = (params) => {
        return Model.insert(params).run().then(function (result) {
            params.id = result.generated_keys[0];
            return params;
        });
    };

    let updateEntity = (params) => {
        return getEntity(params).update(params)
            .then((result) => {
                return params;
            });
    };

    let updateElasticRecord = (req) => {
        return (data) => {
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
            res.send(formatOutput(params));
            return params;
        }
    };

    var respondWithError = (error) => {
        console.log('respond with error', error);
        res.status(500).send(JSON.stringify({error: error.message}));
    };

    this.create = (req, res) => {
        var params = req.body;
        if (typeof params['id'] != "undefined") {
            delete params['id'];
        }

        params[schemaManager.getTenantIdField()] = req.tenant.id;
        params.createdAt = new Date().toISOString();
        params.updatedAt = params.createdAt;

        console.log('events create, ext', _this.extensions);
        if (typeof _this.extensions != 'undefined' &&
            _this.extensions.hasOwnProperty('overrides') &&
            _this.extensions.overrides.hasOwnProperty('create')) {
            console.log('action CREATE for resource:', resource, 'overriden');
            _this.extensions.overrides.create(req, res);
        } else {
            schemaModelHandler.checkParams(req.body)
                .then(validateOwnership)
                .then(createEntity)
                .then(getEntity)
                .then(callExtensions(req, res, "create:after"))
                .then(respond(req, res))
                .then(updateElasticRecord(req))
                .error(respondWithError);
        }
    };

    this.update = (req, res) => {
        var params = req.body;

        if (schemaManager.multitenancy) {
            params[schemaManager.getTenantIdField()] = req.tenant.id;
        }

        params.updatedAt = (new Date()).toISOString();

        schemaModelHandler.checkParams(req.body)
            .then(validateOwnership)
            .then(updateEntity)
            .then(getEntity)
            .then(callExtensions(req, res, "update:after"))
            .then(respond(req, res))
            .then(updateElasticRecord(req))
            .error(respondWithError);
    };

    this.destroy = (req, res) => {
        getEntity(req.params)
            .then(validateOwnership(req.params))
            .then(destroyEntity)
            .then(respond(req, res))
            .then(deleteElasticRecord(req))
            .error(respondWithError);
    };

    this.upsert = (req, res) => {
        if (req.body.id != null &&
            req.body.id != "null" &&
            req.body.id != "new" &&
            typeof req.body.id != 'undefined') {
            _this.update(req, res);
        } else {
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