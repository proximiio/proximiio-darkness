module.exports = function RequestLogger(req, res, next) {
    console.log(new Date(), 'url:', req.url, 'headers:', req.headers, 'params:', req.params, 'body:', req.body);
    next();
};