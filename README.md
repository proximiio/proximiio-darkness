# proximiio-darkness

## Controllers

### AuthController
Provides all user-specific methods: changePassword, resetPassword, checkCompany, login, logout, currentUser

### RegistrationController
Takes care of complete registration/defaults chain

### RestController
Complete REST endpoint generation based on Darkness Schema

## Models

### Tenant
basic Tenant (Organization) functionality, has methods for fetching data, 
verifying and generating tokens, generates JSONs from organizations that are used for mobile sdk inits.

### User
provides wrapping of User objects

## Adapters

### ElasticAdapter
ElasticSearch adapter, offloads all writes to Kue background jobs

### SchemaModelHandler
Provides light abstraction over models to extract & validate expected attributes from requests/jsons

### SchemaToSwagger
Generates Swagger def from Darkness Schema

## Managers

### KongManager
Simple adapter providing Kong Consumer Credentials processing and Consumer creation

### RethinkManager
Takes care of creating table & indexes (based on Darkness Schema)

### SchemaManaager
Manager that is initializing/centralizing all database/services adapters, constructs the service from DarknessSchema,
it is the basic framework object that is passed along the whole infrastructures.

## Middlewares

### BoolConvert
Provides optional boolean conversion for IOS (ios won't send true/false natively, instead sends 0 & 1 which we convert to true / false with this middleware)

### ContentTypeManager
Sets default application/json content-type

### HealthCheck
Provides stats endpoint (/_health) for health checkers

### KongConsumer
Transforms Kong Consumer Headers into req.consumer object

### TenantAuthorizer
Transforms req.consumer object into req.tenant (Tenant) and provides basic endpoint security

### RemoteTenantAuthorizer
TenantAuthorizer alternative that uses remote Darkness Service as TenantAuthorizer (for auth service centralization)

## Usage

require proximiio-darkness with reference to app.json and start app

var darkness = require('proximiio-darkness');
darkness.start(__dirname + '/app.json', function(app) {
  // do custom app logic here
});
