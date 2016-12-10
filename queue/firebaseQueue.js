var kue = require('kue');
var queue = kue.createQueue();
var Firebase = require('firebase');
var GeoFire = require('geofire');
const refUrl = 'https://proximiio-bus.firebaseio.com/';
const TOKEN = 'ygpPvJAsV7TTeRFF5dtPl6ZuFOUcQaVQNzuvzQht';

const firebase = new Firebase(refUrl).child('organizations');
firebase.authWithCustomToken(TOKEN);

queue.watchStuckJobs(5000);

queue.on('ready', () => {
  console.log('firebase queue ready');
});

queue.on('error', (err) => {
  console.error('error', err);
});

const updatePosition = (data, done) => {
  queue.create('position-updates', data)
    .priority('normal')
    .attempts(3)
    .backoff(true)
    .removeOnComplete(false)
    .save((err) => {
      if (err) {
        console.error('QUEUE position-updates FAILURE', err);
        done(err);
      } else {
        done();
      }
    });
};

queue.process('position-updates', 20, (job, done) => {
  //console.log('[Q:elastic-updates]', job.id);
  const params = job.data;
  const ref = firebase.child(params.organization_id).child('positions');
  const geoFire = new GeoFire(ref);

  // mark visitor position to geofire
  const geopoint = [params.location.lat, params.location.lng];

  geoFire.set(params.visitor_id, geopoint)
    .then(() => {
      // success, update position timestamp
      ref.child(params.visitor_id).child('timestamp').set(Firebase.ServerValue.TIMESTAMP)
        .then(done, done);
    }, done);
});

module.exports = {
  updatePosition: (data, done) => {
    updatePosition(data, done);
  }
}
