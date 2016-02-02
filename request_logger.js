module.exports = function RequestLogger(req, res, next) {
    console.log(new Date(), req.url, req.headers);
    next();
};