"use strict";

var JSDOM = require("jsdom").JSDOM;
var referee = require("@sinonjs/referee");
var setupDOM = require("jsdom-global");
var sinon = require("sinon");

var fakeServerWithClock = require("./fake-server-with-clock");
var sinonFakeServer = require("./index");

var FakeTimers = require("@sinonjs/fake-timers");
var FakeXMLHttpRequest = require("../fake-xhr").FakeXMLHttpRequest;

var JSDOMParser;
if (JSDOM) {
    JSDOMParser = new JSDOM().window.DOMParser;
}

var assert = referee.assert;
var refute = referee.refute;

var globalSetTimeout = setTimeout;

describe("fakeServerWithClock", function() {
    beforeEach(function() {
        if (JSDOMParser) {
            global.DOMParser = JSDOMParser;
            this.cleanupDOM = setupDOM();
        }
    });

    afterEach(function() {
        if (JSDOMParser) {
            delete global.DOMParser;
            this.cleanupDOM();
        }
    });

    describe("without pre-existing fake clock", function() {
        beforeEach(function() {
            this.server = fakeServerWithClock.create();
        });

        afterEach(function() {
            this.server.restore();
            if (this.clock) {
                this.clock.uninstall();
            }
        });

        it("calls 'super' when adding requests", function() {
            var sandbox = sinon.createSandbox();
            var addRequest = sandbox.stub(sinonFakeServer, "addRequest");
            var xhr = {};
            this.server.addRequest(xhr);

            assert(addRequest.calledWith(xhr));
            assert(addRequest.calledOn(this.server));
            sandbox.restore();
        });

        it("sets reference to clock when adding async request", function() {
            this.server.addRequest({ async: true });

            assert.isObject(this.server.clock);
            assert.isFunction(this.server.clock.tick);
        });

        it("sets longest timeout from setTimeout", function() {
            this.server.addRequest({ async: true });

            // eslint-disable-next-line no-empty-function
            setTimeout(function() {}, 12);
            // eslint-disable-next-line no-empty-function
            setTimeout(function() {}, 29);
            // eslint-disable-next-line no-empty-function
            setInterval(function() {}, 12);
            // eslint-disable-next-line no-empty-function
            setTimeout(function() {}, 27);

            assert.equals(this.server.longestTimeout, 29);
        });

        it("sets longest timeout from setInterval", function() {
            this.server.addRequest({ async: true });

            // eslint-disable-next-line no-empty-function
            setTimeout(function() {}, 12);
            // eslint-disable-next-line no-empty-function
            setTimeout(function() {}, 29);
            // eslint-disable-next-line no-empty-function
            setInterval(function() {}, 132);
            // eslint-disable-next-line no-empty-function
            setTimeout(function() {}, 27);

            assert.equals(this.server.longestTimeout, 132);
        });

        it("resets clock", function() {
            this.server.addRequest({ async: true });

            this.server.respond("");
            assert.same(setTimeout, globalSetTimeout);
        });

        it("does not reset clock second time", function() {
            this.server.addRequest({ async: true });
            this.server.respond("");
            this.clock = FakeTimers.install();
            this.server.addRequest({ async: true });
            this.server.respond("");

            refute.same(setTimeout, globalSetTimeout);
        });
    });

    describe("existing clock", function() {
        beforeEach(function() {
            this.clock = FakeTimers.install();
            this.server = fakeServerWithClock.create();
        });

        afterEach(function() {
            this.clock.uninstall();
            this.server.restore();
        });

        it("uses existing clock", function() {
            this.server.addRequest({ async: true });

            assert.same(this.server.clock, this.clock);
        });

        it("records longest timeout using setTimeout and existing clock", function() {
            this.server.addRequest({ async: true });

            // eslint-disable-next-line no-empty-function
            setInterval(function() {}, 42);
            // eslint-disable-next-line no-empty-function
            setTimeout(function() {}, 23);
            // eslint-disable-next-line no-empty-function
            setTimeout(function() {}, 53);
            // eslint-disable-next-line no-empty-function
            setInterval(function() {}, 12);

            assert.same(this.server.longestTimeout, 53);
        });

        it("records longest timeout using setInterval and existing clock", function() {
            this.server.addRequest({ async: true });

            // eslint-disable-next-line no-empty-function
            setInterval(function() {}, 92);
            // eslint-disable-next-line no-empty-function
            setTimeout(function() {}, 73);
            // eslint-disable-next-line no-empty-function
            setTimeout(function() {}, 53);
            // eslint-disable-next-line no-empty-function
            setInterval(function() {}, 12);

            assert.same(this.server.longestTimeout, 92);
        });

        it("does not reset clock", function() {
            this.server.respond("");

            assert.same(setTimeout.clock, this.clock);
        });
    });

    describe(".respond", function() {
        var sandbox;

        beforeEach(function() {
            this.server = fakeServerWithClock.create();
            this.server.addRequest({ async: true });
        });

        afterEach(function() {
            this.server.restore();
            if (sandbox) {
                sandbox.restore();
                sandbox = null;
            }
        });

        it("ticks the clock to fire the longest timeout", function() {
            this.server.longestTimeout = 96;

            this.server.respond();

            assert.equals(this.server.clock.now, 96);
        });

        it("ticks the clock to fire the longest timeout when multiple responds", function() {
            // eslint-disable-next-line no-empty-function
            setInterval(function() {}, 13);
            this.server.respond();
            var xhr = new FakeXMLHttpRequest();
            // please the linter, we can't have unused variables
            // even when we're instantiating FakeXMLHttpRequest for its side effects
            assert(xhr);
            // eslint-disable-next-line no-empty-function
            setInterval(function() {}, 17);
            this.server.respond();

            assert.equals(this.server.clock.now, 17);
        });

        it("resets longest timeout", function() {
            this.server.longestTimeout = 96;

            this.server.respond();

            assert.equals(this.server.longestTimeout, 0);
        });

        it("calls original respond", function() {
            sandbox = sinon.createSandbox();
            var obj = {};
            var respond = sandbox.stub(sinonFakeServer, "respond").returns(obj);

            var result = this.server.respond("GET", "/", "");

            assert.equals(result, obj);
            assert(respond.calledWith("GET", "/", ""));
            assert(respond.calledOn(this.server));
        });

        it("does not trigger a timeout event", function() {
            sandbox = sinon.createSandbox();

            var xhr = new FakeXMLHttpRequest();
            xhr.open("GET", "/");
            xhr.timeout = 1;
            xhr.triggerTimeout = sandbox.spy();
            xhr.send();

            this.server.respond();

            assert.isFalse(xhr.triggerTimeout.called);
        });
    });

    describe("jQuery compat mode", function() {
        beforeEach(function() {
            this.server = fakeServerWithClock.create();

            this.request = new FakeXMLHttpRequest();
            this.request.open("get", "/", true);
            this.request.send();
            sinon.spy(this.request, "respond");
        });

        afterEach(function() {
            this.server.restore();
        });

        it("handles clock automatically", function() {
            this.server.respondWith("OK");
            var spy = sinon.spy();

            setTimeout(spy, 13);
            this.server.respond();
            this.server.restore();

            assert(spy.called);
            assert.same(setTimeout, globalSetTimeout);
        });

        it("finishes xhr from setInterval like jQuery 1.3.x does", function() {
            this.server.respondWith("Hello World");
            var xhr = new FakeXMLHttpRequest();
            xhr.open("GET", "/");
            xhr.send();

            var spy = sinon.spy();

            setInterval(function() {
                spy(xhr.responseText, xhr.statusText, xhr);
            }, 13);

            this.server.respond();

            assert.equals(spy.args[0][0], "Hello World");
            assert.equals(spy.args[0][1], "OK");
            assert.equals(spy.args[0][2].status, 200);
        });
    });
});
