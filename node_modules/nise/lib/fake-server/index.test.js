"use strict";

var referee = require("@sinonjs/referee");
var setupDOM = require("jsdom-global");
var JSDOM = require("jsdom").JSDOM;
var sinon = require("sinon");
var sinonFakeServer = require("./index");
var fakeXhr = require("../fake-xhr/");
var FakeXMLHttpRequest = fakeXhr.FakeXMLHttpRequest;

var JSDOMParser;
if (JSDOM) {
    JSDOMParser = new JSDOM().window.DOMParser;
}

var assert = referee.assert;
var refute = referee.refute;

var supportsArrayBuffer = typeof ArrayBuffer !== "undefined";

describe("sinonFakeServer", function() {
    beforeEach(function() {
        if (JSDOMParser) {
            global.DOMParser = JSDOMParser;
            this.cleanupDOM = setupDOM();
        }
    });

    afterEach(function() {
        if (this.server) {
            this.server.restore();
        }

        if (JSDOMParser) {
            delete global.DOMParser;
            this.cleanupDOM();
        }
    });

    it("provides restore method", function() {
        this.server = sinonFakeServer.create();

        assert.isFunction(this.server.restore);
    });

    describe(".create", function() {
        it("allows the 'autoRespond' setting", function() {
            var server = sinonFakeServer.create({
                autoRespond: true
            });
            assert(
                server.autoRespond,
                "fakeServer.create should accept 'autoRespond' setting"
            );
        });
        it("allows the 'autoRespondAfter' setting", function() {
            var server = sinonFakeServer.create({
                autoRespondAfter: 500
            });
            assert.equals(
                server.autoRespondAfter,
                500,
                "fakeServer.create should accept 'autoRespondAfter' setting"
            );
        });
        it("allows the 'respondImmediately' setting", function() {
            var server = sinonFakeServer.create({
                respondImmediately: true
            });
            assert(
                server.respondImmediately,
                "fakeServer.create should accept 'respondImmediately' setting"
            );
        });
        it("allows the 'fakeHTTPMethods' setting", function() {
            var server = sinonFakeServer.create({
                fakeHTTPMethods: true
            });
            assert(
                server.fakeHTTPMethods,
                "fakeServer.create should accept 'fakeHTTPMethods' setting"
            );
        });
        it("allows the 'unsafeHeadersEnabled' setting", function() {
            var server = sinon.fakeServer.create({
                unsafeHeadersEnabled: false
            });
            refute.isUndefined(
                server.unsafeHeadersEnabled,
                "'unsafeHeadersEnabled' expected to be defined at server level"
            );
            assert(
                !server.unsafeHeadersEnabled,
                "fakeServer.create should accept 'unsafeHeadersEnabled' setting"
            );
        });
        it("does not assign a non-allowlisted setting", function() {
            var server = sinonFakeServer.create({
                foo: true
            });
            refute(
                server.foo,
                "fakeServer.create should not accept 'foo' settings"
            );
        });
    });

    it("fakes XMLHttpRequest", function() {
        var sandbox = sinon.createSandbox();
        sandbox.stub(fakeXhr, "useFakeXMLHttpRequest").returns({
            restore: sinon.stub()
        });

        this.server = sinonFakeServer.create();

        assert(fakeXhr.useFakeXMLHttpRequest.called);
        sandbox.restore();
    });

    it("mirrors FakeXMLHttpRequest restore method", function() {
        var sandbox = sinon.createSandbox();
        this.server = sinonFakeServer.create();
        var restore = sandbox.stub(FakeXMLHttpRequest, "restore");
        this.server.restore();

        assert(restore.called);
        sandbox.restore();
    });

    describe(".requests", function() {
        beforeEach(function() {
            this.server = sinonFakeServer.create();
        });

        afterEach(function() {
            this.server.restore();
        });

        it("collects objects created with fake XHR", function() {
            var xhrs = [new FakeXMLHttpRequest(), new FakeXMLHttpRequest()];

            assert.equals(this.server.requests, xhrs);
        });

        it("collects xhr objects through addRequest", function() {
            this.server.addRequest = sinon.spy();
            var xhr = new FakeXMLHttpRequest();

            assert(this.server.addRequest.calledWith(xhr));
        });

        it("observes onSend on requests", function() {
            var xhrs = [new FakeXMLHttpRequest(), new FakeXMLHttpRequest()];

            assert.isFunction(xhrs[0].onSend);
            assert.isFunction(xhrs[1].onSend);
        });

        it("onSend should call handleRequest with request object", function() {
            var xhr = new FakeXMLHttpRequest();
            xhr.open("GET", "/");
            sinon.spy(this.server, "handleRequest");

            xhr.send();

            assert(this.server.handleRequest.called);
            assert(this.server.handleRequest.calledWith(xhr));
        });
    });

    describe(".handleRequest", function() {
        beforeEach(function() {
            this.server = sinonFakeServer.create();
        });

        afterEach(function() {
            this.server.restore();
        });

        it("responds to synchronous requests", function() {
            var xhr = new FakeXMLHttpRequest();
            xhr.open("GET", "/", false);
            sinon.spy(xhr, "respond");

            xhr.send();

            assert(xhr.respond.called);
        });

        it("does not respond to async requests", function() {
            var xhr = new FakeXMLHttpRequest();
            xhr.open("GET", "/", true);
            sinon.spy(xhr, "respond");

            xhr.send();

            assert.isFalse(xhr.respond.called);
        });
    });

    describe(".respondWith", function() {
        beforeEach(function() {
            this.sandbox = sinon.createSandbox();

            this.server = sinonFakeServer.create({
                setTimeout: this.sandbox.spy(),
                useImmediateExceptions: false
            });

            this.getRootAsync = new FakeXMLHttpRequest();
            this.getRootAsync.open("GET", "/", true);
            this.getRootAsync.send();
            sinon.spy(this.getRootAsync, "respond");

            this.getRootAsyncArrayBuffer = new FakeXMLHttpRequest();
            this.getRootAsyncArrayBuffer.responseType = "arraybuffer";
            this.getRootAsyncArrayBuffer.open("GET", "/", true);
            this.getRootAsyncArrayBuffer.send();
            sinon.spy(this.getRootAsyncArrayBuffer, "respond");

            this.postRootAsync = new FakeXMLHttpRequest();
            this.postRootAsync.open("POST", "/", true);
            this.postRootAsync.send();
            sinon.spy(this.postRootAsync, "respond");

            this.getRootSync = new FakeXMLHttpRequest();
            this.getRootSync.open("GET", "/", false);

            this.getPathAsync = new FakeXMLHttpRequest();
            this.getPathAsync.open("GET", "/path", true);
            this.getPathAsync.send();
            sinon.spy(this.getPathAsync, "respond");

            this.postPathAsync = new FakeXMLHttpRequest();
            this.postPathAsync.open("POST", "/path", true);
            this.postPathAsync.send();
            sinon.spy(this.postPathAsync, "respond");
        });

        afterEach(function() {
            this.server.restore();
            this.sandbox.restore();
        });

        it("responds to queued async text requests", function() {
            this.server.respondWith("Oh yeah! Duffman!");

            this.server.respond();

            assert(this.getRootAsync.respond.called);
            assert.equals(this.getRootAsync.respond.args[0], [
                200,
                {},
                "Oh yeah! Duffman!"
            ]);
            assert.equals(
                this.getRootAsync.readyState,
                FakeXMLHttpRequest.DONE
            );
        });

        it("responds to all queued async requests", function() {
            this.server.respondWith("Oh yeah! Duffman!");

            this.server.respond();

            assert(this.getRootAsync.respond.called);
            assert(this.getPathAsync.respond.called);
        });

        it("does not respond to requests queued after respond() (eg from callbacks)", function() {
            var xhr;
            this.getRootAsync.addEventListener("load", function() {
                xhr = new FakeXMLHttpRequest();
                xhr.open("GET", "/", true);
                xhr.send();
                sinon.spy(xhr, "respond");
            });

            this.server.respondWith("Oh yeah! Duffman!");

            this.server.respond();

            assert(this.getRootAsync.respond.called);
            assert(this.getPathAsync.respond.called);
            assert(!xhr.respond.called);

            this.server.respond();

            assert(xhr.respond.called);
        });

        it("responds with status, headers, and text body", function() {
            var headers = { "Content-Type": "X-test" };
            this.server.respondWith([201, headers, "Oh yeah!"]);

            this.server.respond();

            assert(this.getRootAsync.respond.called);
            assert.equals(this.getRootAsync.respond.args[0], [
                201,
                headers,
                "Oh yeah!"
            ]);
            assert.equals(
                this.getRootAsync.readyState,
                FakeXMLHttpRequest.DONE
            );
        });

        it("handles responding with empty queue", function() {
            delete this.server.queue;
            var server = this.server;

            refute.exception(function() {
                server.respond();
            });
        });

        it("responds to sync request with canned answers", function() {
            this.server.respondWith([210, { "X-Ops": "Yeah" }, "Body, man"]);

            this.getRootSync.send();

            assert.equals(this.getRootSync.status, 210);
            assert.equals(
                this.getRootSync.getAllResponseHeaders(),
                "X-Ops: Yeah\r\n"
            );
            assert.equals(this.getRootSync.responseText, "Body, man");
        });

        it("responds to sync request with 404 if no response is set", function() {
            this.getRootSync.send();

            assert.equals(this.getRootSync.status, 404);
            assert.equals(this.getRootSync.getAllResponseHeaders(), "");
            assert.equals(this.getRootSync.responseText, "");
        });

        it("responds to async request with 404 if no response is set", function() {
            this.server.respond();

            assert.equals(this.getRootAsync.respond.args[0], [404, {}, ""]);
        });

        it("responds to specific URL", function() {
            this.server.respondWith("/path", "Duffman likes Duff beer");

            this.server.respond();

            assert.equals(this.getRootAsync.respond.args[0], [404, {}, ""]);
            assert.equals(this.getPathAsync.respond.args[0], [
                200,
                {},
                "Duffman likes Duff beer"
            ]);
        });

        it("responds to URL matched by regexp", function() {
            this.server.respondWith(/^\/p.*/, "Regexp");

            this.server.respond();

            assert.equals(this.getPathAsync.respond.args[0], [
                200,
                {},
                "Regexp"
            ]);
        });

        it("responds to URL matched by url matcher function", function() {
            this.server.respondWith(function() {
                return true;
            }, "FuncMatcher");

            this.server.respond();

            assert.equals(this.getPathAsync.respond.args[0], [
                200,
                {},
                "FuncMatcher"
            ]);
        });

        it("does not respond to URL not matched by regexp", function() {
            this.server.respondWith(/^\/p.*/, "No regexp match");

            this.server.respond();

            assert.equals(this.getRootAsync.respond.args[0], [404, {}, ""]);
        });

        it("does not respond to URL not matched by function url matcher", function() {
            this.server.respondWith(function() {
                return false;
            }, "No function match");

            this.server.respond();

            assert.equals(this.getRootAsync.respond.args[0], [404, {}, ""]);
        });

        it("responds to all URLs matched by regexp", function() {
            this.server.respondWith(/^\/.*/, "Match all URLs");

            this.server.respond();

            assert.equals(this.getRootAsync.respond.args[0], [
                200,
                {},
                "Match all URLs"
            ]);
            assert.equals(this.getPathAsync.respond.args[0], [
                200,
                {},
                "Match all URLs"
            ]);
        });

        it("responds to all URLs matched by function matcher", function() {
            this.server.respondWith(function() {
                return true;
            }, "Match all URLs");

            this.server.respond();

            assert.equals(this.getRootAsync.respond.args[0], [
                200,
                {},
                "Match all URLs"
            ]);
            assert.equals(this.getPathAsync.respond.args[0], [
                200,
                {},
                "Match all URLs"
            ]);
        });

        it("responds to all requests when match URL is falsy", function() {
            this.server.respondWith("", "Falsy URL");

            this.server.respond();

            assert.equals(this.getRootAsync.respond.args[0], [
                200,
                {},
                "Falsy URL"
            ]);
            assert.equals(this.getPathAsync.respond.args[0], [
                200,
                {},
                "Falsy URL"
            ]);
        });

        it("responds to no requests when function matcher is falsy", function() {
            this.server.respondWith(function() {
                return false;
            }, "Falsy URL");

            this.server.respond();

            assert.equals(this.getRootAsync.respond.args[0], [404, {}, ""]);
            assert.equals(this.getPathAsync.respond.args[0], [404, {}, ""]);
        });

        it("responds to all GET requests", function() {
            this.server.respondWith("GET", "", "All GETs");

            this.server.respond();

            assert.equals(this.getRootAsync.respond.args[0], [
                200,
                {},
                "All GETs"
            ]);
            assert.equals(this.getPathAsync.respond.args[0], [
                200,
                {},
                "All GETs"
            ]);
            assert.equals(this.postRootAsync.respond.args[0], [404, {}, ""]);
            assert.equals(this.postPathAsync.respond.args[0], [404, {}, ""]);
        });

        it("responds to all 'get' requests (case-insensitivity)", function() {
            this.server.respondWith("get", "", "All GETs");

            this.server.respond();

            assert.equals(this.getRootAsync.respond.args[0], [
                200,
                {},
                "All GETs"
            ]);
            assert.equals(this.getPathAsync.respond.args[0], [
                200,
                {},
                "All GETs"
            ]);
            assert.equals(this.postRootAsync.respond.args[0], [404, {}, ""]);
            assert.equals(this.postPathAsync.respond.args[0], [404, {}, ""]);
        });

        it("responds to all PUT requests", function() {
            this.server.respondWith("PUT", "", "All PUTs");

            this.server.respond();

            assert.equals(this.getRootAsync.respond.args[0], [404, {}, ""]);
            assert.equals(this.getPathAsync.respond.args[0], [404, {}, ""]);
            assert.equals(this.postRootAsync.respond.args[0], [404, {}, ""]);
            assert.equals(this.postPathAsync.respond.args[0], [404, {}, ""]);
        });

        it("responds to all POST requests", function() {
            this.server.respondWith("POST", "", "All POSTs");

            this.server.respond();

            assert.equals(this.getRootAsync.respond.args[0], [404, {}, ""]);
            assert.equals(this.getPathAsync.respond.args[0], [404, {}, ""]);
            assert.equals(this.postRootAsync.respond.args[0], [
                200,
                {},
                "All POSTs"
            ]);
            assert.equals(this.postPathAsync.respond.args[0], [
                200,
                {},
                "All POSTs"
            ]);
        });

        it("responds to all POST requests to /path", function() {
            this.server.respondWith("POST", "/path", "All POSTs");

            this.server.respond();

            assert.equals(this.getRootAsync.respond.args[0], [404, {}, ""]);
            assert.equals(this.getPathAsync.respond.args[0], [404, {}, ""]);
            assert.equals(this.postRootAsync.respond.args[0], [404, {}, ""]);
            assert.equals(this.postPathAsync.respond.args[0], [
                200,
                {},
                "All POSTs"
            ]);
        });

        it("responds to all POST requests matching regexp", function() {
            this.server.respondWith("POST", /^\/path(\?.*)?/, "All POSTs");

            this.server.respond();

            assert.equals(this.getRootAsync.respond.args[0], [404, {}, ""]);
            assert.equals(this.getPathAsync.respond.args[0], [404, {}, ""]);
            assert.equals(this.postRootAsync.respond.args[0], [404, {}, ""]);
            assert.equals(this.postPathAsync.respond.args[0], [
                200,
                {},
                "All POSTs"
            ]);
        });

        it("does not respond to aborted requests", function() {
            this.server.respondWith("/", "That's my homepage!");
            this.getRootAsync.aborted = true;

            this.server.respond();

            assert.isFalse(this.getRootAsync.respond.called);
        });

        it("resets requests", function() {
            this.server.respondWith("/", "That's my homepage!");

            this.server.respond();

            assert.equals(this.server.queue, []);
        });

        it("notifies all requests when some throw", function() {
            this.getRootAsync.respond = function() {
                throw new Error("Oops!");
            };

            this.server.respondWith("");
            this.server.respond();

            assert.equals(this.getPathAsync.respond.args[0], [200, {}, ""]);
            assert.equals(this.postRootAsync.respond.args[0], [200, {}, ""]);
            assert.equals(this.postPathAsync.respond.args[0], [200, {}, ""]);
        });

        it("recognizes request with hostname", function() {
            // set the host value, as jsdom default is 'about:blank'
            setupDOM("", { url: "http://localhost/" });
            this.server.respondWith("/", [200, {}, "Yep"]);
            var xhr = new FakeXMLHttpRequest();
            var loc = window.location;

            xhr.open("GET", `${loc.protocol}//${loc.host}/`, true);
            xhr.send();
            sinon.spy(xhr, "respond");

            this.server.respond();

            assert.equals(xhr.respond.args[0], [200, {}, "Yep"]);
        });

        it("responds to matching paths with port number in external URL", function() {
            // setup server & client
            setupDOM("", { url: "http://localhost/" });
            var localAPI = "http://localhost:5000/ping";
            this.server.respondWith("GET", localAPI, "Pong");

            // Create fake client request
            var xhr = new FakeXMLHttpRequest();
            xhr.open("GET", localAPI, true);
            xhr.send();
            sinon.spy(xhr, "respond");

            this.server.respond();

            assert.equals(xhr.respond.args[0], [200, {}, "Pong"]);
        });

        it("responds to matching paths when port numbers are different", function() {
            // setup server & client
            setupDOM("", { url: "http://localhost:8080/" });
            var localAPI = "http://localhost:5000/ping";
            this.server.respondWith("GET", localAPI, "Pong");
            this.server.respondWith(
                "GET",
                "http://localhost:8080/ping",
                "Ding"
            );

            // Create fake client request
            var xhr = new FakeXMLHttpRequest();
            xhr.open("GET", localAPI, true);
            xhr.send();
            sinon.spy(xhr, "respond");

            this.server.respond();

            assert.equals(xhr.respond.args[0], [200, {}, "Pong"]);
        });

        it("responds although window.location is undefined", function() {
            // setup server & client
            this.cleanupDOM(); // remove window, Document, etc.
            var origin = "http://localhost";
            this.server.respondWith("GET", "/ping", "Pong");

            // Create fake client request
            var xhr = new FakeXMLHttpRequest();
            xhr.open("GET", `${origin}/ping`, true);
            xhr.send();
            sinon.spy(xhr, "respond");

            this.server.respond();

            assert.equals(xhr.respond.args[0], [200, {}, "Pong"]);
        });

        // React Native on Android places location on window.window
        it("responds as expected for React Native on Android with window.window.location", function() {
            this.cleanupDOM(); // remove default window, Document, etc.
            // setup client
            // Build Android like format (manual jsdom, with window.window inset)
            var html =
                // eslint-disable-next-line quotes
                '<!doctype html><html><head><meta charset="utf-8">' +
                "</head><body></body></html>";
            var options = {};
            var document = new JSDOM(html, options);
            var window = document.window;
            global.document = window.document;
            global.window = { window: window };
            window.console = global.console;

            // setup server
            var url = "http://localhost";
            this.server.respondWith("GET", url, "Pong");

            // Create fake client request
            var xhr = new FakeXMLHttpRequest();
            xhr.open("GET", url, true);
            xhr.send();
            sinon.spy(xhr, "respond");

            this.server.respond();

            assert.equals(xhr.respond.args[0], [200, {}, "Pong"]);
        });

        it("accepts URLS which are common route DSLs", function() {
            this.server.respondWith("/foo/*", [200, {}, "Yep"]);

            var xhr = new FakeXMLHttpRequest();
            xhr.respond = sinon.spy();
            xhr.open("GET", "/foo/bla/boo", true);
            xhr.send();

            this.server.respond();

            assert.equals(xhr.respond.args[0], [200, {}, "Yep"]);
        });

        it("yields URL capture groups to response handler when using DSLs", function() {
            var handler = sinon.spy();
            this.server.respondWith("GET", "/thing/:id", handler);

            var xhr = new FakeXMLHttpRequest();
            xhr.respond = sinon.spy();
            xhr.open("GET", "/thing/1337", true);
            xhr.send();

            this.server.respond();

            assert(handler.called);
            assert.equals(handler.args[0], [xhr, "1337"]);
        });

        it("throws understandable error if response is not a string or ArrayBuffer", function() {
            var server = this.server;

            assert.exception(
                function() {
                    server.respondWith("/", {});
                },
                {
                    message:
                        "Fake server response body should be a string or ArrayBuffer, but was object"
                }
            );
        });

        it("throws understandable error if response in array is not a string or ArrayBuffer", function() {
            var server = this.server;

            assert.exception(
                function() {
                    server.respondWith("/", [200, {}]);
                },
                {
                    message:
                        "Fake server response body should be a string or ArrayBuffer, but was undefined"
                }
            );
        });

        it("is able to pass the same args to respond directly", function() {
            this.server.respond("Oh yeah! Duffman!");

            assert.equals(this.getRootAsync.respond.args[0], [
                200,
                {},
                "Oh yeah! Duffman!"
            ]);
            assert.equals(this.getPathAsync.respond.args[0], [
                200,
                {},
                "Oh yeah! Duffman!"
            ]);
            assert.equals(this.postRootAsync.respond.args[0], [
                200,
                {},
                "Oh yeah! Duffman!"
            ]);
            assert.equals(this.postPathAsync.respond.args[0], [
                200,
                {},
                "Oh yeah! Duffman!"
            ]);
        });

        it("responds to most recently defined match", function() {
            this.server.respondWith("POST", "", "All POSTs");
            this.server.respondWith("POST", "/path", "Particular POST");

            this.server.respond();

            assert.equals(this.postRootAsync.respond.args[0], [
                200,
                {},
                "All POSTs"
            ]);
            assert.equals(this.postPathAsync.respond.args[0], [
                200,
                {},
                "Particular POST"
            ]);
        });

        if (supportsArrayBuffer) {
            it("responds to queued async arraybuffer requests", function() {
                var buffer = new Uint8Array([160, 64, 0, 0, 32, 193]).buffer;

                this.server.respondWith(buffer);

                this.server.respond();

                assert(this.getRootAsyncArrayBuffer.respond.called);
                assert.equals(this.getRootAsyncArrayBuffer.respond.args[0], [
                    200,
                    {},
                    buffer
                ]);
                assert.equals(
                    this.getRootAsyncArrayBuffer.readyState,
                    FakeXMLHttpRequest.DONE
                );
            });

            it("responds with status, headers, and arraybuffer body", function() {
                var buffer = new Uint8Array([160, 64, 0, 0, 32, 193]).buffer;

                var headers = { "Content-Type": "X-test" };
                this.server.respondWith([201, headers, buffer]);

                this.server.respond();

                assert(this.getRootAsyncArrayBuffer.respond.called);
                assert.equals(this.getRootAsyncArrayBuffer.respond.args[0], [
                    201,
                    headers,
                    buffer
                ]);
                assert.equals(
                    this.getRootAsyncArrayBuffer.readyState,
                    FakeXMLHttpRequest.DONE
                );
            });
        }
    });

    describe(".respondWith (FunctionHandler)", function() {
        beforeEach(function() {
            this.server = sinonFakeServer.create();
        });

        afterEach(function() {
            this.server.restore();
        });

        it("yields response to request function handler", function() {
            var handler = sinon.spy();
            this.server.respondWith("/hello", handler);
            var xhr = new FakeXMLHttpRequest();
            xhr.open("GET", "/hello");
            xhr.send();

            this.server.respond();

            assert(handler.calledOnce);
            assert(handler.calledWith(xhr));
        });

        it("responds to request from function handler", function() {
            this.server.respondWith("/hello", function(xhr) {
                xhr.respond(
                    200,
                    { "Content-Type": "application/json" },
                    // eslint-disable-next-line quotes
                    '{"id":42}'
                );
            });

            var request = new FakeXMLHttpRequest();
            request.open("GET", "/hello");
            request.send();

            this.server.respond();

            assert.equals(request.status, 200);
            assert.equals(request.responseHeaders, {
                "Content-Type": "application/json"
            });
            assert.equals(
                request.responseText,
                // eslint-disable-next-line quotes
                '{"id":42}'
            );
        });

        it("yields response to request function handler when method matches", function() {
            var handler = sinon.spy();
            this.server.respondWith("GET", "/hello", handler);
            var xhr = new FakeXMLHttpRequest();
            xhr.open("GET", "/hello");
            xhr.send();

            this.server.respond();

            assert(handler.calledOnce);
        });

        it("yields response to request function handler when url contains RegExp characters", function() {
            var handler = sinon.spy();
            this.server.respondWith("GET", "/hello?world", handler);
            var xhr = new FakeXMLHttpRequest();
            xhr.open("GET", "/hello?world");
            xhr.send();

            this.server.respond();

            assert(handler.calledOnce);
        });

        function equalMatcher(expected) {
            return function(test) {
                return expected === test;
            };
        }

        it("yields response to request function handler when url is a function that returns true", function() {
            var handler = sinon.spy();
            this.server.respondWith(
                "GET",
                equalMatcher("/hello?world"),
                handler
            );
            var xhr = new FakeXMLHttpRequest();
            xhr.open("GET", "/hello?world");
            xhr.send();

            this.server.respond();

            assert(handler.calledOnce);
        });

        // eslint-disable-next-line max-len
        it("yields response to request function handler when url is a function that returns true with no Http Method specified", function() {
            var handler = sinon.spy();
            this.server.respondWith(equalMatcher("/hello?world"), handler);
            var xhr = new FakeXMLHttpRequest();
            xhr.open("GET", "/hello?world");
            xhr.send();

            this.server.respond();

            assert(handler.calledOnce);
        });

        it("does not yield response to request function handler when method does not match", function() {
            var handler = sinon.spy();
            this.server.respondWith("GET", "/hello", handler);
            var xhr = new FakeXMLHttpRequest();
            xhr.open("POST", "/hello");
            xhr.send();

            this.server.respond();

            assert(!handler.called);
        });

        // eslint-disable-next-line max-len
        it("does not yield response to request function handler when method does not match (using url mather function)", function() {
            var handler = sinon.spy();
            this.server.respondWith("GET", equalMatcher("/hello"), handler);
            var xhr = new FakeXMLHttpRequest();
            xhr.open("POST", "/hello");
            xhr.send();

            this.server.respond();

            assert(!handler.called);
        });

        it("yields response to request function handler when regexp url matches", function() {
            var handler = sinon.spy();
            this.server.respondWith("GET", /\/.*/, handler);
            var xhr = new FakeXMLHttpRequest();
            xhr.open("GET", "/hello");
            xhr.send();

            this.server.respond();

            assert(handler.calledOnce);
        });

        it("does not yield response to request function handler when regexp url does not match", function() {
            var handler = sinon.spy();
            this.server.respondWith("GET", /\/a.*/, handler);
            var xhr = new FakeXMLHttpRequest();
            xhr.open("GET", "/hello");
            xhr.send();

            this.server.respond();

            assert(!handler.called);
        });

        it("does not yield response to request function handler when urlMatcher function returns false", function() {
            var handler = sinon.spy();
            this.server.respondWith("GET", equalMatcher("/goodbye"), handler);
            var xhr = new FakeXMLHttpRequest();
            xhr.open("GET", "/hello");
            xhr.send();

            this.server.respond();

            assert(!handler.called);
        });

        // eslint-disable-next-line max-len
        it("does not yield response to request function handler when urlMatcher function returns non Boolean truthy value", function() {
            var handler = sinon.spy();
            this.server.respondWith(
                "GET",
                function() {
                    return "truthy";
                },
                handler
            );
            var xhr = new FakeXMLHttpRequest();
            xhr.open("GET", "/hello");
            xhr.send();

            this.server.respond();

            assert(!handler.called);
        });

        // eslint-disable-next-line max-len
        it("does not yield response to request function handler when urlMatcher function returns non Boolean falsey value", function() {
            var handler = sinon.spy();
            this.server.respondWith(
                "GET",
                function() {
                    return undefined;
                },
                handler
            );
            var xhr = new FakeXMLHttpRequest();
            xhr.open("GET", "/hello");
            xhr.send();

            this.server.respond();

            assert(!handler.called);
        });

        it("adds function handler without method or url filter", function() {
            this.server.respondWith(function(xhr) {
                xhr.respond(
                    200,
                    { "Content-Type": "application/json" },
                    // eslint-disable-next-line quotes
                    '{"id":42}'
                );
            });

            var request = new FakeXMLHttpRequest();
            request.open("GET", "/whatever");
            request.send();

            this.server.respond();

            assert.equals(request.status, 200);
            assert.equals(request.responseHeaders, {
                "Content-Type": "application/json"
            });
            assert.equals(
                request.responseText,
                // eslint-disable-next-line quotes
                '{"id":42}'
            );
        });

        it("does not process request further if processed by function", function() {
            var handler = sinon.spy();
            this.server.respondWith("GET", "/aloha", [200, {}, "Oh hi"]);
            this.server.respondWith("GET", /\/a.*/, handler);
            var xhr = new FakeXMLHttpRequest();
            xhr.respond = sinon.spy();
            xhr.open("GET", "/aloha");
            xhr.send();

            this.server.respond();

            assert(handler.called);
            assert(xhr.respond.calledOnce);
        });

        it("yields URL capture groups to response handler", function() {
            var handler = sinon.spy();
            this.server.respondWith("GET", /\/people\/(\d+)/, handler);
            var xhr = new FakeXMLHttpRequest();
            xhr.respond = sinon.spy();
            xhr.open("GET", "/people/3");
            xhr.send();

            this.server.respond();

            assert(handler.called);
            assert.equals(handler.args[0], [xhr, "3"]);
        });
    });

    describe("respond with fake HTTP Verb", function() {
        beforeEach(function() {
            this.server = sinonFakeServer.create();

            this.request = new FakeXMLHttpRequest();
            this.request.open("post", "/path", true);
            this.request.send("_method=delete");
            sinon.spy(this.request, "respond");
        });

        afterEach(function() {
            this.server.restore();
        });

        it("does not respond to DELETE request with _method parameter", function() {
            this.server.respondWith("DELETE", "", "");

            this.server.respond();

            assert.equals(this.request.respond.args[0], [404, {}, ""]);
        });

        it("responds to 'fake' DELETE request", function() {
            this.server.fakeHTTPMethods = true;
            this.server.respondWith("DELETE", "", "OK");

            this.server.respond();

            assert.equals(this.request.respond.args[0], [200, {}, "OK"]);
        });

        it("does not respond to POST when faking DELETE", function() {
            this.server.fakeHTTPMethods = true;
            this.server.respondWith("POST", "", "OK");

            this.server.respond();

            assert.equals(this.request.respond.args[0], [404, {}, ""]);
        });

        it("does not fake method when not POSTing", function() {
            this.server.fakeHTTPMethods = true;
            this.server.respondWith("DELETE", "", "OK");

            var request = new FakeXMLHttpRequest();
            request.open("GET", "/");
            request.send();
            request.respond = sinon.spy();
            this.server.respond();

            assert.equals(request.respond.args[0], [404, {}, ""]);
        });

        it("customizes HTTP method extraction", function() {
            this.server.getHTTPMethod = function() {
                return "PUT";
            };

            this.server.respondWith("PUT", "", "OK");

            this.server.respond();

            assert.equals(this.request.respond.args[0], [200, {}, "OK"]);
        });

        it("does not fail when getting the HTTP method from a request with no body", function() {
            var server = this.server;
            server.fakeHTTPMethods = true;

            assert.equals(server.getHTTPMethod({ method: "POST" }), "POST");
        });
    });

    describe(".respondAll", function() {
        beforeEach(function() {
            this.server = sinonFakeServer.create();
        });

        afterEach(function() {
            this.server.restore();
        });

        it("performs all the pending requests", function() {
            var server = this.server;
            server.respondWith("GET", "/first/url", "first body");
            server.respondWith("GET", "/second/url", "second body");
            server.respondWith("GET", "/third/url", "third body");

            var request1 = new FakeXMLHttpRequest();
            request1.open("GET", "/first/url");
            request1.send();
            request1.respond = sinon.spy();

            var request2 = new FakeXMLHttpRequest();
            request2.open("GET", "/second/url");
            request2.send();
            request2.respond = sinon.spy();

            var request3 = new FakeXMLHttpRequest();
            request3.open("GET", "/third/url");
            request3.send();
            request3.respond = sinon.spy();

            assert.equals(server.responses.length, 3);
            assert.equals(server.requests.length, 3);
            assert.equals(server.queue.length, 3);

            assert.equals(request1.respond.args.length, 0);
            assert.equals(request2.respond.args.length, 0);
            assert.equals(request3.respond.args.length, 0);

            server.respondAll();

            assert.equals(server.queue.length, 0);
            assert.equals(server.responses.length, 3);

            assert.equals(request1.respond.args[0], [200, {}, "first body"]);
            assert.equals(request2.respond.args[0], [200, {}, "second body"]);
            assert.equals(request3.respond.args[0], [200, {}, "third body"]);
        });
    });

    describe(".autoResponse", function() {
        beforeEach(function() {
            this.get = function get(url) {
                var request = new FakeXMLHttpRequest();
                sinon.spy(request, "respond");
                request.open("get", url, true);
                request.send();
                return request;
            };

            this.server = sinonFakeServer.create();
            this.clock = sinon.useFakeTimers();
        });

        afterEach(function() {
            this.server.restore();
            this.clock.uninstall();
        });

        it("responds async automatically after 10ms", function() {
            this.server.autoRespond = true;
            var request = this.get("/path");

            this.clock.tick(10);

            assert.isTrue(request.respond.calledOnce);
        });

        it("normal server does not respond automatically", function() {
            var request = this.get("/path");

            this.clock.tick(100);

            assert.isTrue(!request.respond.called);
        });

        it("auto-responds only once", function() {
            this.server.autoRespond = true;
            var requests = [this.get("/path")];
            this.clock.tick(5);
            requests.push(this.get("/other"));
            this.clock.tick(5);

            assert.isTrue(requests[0].respond.calledOnce);
            assert.isTrue(requests[1].respond.calledOnce);
        });

        it("auto-responds after having already responded", function() {
            this.server.autoRespond = true;
            var requests = [this.get("/path")];
            this.clock.tick(10);
            requests.push(this.get("/other"));
            this.clock.tick(10);

            assert.isTrue(requests[0].respond.calledOnce);
            assert.isTrue(requests[1].respond.calledOnce);
        });

        it("sets auto-respond timeout to 50ms", function() {
            this.server.autoRespond = true;
            this.server.autoRespondAfter = 50;

            var request = this.get("/path");
            this.clock.tick(49);
            assert.isFalse(request.respond.called);

            this.clock.tick(1);
            assert.isTrue(request.respond.calledOnce);
        });

        it("auto-responds if two successive requests are made with a single XHR", function() {
            this.server.autoRespond = true;

            var request = this.get("/path");

            this.clock.tick(10);

            assert.isTrue(request.respond.calledOnce);

            request.open("get", "/other", true);
            request.send();

            this.clock.tick(10);

            assert.isTrue(request.respond.calledTwice);
        });

        it("auto-responds if timeout elapses between creating XHR object and sending request with it", function() {
            this.server.autoRespond = true;

            var request = new FakeXMLHttpRequest();
            sinon.spy(request, "respond");

            this.clock.tick(100);

            request.open("get", "/path", true);
            request.send();

            this.clock.tick(10);

            assert.isTrue(request.respond.calledOnce);
        });
    });

    describe(".respondImmediately", function() {
        beforeEach(function() {
            this.get = function get(url) {
                var request = new FakeXMLHttpRequest();
                sinon.spy(request, "respond");
                request.open("get", url, true);
                request.send();
                return request;
            };

            this.server = sinonFakeServer.create();
            this.server.respondImmediately = true;
        });

        afterEach(function() {
            this.server.restore();
        });

        it("responds synchronously", function() {
            var request = this.get("/path");
            assert.isTrue(request.respond.calledOnce);
        });

        it("doesn't rely on a clock", function() {
            this.clock = sinon.useFakeTimers();

            var request = this.get("/path");
            assert.isTrue(request.respond.calledOnce);

            this.clock.uninstall();
        });
    });

    describe(".log", function() {
        beforeEach(function() {
            this.server = sinonFakeServer.create();
        });

        afterEach(function() {
            this.server.restore();
        });

        it("logs response and request", function() {
            sinon.spy(this.server, "log");
            var xhr = new FakeXMLHttpRequest();
            xhr.open("GET", "/hello");
            xhr.send();
            var response = [200, {}, "Hello!"];
            this.server.respond("GET", /.*/, response);
            assert(this.server.log.calledOnce);
            assert(this.server.log.calledWithExactly(response, xhr));
        });

        it("can be overridden", function() {
            this.server.log = sinon.spy();
            var xhr = new FakeXMLHttpRequest();
            xhr.open("GET", "/hello");
            xhr.send();
            var response = [200, {}, "Hello!"];
            this.server.respond("GET", /.*/, response);
            assert(this.server.log.calledOnce);
            assert(this.server.log.calledWithExactly(response, xhr));
        });
    });

    describe(".reset", function() {
        beforeEach(function() {
            this.server = sinonFakeServer.create();

            this.resetBehaviorStub = sinon.stub(this.server, "resetBehavior");
            this.resetHistoryStub = sinon.stub(this.server, "resetHistory");
        });

        afterEach(function() {
            this.server.restore();
            this.resetBehaviorStub.restore();
            this.resetHistoryStub.restore();
        });

        it("should call resetBehavior and resetHistory", function() {
            assert(this.resetBehaviorStub.notCalled);
            assert(this.resetHistoryStub.notCalled);

            this.server.reset();

            assert(this.resetBehaviorStub.calledOnce);
            assert(this.resetBehaviorStub.calledWithExactly());

            assert(this.resetHistoryStub.calledOnce);
            assert(this.resetHistoryStub.calledWithExactly());

            assert(this.resetBehaviorStub.calledBefore(this.resetHistoryStub));
        });
    });

    describe(".resetBehavior", function() {
        before(function() {
            // capture default response
            var self = this;

            sinonFakeServer.processRequest.call(
                {
                    log: function(response) {
                        self.defaultResponse = response;
                    }
                },
                // eslint-disable-next-line no-empty-function
                { respond: function() {} }
            );
        });

        function makeRequest(context) {
            context.request = new FakeXMLHttpRequest();
            context.request.open("get", "url", true);
            context.request.send(null);

            sinon.spy(context.request, "respond");
        }

        beforeEach(function() {
            this.server = sinonFakeServer.create();

            this.testResponse = [200, {}, "OK"];

            this.server.respondWith("GET", "url", this.testResponse);

            makeRequest(this);
        });

        it("should reset behavior", function() {
            this.server.resetBehavior();

            assert.equals(this.server.queue.length, 0);
            assert.equals(this.server.responses.length, 0);
        });

        it("should work as expected", function() {
            this.server.respond();

            assert.equals(this.request.respond.args[0], this.testResponse);

            this.server.resetBehavior();

            makeRequest(this);

            this.server.respond();

            assert.equals(this.request.respond.args[0], this.defaultResponse);
        });

        it("should be idempotent", function() {
            this.server.respond();

            assert.equals(this.request.respond.args[0], this.testResponse);

            // calling N times should have the same effect as calling once
            this.server.resetBehavior();
            this.server.resetBehavior();
            this.server.resetBehavior();

            makeRequest(this);

            this.server.respond();

            assert.equals(this.request.respond.args[0], this.defaultResponse);
        });
    });

    describe("history", function() {
        function assertDefaultServerState(server) {
            refute(server.requestedOnce);
            refute(server.requestedTwice);
            refute(server.requestedThrice);
            refute(server.requested);

            refute(server.firstRequest);
            refute(server.secondRequest);
            refute(server.thirdRequest);
            refute(server.lastRequest);
        }

        function makeRequest() {
            var request = new FakeXMLHttpRequest();
            request.open("get", "url", true);
            request.send(null);
        }

        beforeEach(function() {
            this.server = sinonFakeServer.create();
        });

        describe(".getRequest", function() {
            it("should handle invalid indexes", function() {
                assert.isNull(this.server.getRequest(1e3));
                assert.isNull(this.server.getRequest(0));
                assert.isNull(this.server.getRequest(-2));
                assert.isNull(this.server.getRequest("catpants"));
            });

            it("should return expected requests", function() {
                makeRequest();

                assert.equals(
                    this.server.getRequest(0),
                    this.server.requests[0]
                );
                assert.isNull(this.server.getRequest(1));

                makeRequest();

                assert.equals(
                    this.server.getRequest(1),
                    this.server.requests[1]
                );
            });
        });

        describe(".resetHistory", function() {
            it("should reset history", function() {
                makeRequest();
                makeRequest();

                assert.isTrue(this.server.requested);
                assert.isTrue(this.server.requestedTwice);

                this.server.resetHistory();

                assertDefaultServerState(this.server);
            });

            it("should be idempotent", function() {
                makeRequest();
                makeRequest();

                assert.isTrue(this.server.requested);
                assert.isTrue(this.server.requestedTwice);

                this.server.resetHistory();
                this.server.resetHistory();
                this.server.resetHistory();

                assertDefaultServerState(this.server);
            });
        });

        it("should start in a known default state", function() {
            assertDefaultServerState(this.server);
        });

        it("should record requests", function() {
            makeRequest();

            assert.isTrue(this.server.requested);
            assert.isTrue(this.server.requestedOnce);
            assert.isFalse(this.server.requestedTwice);
            assert.isFalse(this.server.requestedThrice);
            assert.equals(this.server.requestCount, 1);

            assert.equals(this.server.firstRequest, this.server.requests[0]);
            assert.equals(this.server.lastRequest, this.server.requests[0]);

            // #2
            makeRequest();

            assert.isTrue(this.server.requested);
            assert.isFalse(this.server.requestedOnce);
            assert.isTrue(this.server.requestedTwice);
            assert.isFalse(this.server.requestedThrice);
            assert.equals(this.server.requestCount, 2);

            assert.equals(this.server.firstRequest, this.server.requests[0]);
            assert.equals(this.server.secondRequest, this.server.requests[1]);
            assert.equals(this.server.lastRequest, this.server.requests[1]);

            // #3
            makeRequest();

            assert.isTrue(this.server.requested);
            assert.isFalse(this.server.requestedOnce);
            assert.isFalse(this.server.requestedTwice);
            assert.isTrue(this.server.requestedThrice);
            assert.equals(this.server.requestCount, 3);

            assert.equals(this.server.firstRequest, this.server.requests[0]);
            assert.equals(this.server.secondRequest, this.server.requests[1]);
            assert.equals(this.server.thirdRequest, this.server.requests[2]);
            assert.equals(this.server.lastRequest, this.server.requests[2]);

            // #4
            makeRequest();

            assert.isTrue(this.server.requested);
            assert.isFalse(this.server.requestedOnce);
            assert.isFalse(this.server.requestedTwice);
            assert.isFalse(this.server.requestedThrice);
            assert.equals(this.server.requestCount, 4);

            assert.equals(this.server.firstRequest, this.server.requests[0]);
            assert.equals(this.server.secondRequest, this.server.requests[1]);
            assert.equals(this.server.thirdRequest, this.server.requests[2]);
            assert.equals(this.server.lastRequest, this.server.requests[3]);
        });
    });
});
