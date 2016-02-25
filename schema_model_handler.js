"use strict";
var _ = require('underscore');
var JaySchema = require('jayschema');
var jschema = new JaySchema(JaySchema.loaders.http);
var normaliseErrors = require('jayschema-error-messages');
var Promise = require('bluebird');

jschema.addFormat('uuid', function(value) {
    var REGEXP = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    if (REGEXP.test(value)) { return null; }
    return 'must be uuid format';
});

module.exports = function SchemaModelHandler(schema) {
    var _this = this;

    this.schema = schema;

    this.propertiesArray = Object.keys(this.schema.properties);

    this.validate = function(object, callback) {
        jschema.validate(object, this.schema, callback);
    };

    this.checkParams = function(object, isUpdate) {
        if (typeof isUpdate == "undefined") isUpdate = false;

        return new Promise(function(resolve, reject) {
            var extracted = _this.extractProperties(object, isUpdate);
            _this.validate(extracted, function(error) {
                if (error) {
                    reject(error);
                } else {
                    resolve(extracted);
                }
            });
        });
    };

    this.extractAndValidateParams = function(object, callback) {
        var extracted = this.extractProperties(object);
        this.validate(extracted, function(error) {
            if (error) {
                callback(normaliseErrors(error), null);
            } else {
                callback(null, extracted);
            }
        });
    };

    this.extractProperties = function(object, isUpdate) {
        var result = {};
        _.each(this.propertiesArray, function(property) {
            if (typeof object[property] != 'undefined') {
              result[property] = object[property];
            }
        });
        if (typeof result['id'] == 'undefined' && !isUpdate) {
            delete result['id'];
        }
        return result;
    };

    return this;
};
