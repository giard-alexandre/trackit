import { addDays, getDate, getYear, set, setDay } from "date-fns";
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import fs from "fs";
import moment from "moment-timezone";
import { AmazonClient, IAmazonRequestOptions } from "../src/amazon";
import { IActivity, ITrackitResponseData, STATUS_TYPES } from "../src/shipper";

const handleError = (e: any) => {
  if (e) {
    throw new Error("This should never have been reached");
  }
};

describe("amazon client", () => {
  let _amazonClient: AmazonClient;

  beforeAll(() => (_amazonClient = new AmazonClient({})));

  describe("integration tests", () => {
    let _package: ITrackitResponseData<IAmazonRequestOptions> = null;

    describe("detects eta", () => {
      it("for delivery tomorrow", (done) =>
        fs.readFile("test/stub_data/amazon_intransit.html", "utf8", (err, docs) => {
          handleError(err);
          _amazonClient.presentResponse(docs).then(({ err: pkgError, data: pkg }) => {
            expect(getDate(pkg.eta)).toEqual(getDate(addDays(new Date(), 1)));
            done();
          }, handleError);
        }));

      it("for delivery today", (done) =>
        fs.readFile("test/stub_data/amazon_today.html", "utf8", (err, docs) => {
          handleError(err);
          _amazonClient.presentResponse(docs).then(({ err: pgkErr, data: pkg }) => {
            expect(getDate(pkg.eta)).toEqual(getDate(new Date()));
            done();
          }, handleError);
        }));

      it("for delivery in a date range", (done) =>
        fs.readFile("test/stub_data/amazon_date_range.html", "utf8", (err, docs) => {
          handleError(err);
          _amazonClient.presentResponse(docs).then(({ err: pgkErr, data: pkg }) => {
            const year = getYear(new Date());
            const expected = set(new Date(year, 9, 30), {
              hours: 20,
              minutes: 0,
              seconds: 0,
              milliseconds: 0,
            });
            expect(pkg.eta).toEqual(expected);
            done();
          }, handleError);
        }));

      it("for delayed delivery in a date range", (done) =>
        fs.readFile("test/stub_data/amazon_delayed.html", "utf8", (err, docs) => {
          handleError(err);
          _amazonClient.presentResponse(docs).then(({ err: pgkErr, data: pkg }) => {
            const year = getYear(new Date());
            const expected = new Date(year, 9, 24, 20, 0, 0, 0);
            expect(pkg.eta).toEqual(expected);
            done();
          }, handleError);
        }));

      it("for delivery in a day-of-week range", (done) =>
        fs.readFile("test/stub_data/amazon_wednesday.html", "utf8", (err, docs) => {
          handleError(err);
          _amazonClient.presentResponse(docs).then(({ err: pgkErr, data: pkg }) => {
            let arrivalDay = set(new Date(), {
              hours: 20,
              minutes: 0,
              seconds: 0,
              milliseconds: 0,
            });
            arrivalDay = setDay(arrivalDay, 3);
            expect(pkg.eta).toEqual(arrivalDay);
            done();
          }, handleError);
        }));
    });

    describe("in transit", () => {
      beforeAll((done) =>
        fs.readFile("test/stub_data/amazon_intransit.html", "utf8", (err, docs) => {
          handleError(err);
          _amazonClient.presentResponse(docs).then(({ err: pgkErr, data: resp }) => {
            expect(pgkErr).toBeFalsy();
            _package = resp;
            done();
          }, handleError);
        })
      );

      it("has a status of en-route", () => expect(_package.status).toBe(STATUS_TYPES.EN_ROUTE));

      describe("has an activity", () => {
        let _activity: IActivity = null;

        beforeAll(() => (_activity = _package.activities[0]));

        it("with a timestamp", () =>
          expect(_activity.timestamp).toEqual(new Date(`${moment().year()}-10-16T07:13:00Z`)));

        it("with details", () => expect(_activity.details).toBe("Shipment arrived at Amazon facility"));

        it("with location", () => expect(_activity.location).toBe("Avenel, NJ US"));
      });

      describe("has another activity", () => {
        let _activity: IActivity = null;

        beforeAll(() => (_activity = _package.activities[1]));

        it("with a timestamp", () =>
          expect(_activity.timestamp).toEqual(new Date(`${moment().year()}-10-15T00:00:00Z`)));

        it("with details", () =>
          expect(_activity.details).toBe("Package has left seller facility and is in transit to carrier"));

        it("with no location", () => expect(_activity.location).toBe(""));
      });
    });
  });
});
