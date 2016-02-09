var TokenManager = require('./token_manager');
var UserNotFoundError = require('./errors/userNotFoundError');
var Tenant = require('./tenant');

/**
 * User Model
 *
 * @param data
 * @param schemaManager
 * @returns {User}
 * @constructor
 */
var User = function(data, schemaManager) {
    var _this = this;
    this.data = data;

    var storage = schemaManager.storage.table('users');

    this.getId = function() {
        return this.data.id;
    };

    this.getName = function() {
        return this.data.name;
    };

    /**
     * Upserts current user data to datastore
     *
     * @returns {*}
     */
    this.save = function() {
        if (typeof _this.data.id == 'undefined') {
            // create
            _this.data.createdAt = new Date().toISOString();
            _this.data.updatedAt = _this.data.createdAt;
            _this.data.password = TokenManager.encode(_this.data.password, schemaManager.schema.secret);
            return storage.insert(_this.data).run().then(function(results) {
                _this.data.id = results.generated_keys[0];
                _this.id = _this.data.id;
                return _this;
            });
        } else {
            // update
            return storage.get(_this.data.id).update(_this.data).run().then(function(results) {
                return _this;
            });
        }
    };

    /**
     * Sets User Token, change is not persisted so call save if u need to
     *
     * @param {String} token
     */
    this.setToken = function(token) {
        this.data.token = token;
    };

    /**
     * Returns User Token
     *
     * @returns {String} token
     */
    this.getToken = function() {
        return this.data.token;
    };

    /**
     * Returns assigned Tenant ID
     *
     * @returns {*}
     */
    this.getTenantId = function() {
        return _this.data[schemaManager.getTenantIdField()];
    };

    /**
     * Returns Tenant in Promise
     *
     * @returns {Promise}
     */
    this.getTenant = function() {
        return Tenant.get(this.getTenantId(), schemaManager);
    };

    /**
     * Sets assigned Tenant to local property
     *
     * @param tenant
     */
    this.setTenant = function(tenant) {
        _this.tenant = tenant;
    };

    /**
     * Public representation of tenant data
     *
     * @returns {{id: *, name: *}}
     */
    this.public = function() {
        return {
            id: this.data.id,
            name: this.data.name,
            email: this.data.email
        }
    };

    return this;
};

/**
 * Finds user using email and password
 *
 * @param email {String} - User Login Email
 * @param password {String} - User Password
 * @param schemaManager {SchemaManager}
 * @returns {Promise}
 */
User.findByEmailAndPassword = function(email, password, schemaManager) {
    var encodedPassword = TokenManager.encode(password, schemaManager.schema.secret);
    var filter = {email: email, password: encodedPassword};
    return schemaManager.storage.table('users').filter(filter).run().then(function(data) {
        if (data.length == 1) {
            return new User(data[0], schemaManager);
        } else {
            throw new UserNotFoundError();
        }
    });
};

/**
 * Finds user using token
 *
 * @param token {String} - User Token
 * @param schemaManager {SchemaManager}
 * @returns {Promise}
 */
User.findByToken = function(token, schemaManager) {
    return schemaManager.storage.table('users').filter({token: token}).run().then(function(data) {
        if (data.length == 1) {
            return new User(data[0], schemaManager);
        } else {
            throw new UserNotFoundError();
        }
    })
};

/**
 * Finds user using id
 *
 * @param {String } userId
 * @param {SchemaManager} schemaManager
 * @returns {*}
 */
User.get = function(userId, schemaManager) {
    return schemaManager.storage.table('users').get(userId).run().then(function(data) {
        if (data != null) {
            return new User(data, schemaManager);
        } else {
            throw new UserNotFoundError();
        }
    })
};

module.exports = User;