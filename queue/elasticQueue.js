var kue = require('kue');
var queue = kue.createQueue();
var request = require("request");
var elastic;

//kue.app.listen(9090);

queue.watchStuckJobs(5000);

queue.on('ready', () => {
  console.log('updateElasticRecord queue ready');
});

queue.on('error', (err) => {
  console.error('error', err);
});

const updateRecord = (data, done) => {
  var job = queue.create('elastic-updates', data)
    .priority('critical')
    .attempts(3)
    .backoff(true)
    .removeOnComplete(true)
    .save((err) => {
      if (err) {
        console.error('QUEUE elastic-update FAILURE', err, 'job:', job.id);
        done(err);
      } else {
        //console.log("job injected", job.id);
        done();
      }
    });
};

queue.process('elastic-updates', 10, (job, done) => {
  elastic.update(job.data, function(result) {
    done();
  });
});

module.exports = {
  setClient: (client) => {
    elastic = client; 
  },
  updateRecord: (data, done) => {
    updateRecord(data, done);
  }
}
