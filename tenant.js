"use strict";

var _ = require('underscore');
var pluralize = require('plur');
var TokenManager = require('./token_manager');
var TenantNotFoundError = require('./errors/tenantNotFoundError');
var InvalidTokenError = require('./errors/invalidTokenError');
var FirebaseTokenGenerator = require("firebase-token-generator");

/**
 * Tenant object instance
 *
 * @param tenant {Object} - Tenant Data JSON
 * @param schemaManager {SchemaManager}
 * @returns {Tenant}
 * @constructor
 */
var Tenant = function(tenant, schemaManager) {

    var _this = this;
    this.id = tenant.id;
    this.data = tenant;

    var storage = schemaManager.storage.table(schemaManager.getTenantEntityPlural());

    /**
     * Returns Tenant ID
     *
     * @returns {String}
     */
    this.getId = function() {
        return _this.data.id;
    };

    /**
     * Returns Tenant Name
     *
     * @returns {String}
     */
    this.getName = function() {
        return _this.data.company;
    };

    /**
     * Returns Decoded Consumer Credentials
     *
     * @returns {Object|Array|String|Number|*}
     */
    this.getConsumerCredentials = function() {
        return TokenManager.decode(_this.data.consumerCredentials, schemaManager.schema.secret);
    };

    /**
     * Sets Consumer-Id
     *
     * @param consumerId
     */
    this.setConsumerId = function(consumerId) {
        _this.data.consumer_id = consumerId;
    };

    /**
     * Encodes Consumer Credentials to JWT and assigns them
     *
     * @param consumerCredentials
     */
    this.setConsumerCredentials = function(consumerCredentials) {
        _this.data.consumerCredentials = TokenManager.encode(consumerCredentials, schemaManager.schema.secret);
    };

    /**
     * Decodes JWT Token
     * @param {String} token - JWT Token
     * @returns {boolean}
     */
    this.decodeToken = function(token) {
        var tenantSecret = TokenManager.decode(this.data.secret, schemaManager.schema.secret);
        if (tenantSecret == null)
            return null;
        return TokenManager.decode(token, tenantSecret);
    };

    /**
     * Checks if Token is still active
     *
     * @param token
     * @returns {Promise}
     */
    this.authorizeToken = function(token) {
        return new Promise(function(resolve, reject) {
            var valid = _.contains(_this.data.tokens, token);
            if (valid) {
                var credentials = _this.getConsumerCredentials();
                var payload = TokenManager.decode(token, credentials.secret);
                if (payload != null) {
                    resolve(payload);
                } else {
                    reject(new InvalidTokenError());
                }
            } else {
                console.error('rejecting authorizeToken');
                reject(new InvalidTokenError());
            }
        });
    };

    /**
     * Returns Write Token belonging to Tenant
     *
     * @returns {String} - JWT Token
     */
    this.getWriteToken = function() {
        var writeToken = null;
        _.each(this.data.tokens, function(token) {
            if (_this.validateWriteToken(token)) {
                writeToken = token;
            }
        });
        return writeToken;
    };

    /**
     * Validates Read-Permission Token
     *
     * @param token {String} - JWT Token
     * @returns {boolean}
     */
    this.validateReadToken = function(token) {
        return _this.decodeToken(token) != null;
    };

    /**
     * Validates Write-Permission Token
     *
     * @param token {String} - JWT Token
     *
     * @returns {boolean}
     */
    this.validateWriteToken = function(token) {
        var payload = _this.decodeToken(token);
        return payload != null && payload.write;
    };

    /**
     * Convenience method to check if tenant is owner of entity
     *
     * @param entity {Object} Data Entity JSON
     * @returns {boolean}
     */
    this.validatesOwnership = function(entity) {
        //console.log('checking entity:', entity, ' attribute: ', schemaManager.schema.multitenancy.entity + '_id', ' for match with', _this.data.id);
        return entity[schemaManager.schema.multitenancy.entity + '_id'] == _this.data.id;
    };

    /**
     * Public representation of tenant data
     *
     * @returns {{id: *, name: *}}
     */
    this.public = function() {
        var eventBusTokenGenerator = new FirebaseTokenGenerator('WoFFQU9nRVFmV9hC4e8IVSsorpscneeKiJMLHzTL');
        var positionsTokenGenerator = new FirebaseTokenGenerator('7nAmtspbOctzkqYGwyC4MCoZuAUrlEDL31xGb335');
        var proximiioBusTokenGenerator = new FirebaseTokenGenerator('ygpPvJAsV7TTeRFF5dtPl6ZuFOUcQaVQNzuvzQht');

        var eventBusToken = eventBusTokenGenerator.createToken({organization: _this.getId(), uid: _this.getId()});
        var positionsToken = positionsTokenGenerator.createToken({organization: _this.getId(), uid: _this.getId()});

        var proximiioBusToken = proximiioBusTokenGenerator.createToken({organization: _this.getId(), uid: _this.getId()});    
        var proximiioBusRef = "https://proximiio-bus.firebaseio.com/organizations/" + _this.getId();

        var stripePlan = 'hobby';
        var trialEnd = false;
        var planStatus = 'trialing';
        //console.log('login stirpe', _this.data.stripe);
        if (_this.data.stripe && _this.data.stripe.subscriptions !== undefined && _this.data.stripe.subscriptions.data !== undefined &&
            _this.data.stripe.subscriptions.data.length > 0) {
          stripePlan = _this.data.stripe.subscriptions.data[0].plan.id;
          trialEnd = _this.data.stripe.subscriptions.data[0].trial_end;
          planStatus = _this.data.stripe.subscriptions.data[0].status;
        }
        
        const data = {
            id: _this.getId(),
            name: _this.getName(),
            background: _this.data.background,
            country: _this.data.country,
            email: _this.data.email,
            address: _this.data.address,
            vat: _this.data.vat, 
            provider: _this.data.provider,
            stripe: _this.data.stripe !== undefined,
            plan: stripePlan,
            planStatus: planStatus,
            trialEnd: trialEnd,
            eventBusToken: eventBusToken,
            positionsToken: positionsToken,
            proximiioBusToken: proximiioBusToken,
            proximiioBusRef: proximiioBusRef,
            eventBusRef: schemaManager.settings().firebase.ref + '/' + schemaManager.getTenantEntityPlural() + '/' + _this.data.id + ''
        }
        
        if (typeof _this.data.red != 'undefined') {
          data.red = _this.data.red;
        }
        return data;
    };

    /**
     * Upserts current tenant data to datastore
     *
     * @returns {*}
     */
    this.save = function() {
        if (typeof _this.data.id == 'undefined') {
           //console.log('inserting tenant', _this.data);
            // create
            _this.data.createdAt = new Date().toISOString();
            _this.data.updatedAt = _this.data.createdAt;
            _this.data.password = TokenManager.encode(_this.data.password, schemaManager.schema.secret);
            return storage.insert(_this.data).run().then(function(results) {
                //console.log('tenant saved');
                _this.data.id = results.generated_keys[0];
                _this.id = _this.data.id;
                return _this;
            }).catch((error) => { console.error('TENANT CREATE ERROR', error)});
        } else {
            // update
            return storage.get(_this.data.id).update(_this.data).run().then(function(results) {
                return _this;
            });
        }
    };

    /**
     * Adds token to local token array, creates the token array if it doesn't exist yet
     *
     * @param {String} token
     */
    this.addToken = function(token) {
        if (typeof _this.data.tokens == 'undefined') {
            _this.data.tokens = [];
        }
        _this.data.updatedAt = new Date().toISOString();
        _this.data.tokens.push(token);
    };

    /**
     * Generates new User Token
     *
     * @returns {String}
     */
    this.generateUserToken = function() {
        var credentials = TokenManager.decode(_this.data.consumerCredentials, schemaManager.schema.secret);
        return TokenManager.userToken(credentials.key, credentials.secret);
    };

    /**
     * Generates new Application Token
     *
     * @param {String} applicationId
     * @returns {String}
     */
    this.generateApplicationToken = function(applicationId) {
        var credentials = TokenManager.decode(_this.data.consumerCredentials, schemaManager.schema.secret);
        return TokenManager.applicationToken(credentials.key, credentials.secret, applicationId);
    };

    this.decodeTokens = function() {
        var decoded = [];
        var credentials = TokenManager.decode(_this.data.consumerCredentials, schemaManager.schema.secret);
        _this.data.tokens.forEach((token) => {
          var tokenObject = {};
          tokenObject[token] = TokenManager.decode(token, credentials.secret);
          delete tokenObject[token].typ;
          delete tokenObject[token].iss;
          delete tokenObject[token].alg; 
          decoded.push(tokenObject);
        }); 
        return decoded;
    };

    this.getData = function() {
        return _this.data;
    };

    this.authResponse = function(token) {
        return JSON.stringify({
            id: _this.data.id,
            name: _this.data.name,
            token: token
        });
    };

    return this;

};

/**
 * Initializes tenant by ID
 *
 * @param tenantId {String} - Tenant ID
 * @param schemaManager {SchemaManager}
 * @returns {Promise}
 */
Tenant.get = function(tenantId, schemaManager) {
    return schemaManager.storage.table(schemaManager.getTenantEntityPlural()).get(tenantId).run().then(function(data) {
        if (data) {
            return new Tenant(data, schemaManager);
        } else {
            throw new TenantNotFoundError();
        }
    });
};

module.exports = Tenant;
