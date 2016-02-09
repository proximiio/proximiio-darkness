var requestPromise = require('request-promise');

/**
 *
 * @param {SchemaManager} schemaManager
 * @returns {KongManager}
 * @constructor
 */
var KongManager = function(schemaManager) {
    var _this = this;

    /**
     * returns url for Kong Admin Resource (http://my.kong.io:1234/consumers/abcd-efgh-1234-5668)
     *
     * @param resource
     * @param [id]
     * @returns {String} Kong Admin Resource Url
     */
    var urlFor = function(resource, id) {
        var url = schemaManager.schema.apiRouter.admin_api + '/' + resource;
        if (typeof id != 'undefined') {
            url += '/' + id;
        }
        return url;
    };

    /**
     * Creates Kong Consumer
     *
     * @param {Object} tenant - Tenant or Application object to bind Kong Consumer to, must contain id and name properties.
     *
     * @returns {Promise}
     */
    this.createConsumer = function(tenant) {
        return requestPromise({
            method: 'POST',
            uri: urlFor('consumers'),
            form: {
                custom_id: tenant.getId(),
                username: tenant.getName()
            }
        }).then(function(response) {
            console.log('created consumer', response, 'for tenant', tenant.getId());
            tenant.setConsumerId(JSON.parse(response).id);
            return tenant;
        });
    };

    /**
     * Creates Kong Consumer JWT Credential Generation Set
     *
     * @param {Tenant} tenant
     * @returns {*}
     */
    this.createConsumerCredentials = function(tenant) {
        return requestPromise({
            method: 'POST',
            uri: urlFor('consumers', tenant.data.consumer_id + '/jwt')
        }).then(function(response) {
            console.log('create consumer credentials response', response, 'tenant', tenant);
            tenant.setConsumerCredentials(JSON.parse(response));
            return tenant;
        });
    };
    return this;
};

module.exports = KongManager;