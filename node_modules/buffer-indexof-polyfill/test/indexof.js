"use strict";

var expect = require("chai").expect;
var initBuffer = require("../init-buffer");

require("../index.js");

describe("Buffer#indexOf", function () {

    it("Buffer as value", function () {
        var buffer = initBuffer("ABC");

        expect(buffer.indexOf(initBuffer("ABC"))).to.be.equal(0);
        expect(buffer.indexOf(initBuffer("AB"))).to.be.equal(0);
        expect(buffer.indexOf(initBuffer("BC"))).to.be.equal(1);
        expect(buffer.indexOf(initBuffer("C"))).to.be.equal(2);
        expect(buffer.indexOf(initBuffer("CC"))).to.be.equal(-1);
        expect(buffer.indexOf(initBuffer("CA"))).to.be.equal(-1);

        expect(buffer.indexOf(initBuffer("ABC"), 1)).to.be.equal(-1);
        expect(buffer.indexOf(initBuffer("AB"), 1)).to.be.equal(-1);
        expect(buffer.indexOf(initBuffer("BC"), 1)).to.be.equal(1);
        expect(buffer.indexOf(initBuffer("C"), 1)).to.be.equal(2);
        expect(buffer.indexOf(initBuffer("CC"), 1)).to.be.equal(-1);
        expect(buffer.indexOf(initBuffer("CA"), 1)).to.be.equal(-1);
    });

    it("String as value", function () {
        var buffer = initBuffer("ABC");
        expect(buffer.indexOf("ABC")).to.be.equal(0);
        expect(buffer.indexOf("AB")).to.be.equal(0);
        expect(buffer.indexOf("BC")).to.be.equal(1);
        expect(buffer.indexOf("C")).to.be.equal(2);
        expect(buffer.indexOf("CC")).to.be.equal(-1);
        expect(buffer.indexOf("CA")).to.be.equal(-1);

        expect(buffer.indexOf("ABC", 1)).to.be.equal(-1);
        expect(buffer.indexOf("AB", 1)).to.be.equal(-1);
        expect(buffer.indexOf("BC", 1)).to.be.equal(1);
        expect(buffer.indexOf("C", 1)).to.be.equal(2);
        expect(buffer.indexOf("CC", 1)).to.be.equal(-1);
        expect(buffer.indexOf("CA", 1)).to.be.equal(-1);
    });

    it("Number as value", function () {
        var buffer = initBuffer([ 1, 2, 3 ]);
        expect(buffer.indexOf(1)).to.be.equal(0);
        expect(buffer.indexOf(2)).to.be.equal(1);
        expect(buffer.indexOf(3)).to.be.equal(2);
        expect(buffer.indexOf(4)).to.be.equal(-1);

        expect(buffer.indexOf(1, 1)).to.be.equal(-1);
        expect(buffer.indexOf(2, 1)).to.be.equal(1);
        expect(buffer.indexOf(3, 1)).to.be.equal(2);
        expect(buffer.indexOf(4, 1)).to.be.equal(-1);
    });
});

describe("Buffer#lastIndexOf", function () {

    it("Buffer as value", function () {
        var buffer = initBuffer("ABCABC");

        expect(buffer.lastIndexOf(initBuffer("ABC"))).to.be.equal(3);
        expect(buffer.lastIndexOf(initBuffer("AB"))).to.be.equal(3);
        expect(buffer.lastIndexOf(initBuffer("BC"))).to.be.equal(4);
        expect(buffer.lastIndexOf(initBuffer("C"))).to.be.equal(5);
        expect(buffer.lastIndexOf(initBuffer("CC"))).to.be.equal(-1);
        expect(buffer.lastIndexOf(initBuffer("CA"))).to.be.equal(2);

        expect(buffer.lastIndexOf(initBuffer("ABC"), 1)).to.be.equal(0);
        expect(buffer.lastIndexOf(initBuffer("AB"), 1)).to.be.equal(0);
        expect(buffer.lastIndexOf(initBuffer("BC"), 1)).to.be.equal(1);
        expect(buffer.lastIndexOf(initBuffer("C"), 1)).to.be.equal(-1);
        expect(buffer.lastIndexOf(initBuffer("CC"), 1)).to.be.equal(-1);
        expect(buffer.lastIndexOf(initBuffer("CA"), 1)).to.be.equal(-1);
    });

    it("String as value", function () {
        var buffer = initBuffer("ABCABC");

        expect(buffer.lastIndexOf("ABC")).to.be.equal(3);
        expect(buffer.lastIndexOf("AB")).to.be.equal(3);
        expect(buffer.lastIndexOf("BC")).to.be.equal(4);
        expect(buffer.lastIndexOf("C")).to.be.equal(5);
        expect(buffer.lastIndexOf("CC")).to.be.equal(-1);
        expect(buffer.lastIndexOf("CA")).to.be.equal(2);

        expect(buffer.lastIndexOf("ABC", 1)).to.be.equal(0);
        expect(buffer.lastIndexOf("AB", 1)).to.be.equal(0);
        expect(buffer.lastIndexOf("BC", 1)).to.be.equal(1);
        expect(buffer.lastIndexOf("C", 1)).to.be.equal(-1);
        expect(buffer.lastIndexOf("CC", 1)).to.be.equal(-1);
        expect(buffer.lastIndexOf("CA", 1)).to.be.equal(-1);

        // make sure it works predictable
        buffer = buffer.toString();

        expect(buffer.lastIndexOf("ABC")).to.be.equal(3);
        expect(buffer.lastIndexOf("AB")).to.be.equal(3);
        expect(buffer.lastIndexOf("BC")).to.be.equal(4);
        expect(buffer.lastIndexOf("C")).to.be.equal(5);
        expect(buffer.lastIndexOf("CC")).to.be.equal(-1);
        expect(buffer.lastIndexOf("CA")).to.be.equal(2);

        expect(buffer.lastIndexOf("ABC", 1)).to.be.equal(0);
        expect(buffer.lastIndexOf("AB", 1)).to.be.equal(0);
        expect(buffer.lastIndexOf("BC", 1)).to.be.equal(1);
        expect(buffer.lastIndexOf("C", 1)).to.be.equal(-1);
        expect(buffer.lastIndexOf("CC", 1)).to.be.equal(-1);
        expect(buffer.lastIndexOf("CA", 1)).to.be.equal(-1);

    });

    it("Number as value", function () {
        var buffer = initBuffer([ 1, 2, 3, 1, 2, 3]);

        expect(buffer.lastIndexOf(1)).to.be.equal(3);
        expect(buffer.lastIndexOf(2)).to.be.equal(4);
        expect(buffer.lastIndexOf(3)).to.be.equal(5);
        expect(buffer.lastIndexOf(4)).to.be.equal(-1);

        expect(buffer.lastIndexOf(1, 1)).to.be.equal(0);
        expect(buffer.lastIndexOf(2, 1)).to.be.equal(1);
        expect(buffer.lastIndexOf(3, 1)).to.be.equal(-1);
        expect(buffer.lastIndexOf(4, 1)).to.be.equal(-1);
    });
});
