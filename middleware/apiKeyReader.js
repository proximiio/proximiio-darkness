module.exports = function ApiKeyReader(options) {
    return function(req, res, next) {
        if (req.isWhitelisted) {
            next();
        } else {
            if (req.headers.hasOwnProperty('api-key')) {
                req.apiKey = req.headers['api-key'];
                next();
            } else {
                res.status(403).send("Api-Key is missing");
            }
        }
    }
};