"use strict";

var assert = require("@sinonjs/referee").assert;
var refute = require("@sinonjs/referee").refute;
var sinon = require("sinon");

var configureLogError = require("./index");

describe("configureLogger", function() {
    beforeEach(function() {
        this.sandbox = sinon.createSandbox();
        this.timeOutStub = this.sandbox.stub();
    });

    afterEach(function() {
        this.sandbox.restore();
    });

    it("is a function", function() {
        var instance = configureLogError();
        assert.isFunction(instance);
    });

    it("calls config.logger function with a String", function() {
        var spy = this.sandbox.spy();
        var logError = configureLogError({
            logger: spy,
            setTimeout: this.timeOutStub,
            useImmediateExceptions: false
        });
        var name = "Quisque consequat, elit id suscipit.";
        var message =
            "Pellentesque gravida orci in tellus tristique, ac commodo nibh congue.";
        var error = new Error();

        error.name = name;
        error.message = message;

        logError("a label", error);

        assert(spy.called);
        assert(spy.calledWithMatch(name));
        assert(spy.calledWithMatch(message));
    });

    it("calls config.logger function with a stack", function() {
        var spy = this.sandbox.spy();
        var logError = configureLogError({
            logger: spy,
            setTimeout: this.timeOutStub,
            useImmediateExceptions: false
        });
        var stack =
            "Integer rutrum dictum elit, posuere accumsan nisi pretium vel. Phasellus adipiscing.";
        var error = new Error();

        error.stack = stack;

        logError("another label", error);

        assert(spy.called);
        assert(spy.calledWithMatch(stack));
    });

    it("should call config.setTimeout", function() {
        var logError = configureLogError({
            setTimeout: this.timeOutStub,
            useImmediateExceptions: false
        });
        var error = new Error();

        logError("some wonky label", error);

        assert(this.timeOutStub.calledOnce);
    });

    it("should pass a throwing function to config.setTimeout", function() {
        var logError = configureLogError({
            setTimeout: this.timeOutStub,
            useImmediateExceptions: false
        });
        var error = new Error();

        logError("async error", error);

        var func = this.timeOutStub.args[0][0];
        assert.exception(func);
    });

    describe("config.useImmediateExceptions", function() {
        beforeEach(function() {
            this.sandbox = sinon.createSandbox();
            this.timeOutStub = this.sandbox.stub();
        });

        afterEach(function() {
            this.sandbox.restore();
        });

        it("throws the logged error immediately, does not call logError.setTimeout when flag is true", function() {
            var error = new Error();
            var logError = configureLogError({
                setTimeout: this.timeOutStub,
                useImmediateExceptions: true
            });

            assert.exception(function() {
                logError("an error", error);
            });
            assert(this.timeOutStub.notCalled);
        });

        it("does not throw logged error immediately and calls logError.setTimeout when flag is false", function() {
            var error = new Error();
            var logError = configureLogError({
                setTimeout: this.timeOutStub,
                useImmediateExceptions: false
            });

            refute.exception(function() {
                logError("an error", error);
            });
            assert(this.timeOutStub.called);
        });
    });

    describe("#835", function() {
        it("logError() throws an exception if the passed err is read-only", function() {
            var logError = configureLogError({ useImmediateExceptions: true });

            // passes
            var err = {
                name: "TestError",
                message: "this is a proper exception"
            };
            assert.exception(
                function() {
                    logError("#835 test", err);
                },
                {
                    name: err.name
                }
            );

            // fails until this issue is fixed
            assert.exception(
                function() {
                    logError(
                        "#835 test",
                        "this literal string is not a proper exception"
                    );
                },
                {
                    name: "#835 test"
                }
            );
        });
    });
});
