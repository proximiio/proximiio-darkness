const kue = require('kue');
const queue = kue.createQueue();
const Stripe = require('stripe');
const moment = require('moment');
const TAG = '[stripeQueue]';

// assign using exported methods
let r = null;
let STRIPE_TOKEN = null;
let stripe = null;

queue.watchStuckJobs(10000);

queue.on('ready', () => {
  console.log(TAG, 'ready');
});

queue.on('error', (err) => {
  console.error(TAG, 'error', err);
});

const createCustomer = (data, done) => {
  console.log('posting job with data', data);
  const job = queue.create('stripe-customer-create', data)
    .priority('critical')
    .attempts(3)
    .backoff(true)
    .removeOnComplete(true)
    .save((err) => {
      if (err) {
        console.error(TAG, 'error', err);
        done(err);
      }
    });

  job.on("complete", () => {
    console.log('job complete');
    done();
  });
  job.on("failed", (error) => {
    console.log("job failed", error);
    done(error);
  });
};

queue.process('stripe-customer-create', 1, (job, done) => {
  console.log('processing job:', job);
  const customer = {
    description: job.data.company,
    email: job.data.email,
    metadata: {
      organization_id: job.data.id
    },
    plan: 'guru',
    trial_end: parseInt(moment().add(1, 'month').format('X'))
  };
  stripe.customers.create(customer, (err, stripeCustomer) => {
    if (err) {
      console.error(TAG, 'stripe-side processing error', err);
      done(err);
    } else {
      r.table('organizations')
        .get(job.data.id)
        .update({stripe: stripeCustomer})
        .then(() => { console.log('stripe finished, customer updated should return; '); done(); })
        .catch(done);
    }
  });
});

module.exports = {
  // rethinkdb storage
  setStorage: (storage) => {
    r = storage;
  },
  // stripe token
  setToken: (token) => {
    STRIPE_TOKEN = token;
    stripe = Stripe(STRIPE_TOKEN);
  },
  createCustomer: (data, done) => {
    createCustomer({
      id: data.id,
      name: data.name,
      email: data.email,
      company: data.name
    }, done);
  }
}

