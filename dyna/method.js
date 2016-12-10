"use strict";

var Promise = require('bluebird');
var JaySchema = require('jayschema');
var jschema = new JaySchema(JaySchema.loaders.http);
var normaliseErrors = require('jayschema-error-messages');
var extend = require('extend');

/**
 * Dynamic Request Method Execution Main Class
 *
 * return schema in desc()
 * extend and override static execute() {}
 * always return a promise
 *
 */

var DynaMethod = function(method, schemaManager) {

    var _this = this;

    this.schemaManager = schemaManager;

    this.extension = method;

    this.respond = (res) => {
        return function(data) {
            res.send(JSON.stringify(data));
        }
    };

    this.respondWithError = (res) => {
        return function(error) {
            console.log('respondWithError', error);
            res.status(400).send({error: error.toString()});
        }
    };

    // parameters are validated at this point and is executed within a promise
    this.execute = (params) => {
        return param;
    };

    this.validate = (req) => {
        var params = req.body;
        return new Promise((resolve, reject) => {
            jschema.validate(params, _this.schema(), (validationError) => {
                if (validationError) {
                    reject({code: 400, message: normaliseErrors(validationError)});
                } else {
                    resolve(req);
                }
            });
        })
    };

    this.process = (res) => {
      return (req) => {
        var _this = this;
        return new Promise((resolve, reject) => {
            if (req.headers['x-consumer-custom-id'] != '2fd91f35-5243-4226-b182-e138d34825f5') {
              reject(new Error("Unauthorized"));
            } else {
              console.log('DYNA PROCESS', req.headers['x-consumer-custom-id']);
              try {
                _this.extension.execute(method.desc().method == 'get' ? req.query : req.body, resolve, reject, schemaManager, req.tenant, req, res);
              } catch (error) {
                console.log('dynamethod catch', error);
                reject(error);
              }
            }
        });
      };
    };

    this.schema = () => {
        var parameters = {
            "$schema": "http://json-schema.org/draft-04/schema#",
            "type": "object"
        };
        var desc = _this.extension.desc();
        parameters["id"] = desc.id;
        parameters["title"] = desc.title;
        parameters["description"] = desc.description;
        parameters["properties"] = desc.properties;
        parameters["required"] = desc.required;
        return parameters;
    };

    this.requestHook = (req, res) => {
        this.validate(req)
            .then(this.process(res))
            .then(this.respond(res))
            .catch(this.respondWithError(res));
    };

    return this;
};

DynaMethod.hookFactory = (endPoint, method, schemaManager) => {
    var schema = require(process.cwd() + `/extensions/dyna/${endPoint}/${method.desc().id}`);
    var dynaMethod = new DynaMethod(schema, schemaManager);
    return dynaMethod.requestHook;
};

module.exports = DynaMethod;
