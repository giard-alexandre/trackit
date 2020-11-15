/* eslint-disable
	@typescript-eslint/restrict-template-expressions,
	@typescript-eslint/no-unsafe-member-access,
	@typescript-eslint/no-unsafe-assignment,
	@typescript-eslint/no-unsafe-return,
	@typescript-eslint/no-unsafe-call,
	node/no-callback-literal
*/
// TODO: Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import * as fs from "fs";
import { A1Client } from "../src/a1";
import { STATUS_TYPES } from "../src/shipper";

const handleError = (e: any) => {
  if (e) {
    throw new Error("This should never have been reached");
  }
};

describe("a1 client", () => {
  let _a1Client: A1Client;

  beforeAll(() => (_a1Client = new A1Client({})));

  describe("integration tests", () => {
    describe("in transit package", () => {
      let _package = null;

      beforeAll((done) =>
        fs.readFile("test/stub_data/a1_shipping.xml", "utf8", (err, xmlDoc) => {
          handleError(err);
          _a1Client
            .presentResponse(xmlDoc)
            .then(({ err, presentedResponse }) => {
              expect(err).toBeFalsy();
              _package = presentedResponse;
              return done();
            }, handleError);
        })
      );

      it("has a status of en-route", () =>
        expect(_package.status).toBe(STATUS_TYPES.EN_ROUTE));

      it("has a destination of Chicago, IL", () =>
        expect(_package.destination).toBe("Chicago, IL 60607"));

      it("has an eta of July 13th", () =>
        expect(_package.eta).toEqual(new Date("2015-07-13T00:00:00.000Z")));

      it("has 1 activity", () => expect(_package.activities).toHaveLength(1));

      it("has first activity with timestamp, location and details", () => {
        const act = _package.activities[0];
        expect(act.timestamp).toEqual(new Date("2015-07-10T15:10:00.000Z"));
        expect(act.datetime).toBe("2015-07-10T10:10:00");
        expect(act.details).toBe(
          "Shipment has left seller facility and is in transit"
        );
        expect(act.location).toBe("Whitestown, IN 46075");
      });
    });

    describe("delivered package", () => {
      let _package = null;

      beforeAll((done) =>
        fs.readFile(
          "test/stub_data/a1_delivered.xml",
          "utf8",
          (err, xmlDoc) => {
            expect(err).toBeFalsy();
            _a1Client
              .presentResponse(xmlDoc)
              .then(({ err, presentedResponse }) => {
                expect(err).toBeFalsy();
                _package = presentedResponse;
                return done();
              }, handleError);
          }
        )
      );

      it("has a status of delivered", () =>
        expect(_package.status).toBe(STATUS_TYPES.DELIVERED));

      it("has a destination of Chicago, IL", () =>
        expect(_package.destination).toBe("Chicago, IL 60634"));

      it("has an eta of October 7th", () =>
        expect(_package.eta).toEqual(new Date("2013-10-07T00:00:00.000Z")));

      it("has 5 activities", () => expect(_package.activities).toHaveLength(5));

      it("has first activity with timestamp, location and details", () => {
        const act = _package.activities[0];
        expect(act.timestamp).toEqual(new Date("2013-10-08T18:29:00.000Z"));
        expect(act.datetime).toBe("2013-10-08T13:29:00");
        expect(act.details).toBe("Delivered");
        expect(act.location).toBe("Chicago, IL 60634");
      });
    });

    describe("package error", () => {
      let _package = null;
      let _err = null;

      beforeAll((done) =>
        fs.readFile("test/stub_data/a1_error.xml", "utf8", (err, xmlDoc) => {
          handleError(err);
          _a1Client
            .presentResponse(xmlDoc)
            .then(({ err, presentedResponse }) => {
              _package = presentedResponse;
              _err = err;
              return done();
            }, handleError);
        })
      );

      it("complains about an invalid tracking number", () =>
        expect(_err).toEqual(
          new Error(
            "No data exists in the carrier's system for the given tracking number"
          )
        ));
    });
  });
});
