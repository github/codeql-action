"use strict";

var assert = require("@sinonjs/referee").assert;
var api = require("./index");

describe("api", function() {
    it("should export 'fake-server/' as fakeServer", function() {
        var expected = require("./fake-server");
        var actual = api.fakeServer;

        assert.equals(actual, expected);
    });

    it("should export 'fake-server/fake-server-with-clock' as fakeServerWithClock", function() {
        var expected = require("./fake-server/fake-server-with-clock");
        var actual = api.fakeServerWithClock;

        assert.equals(actual, expected);
    });

    it("should export 'fake-xhr/' as fakeXhr", function() {
        var expected = require("./fake-xhr");
        var actual = api.fakeXhr;

        assert.equals(actual, expected);
    });
});
