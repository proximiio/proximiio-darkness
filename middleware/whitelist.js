var _ = require('underscore');

module.exports = function UrlWhitelist(options) {
    var whitelist = options;
    return function (req, res, next) {
        _.each(whitelist, function(url) {
            if (typeof url == 'string') {
                if (url == req.path) {
                    req.isWhitelisted = true;
                }
            } else if (typeof url == 'object') {
                if (url.type == 'parent') {
                    if (req.path.indexOf(url.parent) == 0) {
                        req.isWhitelisted = true;
                    }
                }
            }
        });

        next();
    }
};