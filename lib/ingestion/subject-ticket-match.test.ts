import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractTicketNoFromSubject } from "./subject-ticket-match";

describe("extractTicketNoFromSubject", () => {
  it("extracts a 12-digit ticket number wrapped in brackets", () => {
    assert.equal(extractTicketNoFromSubject("[260915103001] Leave request"), "260915103001");
  });

  it("extracts from anywhere in the subject, e.g. a reply prefix before the bracket", () => {
    assert.equal(extractTicketNoFromSubject("RE: [260915103001] Leave request"), "260915103001");
  });

  it("returns null when there is no bracketed ticket number", () => {
    assert.equal(extractTicketNoFromSubject("Leave request"), null);
  });

  it("does not match a bracketed number of the wrong length", () => {
    assert.equal(extractTicketNoFromSubject("[12345] Leave request"), null);
    assert.equal(extractTicketNoFromSubject("[2609151030012] Leave request"), null);
  });

  it("does not match digits that aren't bracketed", () => {
    assert.equal(extractTicketNoFromSubject("260915103001 Leave request"), null);
  });
});
