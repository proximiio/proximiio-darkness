module.exports = function RequestLogger(req, res, next) {

    const start = new Date();

//    req.on('end', () => {
      if (req.path.indexOf('_health') === -1 && req.path.indexOf('/kue') === -1) { 
      if (typeof req.headers['x-consumer-username'] == "undefined") {
        console.log('UNDEFINED CONSUMER!', req.headers);
      }

      const now = new Date();
      const took = ` (${now.getTime() - start.getTime()}ms)`;
      console.log(new Date() + ' [' + req.headers['x-consumer-username'] + '/' + req.headers['x-forwarded-for'] + '] ' + req.method + ':' + req.path + took);

      if (typeof req.query != "undefined" && req.query.length > 0) {
        console.log('query:', JSON.stringify(req.query, null, 4));
      }

      if (typeof req.body != "undefined") {
        // console.log('body:', JSON.stringify(req.body, null, 4));
      }
      }
  //  });
    next();
};
