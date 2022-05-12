"use strict";

var assert = require("@sinonjs/referee").assert;
var proxyquire = require("proxyquire").noCallThru();
var sinon = require("sinon");

describe("log", function() {
    beforeEach(function() {
        this.fakeInspect = sinon.fake.returns(
            "a953421f-d933-4a20-87df-c4b3016177f3"
        );

        this.logFn = proxyquire("./log", {
            util: {
                inspect: this.fakeInspect
            }
        });
    });

    context("when this.logger is defined", function() {
        beforeEach(function() {
            this.request = {};
            this.response = {};

            this.instance = {
                logger: sinon.fake()
            };

            this.logFn.call(this.instance, this.request, this.response);
        });

        it("calls this.logger with a string", function() {
            assert.isTrue(this.instance.logger.calledOnce);
            assert.isString(this.instance.logger.args[0][0]);
        });

        it("formats the request argument", function() {
            assert.isTrue(this.fakeInspect.calledWith(this.request));
        });

        it("uses the formatted request argument", function() {
            assert.isTrue(
                this.instance.logger.args[0][0].includes(
                    this.fakeInspect.returnValues[0]
                )
            );
        });

        it("formats the response argument", function() {
            assert.isTrue(this.fakeInspect.calledWith(this.response));
        });

        it("uses the formatted response argument", function() {
            assert.isTrue(
                this.instance.logger.args[0][0].includes(
                    this.fakeInspect.returnValues[1]
                )
            );
        });
    });
});
