"use strict";

class GeoPoint {

    constructor(geoPoint) {
        this.lat = geoPoint.lat;
        this.lng = geoPoint.lng;
    }

    location() {
        return {
            latitude: this.lat,
            longitude: this.lng
        }
    }

    timeLocation(timestamp) {
        this.time = timestamp;
    }

    static schemaRef() {
        return "https://api.proximi.fi/core_schema/models/Geopoint";
    }

    static locationToGeopoint(location) {
        return {
            lat: location.latitude,
            lng: location.longitude
        }
    }

    static fromLocation(location) {
        return new this(this.locationToGeopoint(location));
    }

    static fromLocations(locations) {
        var result = [];
        locations.forEach((location) => {
            var geoPoint = GeoPoint.fromLocation(locations);
            result.push(geoPoint);
        });
        return result;
    }

    static geoPointLocationObjects(locations) {
        locations.forEach((location) => {
            if (location.hasOwnProperty('latitude')) {
                location.lat = location.latitude;
                delete location.lat;
            }
            if (location.hasOwnProperty('longitude')) {
                location.lng = location.longitude;
                delete location.lng;
            }
        });
    }

    static locationsFrom(geopointsArray) {
        var result = [];
        geopointsArray.forEach((geoPointData) => {
            var geoPoint = new GeoPoint(geoPointData);
            result.push(geoPoint.location());
        });
        return result;
    }

    static units() {
        return {
            METER: 'meter',
            KILOMETER_PER_HOUR: 'kmh'
        }
    }

}

module.exports = GeoPoint;