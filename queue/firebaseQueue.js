var kue = require('kue');
var queue = kue.createQueue();
var Firebase = require('firebase');
var GeoFire = require('geofire');
const _ = require('lodash');

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
    .removeOnComplete(true)
    .save((err) => {
      if (err) {
        console.error('QUEUE position-updates FAILURE', err);
        done(err);
      } else {
        done();
      }
    });
};

const saveEvent = (data, done) => {
  queue.create('event-save', data)
    .priority('normal')
    .attempts(3)
    .backoff(true)
    .removeOnComplete(false)
    .save((err) => {
      if (err) {
        console.error('QUEUE even-save FAILURE', err);
        done(err);
      } else {
        done();
      }
    });
};

const touchLast = (data, done) => {
  queue.create('touch-last', data)
    .priority('normal')
    .attempts(3)
    .backoff(true)
    .removeOnComplete(false)
    .save((err) => {
      if (err) {
        console.error('QUEUE touch-last FAILURE', err);
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

const proximityEvents = ['enter', 'exit', 'leave'];
const isProximityEvent = (data) => {
  return _.includes(proximityEvents, data.event);
};

queue.process('event-save', 20, (job, done) => {
  const params = job.data;
  const child = isProximityEvent(params) ? 'proximity' : 'global';
  var update = {};
  update[params.id] = JSON.parse(JSON.stringify(params));
  update[params.id].timestamp = Firebase.ServerValue.TIMESTAMP;
  firebase.child(params.organization_id).child(child).update(update)
    .then(function(key) {
       console.log('firebase updated', params.id, child, key);
       done();
    })
    .catch((error) => {
      console.log('firebase catched error:', error);
      done(error);
    });
});

queue.process('touch-last', 20, (job, done) => {
  console.log('should touch last_event @ ', job.data.organization_id);
  const ref = firebase.child(job.data.organization_id).child('last_event');
  const timestamp = new Date().getTime();
  ref.set(timestamp)
     .then(() => {
       console.log('touch last success');
       done();
     })
     .catch((error) => {
       console.error('touch last failure', error);
       done(error);
     });
});

module.exports = {
  updatePosition: (data, done) => {
    updatePosition(data, done);
  },
  saveEvent: (data, done) => {
    saveEvent(data, done);
  },
  touchLast: (data, done) => {
    touchLast(data, done);
  }
}
