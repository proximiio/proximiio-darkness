var _ = require('underscore');
var Log = require('../logger');

/**
 * URL Whitelist Middleware
 *
 * @param {Array} whitelist - Schema Whitelist object
 * @returns {Function} - Express Middleware Function
 * @constructor
 */
var UrlWhitelist = function(whitelist) {
    var TAG = "UrlWhitelist";
    return function (req, res, next) {
        _.each(whitelist, function(url) {
            if (typeof url == 'string') {
                if (url == req.path) {
                    req.isWhitelisted = true;
                    //Log.d(TAG, "Whitelisting request");
                }
            } else if (typeof url == 'object') {
                if (url.type == 'parent') {
                    if (req.path.indexOf(url.parent) == 0) {
                        req.isWhitelisted = true;
                        //Log.d(TAG, "Whitelisting request");
                    }
                }
            }
        });
        next();
    }
};

module.exports = UrlWhitelist;
