var kue = require('kue');
var queue = kue.createQueue();
var Firebase = require('firebase');
var GeoFire = require('geofire');

const _ = require('lodash');
const uuid = require('uuid');

const refUrl = 'https://proximiio-bus.firebaseio.com/';
const TOKEN = 'ygpPvJAsV7TTeRFF5dtPl6ZuFOUcQaVQNzuvzQht';

const firebase = new Firebase(refUrl).child('organizations');
const firebaseQueue = require('./firebaseQueue');

let storage = null;
let elasticAdapter = null;

firebase.authWithCustomToken(TOKEN);

queue.watchStuckJobs(5000);

queue.on('ready', () => {
  console.log('event queue ready');
});

queue.on('error', (err) => {
  console.error('error', err);
});

const createEvent = (data, done) => {
  queue.create('events-create', data)
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

const exists = (object, value) => {
  return object !== undefined && object !== null && object[value] !== undefined && object[value] !== null;
}

queue.process('events-create', 20, (job, done) => {
  const params = job.data;

  if (params.data !== undefined && !Array.isArray(params.data.tags)) {
    params.data.tags = [];
  }

  const ref = firebase.child(params.organization_id).child('positions');

  const fetchGeofence = (params) => {
    if (exists(params.data, 'geofence_id')) {
      return storage.table('geofences')
          .get(params.data.geofence_id)
          .then((geofence) => {
            if (geofence !== null) {
              params.data.geofence = geofence.name;
              if (exists(geofence, 'place_id')) {
                params.data.place_id = geofence.place_id;
              }
              if (exists(geofence, 'department_id')) {
                params.data.department_id = geofence.department_id;
              }
            }
            return params;
          })
          .catch((error) => {
            console.error(error);
          });
    } else {
      return new Promise((resolve, reject) => {
        resolve(params);
      });
    } 
  };

  const fetchPlace = (params) => {
    if (exists(params.data, 'place_id')) {
      return storage.table('places')
        .get(params.data.place_id)
        .then((place) => {
          if (place !== null) {
            params.data.place = place.name;
            if (exists(params.data, 'floor_id')) {
              params.data.floor_id = place.floor_id;
            }
            if (place.tags !== undefined) {
              params.data.tags = params.data.tags.concat(place.tags);
            }
            params.data.tags = _.uniq(params.data.tags);
          }
          return params; 
        });
    } else {
      return params;
    }
  };

  const fetchDepartment = (params) => {
    if (exists(params.data, 'department_id')) {
      return storage.table('departments')
        .get(params.data.department_id)
        .then((department) => {
          if (department !== null) {
            params.data.department = department.name;
          }
          return params;
        });
    } else {
      return params;
    }
  };

  const fetchFloor = (params) => {
    if (exists(params.data, 'floor_id')) {
      return storage.table('floors')
        .get(params.data.floor_id)
        .then((floor) => {
          if (floor != null) {
            params.floor = floor.name;
          }
          return params;
        });
    } else {
      return params;
    }
  };

  const fetchVisitor = (params) => {
    if (exists(params.data, 'visitor_id')) {
      return storage.table('visitors')
        .get(params.data.visitor_id)
        .then((visitor) => {
          if (visitor != null) {
            params.data.visitor = visitor;
          }
          return params;
        });
    } else {
      return params;
    }
  };

  const updateVisitorTags = (params) => {
    if (exists(params.data, 'visitor') && Array.isArray(params.data.tags)) {
      const tags = params.data.tags;
      const promises = [];
      params.data.tags.forEach((tag) => {
        const tagUpdate = {};
        tagUpdate[tag] = storage.row(tag).add(1).default(0);
        promises.push(
          storage.table('visitors')
            .get(params.data.visitor_id)
            .update(tagUpdate)
        );
      });
      return Promise.all(promises).then((values) => { return params; });
    } else {
      return params;
    }
  };

  const calculateDwellTime = (params) => {
    if (params.event !== 'exit' || typeof params.dwellTime !== 'undefined') {
      return params;
    }

    // find last enter event
    var bundle = {
      "query": {
        "constant_score" : {
          "filter" : {
            "bool" : {
              "must": [
                  { "match": { "organization_id" : params.organization_id } },
                  { "match": { "data.visitor_id" : params.data.visitor_id } },
                  { "match": { "event" : "enter" } },
                  { "match": { "data.geofence_id" : params.data.geofence_id } },
                  { "range": { "createdAt": { "lt": new Date().toISOString() } } }
              ]
            }
          }
        }
      },
      "sort": [ {"createdAt": {"order": "desc"} }],
      "size": 1
    }

    return elasticAdapter.search('event', bundle)
      .then((response) => {
        const results = response.results;
        if (Array.isArray(results) && results.length === 1) {
          const enterEvent = results[0];
          var entered = new Date(enterEvent.createdAt);
          var exited = new Date();
          var dwell = parseInt((exited.getTime() - entered.getTime()) / 1000);
          params.dwellTime = dwell;
          params.enter_event_id = enterEvent.id;
          return storage.table('events')
            .get(enterEvent.id)
            .update({ dwellTime: dwell, exit_event_id: params.id })
            .then((result) => {
              enterEvent.dwellTime = dwell;
              enterEvent.exit_event_id = params.id;
              enterEvent.updatedAt = new Date().toISOString();
              elasticAdapter.update('event', enterEvent, params.organization_id, params.organization_name);
              return params;
            });
        } else {
          return params;
        }
      }); 
  };

  // const attachPreviousTimestamp = (params) => {
  //   // find last enter event
  //   if (params.event !== 'config-change' && params.organization_id !== undefined && params.data.visitor_id !== undefined) {
  //     console.log('should attach previous timestamp', params);
  //     var bundle = {
  //       "query": {
  //         "constant_score" : {
  //           "filter" : {
  //             "bool" : {
  //               "must": [
  //                   { "match": { "organization_id" : params.organization_id } },
  //                   { "match": { "data.visitor_id" : params.data.visitor_id } },
  //                   { "range": { "createdAt": { "lt": new Date().toISOString() } } }
  //               ],
  //               "must_not": [
  //                   { "match": { "event" : 'config-change' } },
  //               ]
  //             }
  //           }
  //         }
  //       },
  //       "sort": [ {"createdAt": {"order": "desc"} }],
  //       "size": 1
  //     };

  //    console.log('elastic last query:', JSON.stringify(bundle, null, 4));
  //    return elasticAdapter.search('event', bundle)
  //     .then((response) => {
  //       const results = response.results;
  //       console.log('previous found', JSON.stringify(response, null, 4));
  //       if (Array.isArray(results) && results.length === 1) {
  //         const lastEvent = results[0];
  //         params.lastEventTimestamp = lastEvent.createdAt;
  //       }
  //       return params;
  //     });
  //  } else {
  //    console.log('skipping previousTimestamp search, missing params:', params);
  //    return params;
  //  }
  // };

  const createRecord = (params) => {
    if (typeof params.createdAt === 'undefined') {
      params.createdAt = new Date().toISOString();
    }
    params.updatedAt = params.createdAt;
    return storage.table('events')
      .insert(params)
      .then((result) => {
        return params; 
      });
  };

  const saveToFirebase = (params) => {
    firebaseQueue.saveEvent(params, () => {});
    return params;
  };

  const touchLast = (params) => {
    firebaseQueue.touchLast(params, () => {});
    return params;
  };

  const updateElastic = (params) => {
    elasticAdapter.update('event', params, params.organization_id, params.organization_name);
    return params;
  };

  fetchGeofence(params)
    .then(fetchDepartment)
    .then(fetchPlace)
    .then(fetchFloor)
    .then(fetchVisitor)
    // .then(attachPreviousTimestamp)
    .then(updateVisitorTags)
    .then(calculateDwellTime)
    .then(createRecord)
    .then(saveToFirebase)
    .then(touchLast)
    .then(updateElastic)
    .then((params) => {
      done();
    })
    .catch((error) => {
      console.error('error', error);
      done(error);
    });
});

module.exports = {
  setStorage: (_storage) => {
    storage = _storage;
  },
  setElasticAdapter: (_elasticAdapter) => {
    elasticAdapter = _elasticAdapter;
  },
  create: (data, done) => {
    createEvent(data, done);
  }
}
