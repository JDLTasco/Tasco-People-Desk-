import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aggregateAddresses, suggestAddresses, type AddressSighting } from "./address-book";

const d = (s: string) => new Date(s);
const s = (o: Partial<AddressSighting> & { email: string }): AddressSighting => ({
  source: "REQUESTER",
  ticketId: "t1",
  ticketNo: "261003000001",
  at: d("2026-10-01T00:00:00Z"),
  ...o,
});

describe("aggregateAddresses", () => {
  it("merges the same address case-insensitively, collecting sources and tickets", () => {
    const [e] = aggregateAddresses([
      s({ email: "Jo.Bloggs@tasco.com.au", name: "Jo Bloggs" }),
      s({ email: "jo.bloggs@tasco.com.au", source: "CC", ticketId: "t2", ticketNo: "261003000002" }),
    ]);
    assert.equal(e.email, "jo.bloggs@tasco.com.au");
    assert.equal(e.name, "Jo Bloggs");
    assert.deepEqual(e.sources, ["REQUESTER", "CC"]);
    assert.equal(e.ticketCount, 2);
  });

  it("leaves out HR's own addresses and non-addresses", () => {
    const out = aggregateAddresses([
      s({ email: "hrtickets@tascopetroleum.com.au" }),
      s({ email: "HumanResources@tascopetroleum.com.au" }),
      s({ email: "not an email" }),
      s({ email: "ok@x.com" }),
    ]);
    assert.deepEqual(out.map((e) => e.email), ["ok@x.com"]);
  });

  it("counts emails sent by HR and remembers who sent the latest", () => {
    const [e] = aggregateAddresses([
      s({ email: "mgr@x.com", source: "EMAILED_BY_HR", at: d("2026-10-01T00:00:00Z"), sentBy: "Lisa Ferguson" }),
      s({ email: "mgr@x.com", source: "EMAILED_BY_HR", at: d("2026-10-02T00:00:00Z"), sentBy: "Dianne Nichols" }),
    ]);
    assert.equal(e.timesEmailedByHr, 2);
    assert.equal(e.lastEmailedByHrBy, "Dianne Nichols");
    assert.equal(e.lastEmailedByHrAt?.toISOString(), "2026-10-02T00:00:00.000Z");
  });

  it("ignores a 'name' that is just the address", () => {
    const [e] = aggregateAddresses([s({ email: "a@x.com", name: "a@x.com" })]);
    assert.equal(e.name, null);
  });

  it("puts the most-used addresses first", () => {
    const out = aggregateAddresses([
      s({ email: "once@x.com" }),
      s({ email: "twice@x.com", ticketId: "t1" }),
      s({ email: "twice@x.com", ticketId: "t2" }),
    ]);
    assert.equal(out[0].email, "twice@x.com");
  });
});

describe("suggestAddresses", () => {
  const book = aggregateAddresses([
    s({ email: "jo.bloggs@tasco.com.au", name: "Jo Bloggs", ticketId: "a" }),
    s({ email: "sam.jones@tasco.com.au", name: "Sam Jones", ticketId: "b" }),
    s({ email: "jones.family@gmail.com", ticketId: "c" }),
  ]);

  it("matches the start of the address, the name, or a word in the name", () => {
    assert.deepEqual(suggestAddresses(book, "jo").map((x) => x.email), ["jo.bloggs@tasco.com.au", "jones.family@gmail.com", "sam.jones@tasco.com.au"]);
    assert.deepEqual(suggestAddresses(book, "sam").map((x) => x.email), ["sam.jones@tasco.com.au"]);
  });

  it("returns nothing for an empty query", () => {
    assert.deepEqual(suggestAddresses(book, " "), []);
  });
});
