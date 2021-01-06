import { AxiosRequestConfig } from "axios";
import fs from "fs";
import { IPrestigeRequestOptions, PrestigeClient } from "../src/prestige";
import { IActivity, ITrackitResponseData, STATUS_TYPES } from "../src/trackitClient";

const handleError = (e: unknown) => {
  if (e) {
    throw new Error("This should never have been reached");
  }
};

describe("prestige client", () => {
  let _presClient: PrestigeClient;

  beforeAll(() => (_presClient = new PrestigeClient({})));

  describe("requestOptions", () => {
    let _options: AxiosRequestConfig = null;

    beforeAll(
      () =>
        (_options = _presClient.requestOptions({
          trackingNumber: "PS80558274",
        }))
    );

    it("creates a GET request", () => expect(_options.method).toBe("GET"));

    it("uses the correct URL", () =>
      expect(_options.url).toBe("http://www.prestigedelivery.com/TrackingHandler.ashx?trackingNumbers=PS80558274"));
  });

  describe("integration tests", () => {
    let _package: ITrackitResponseData<IPrestigeRequestOptions> = null;
    let _activity: IActivity = null;

    describe("out for delivery package", () => {
      beforeAll((done) =>
        fs.readFile("test/stub_data/prestige_delivered.json", "utf8", (err, doc) => {
          handleError(err);
          _presClient.presentResponse(doc).then(({ err: respErr, data: resp }) => {
            expect(respErr).toBeFalsy();
            _package = resp;
            done();
          }, handleError);
        })
      );

      it("has a status of delivered", () => expect(_package.status).toBe(STATUS_TYPES.DELIVERED));

      it("has an eta of Oct 20", () => expect(_package.eta).toEqual(new Date("2015-10-20T00:00:00.000Z")));

      it("has a destination of Bloomfield Hills", () =>
        expect(_package.destination).toBe("Bloomfield Hills, MI 48304-3264"));

      describe("has one activity", () => {
        beforeAll(() => {
          _activity = _package.activities[0];
          expect(_activity).toBeDefined();
        });

        it("with timestamp Oct 19th, 2:39pm", () =>
          expect(_activity.timestamp).toEqual(new Date("2015-10-19T14:39:00Z")));

        it("with location Taylor, MI", () => expect(_activity.location).toBe("Taylor, MI 48180"));

        it("with details Out-for-delivery", () => expect(_activity.details).toBe("Delivered"));
      });

      describe("has next activity", () => {
        beforeAll(() => {
          _activity = _package.activities[1];
          expect(_activity).toBeDefined();
        });

        it("with timestamp Oct 19th, 12:53pm", () =>
          expect(_activity.timestamp).toEqual(new Date("2015-10-19T12:53:00Z")));

        it("with location Taylor, MI", () => expect(_activity.location).toBe("Taylor, MI 48180"));

        it("with details Out-for-delivery", () => expect(_activity.details).toBe("Out for delivery"));
      });

      describe("has another activity", () => {
        beforeAll(() => {
          _activity = _package.activities[2];
          expect(_activity).toBeDefined();
        });

        it("with timestamp Oct 19th, 6:31am", () =>
          expect(_activity.timestamp).toEqual(new Date("2015-10-19T06:31:00Z")));

        it("with location Taylor, MI", () => expect(_activity.location).toBe("Taylor, MI 48180"));

        it("with details Out-for-delivery", () => expect(_activity.details).toBe("Shipment received by carrier"));
      });

      describe("has first activity", () => {
        beforeAll(() => {
          _activity = _package.activities[3];
          expect(_activity).toBeDefined();
        });

        it("with timestamp Oct 18th, 3:55pm", () =>
          expect(_activity.timestamp).toEqual(new Date("2015-10-18T15:55:00Z")));

        it("with location Taylor, MI", () => expect(_activity.location).toBe("Jeffersonville, IN 47130"));

        it("with details Out-for-delivery", () =>
          expect(_activity.details).toBe("Prestige has not yet received this shipment"));
      });
    });
  });
});
