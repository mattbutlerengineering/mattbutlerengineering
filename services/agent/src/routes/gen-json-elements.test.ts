import { describe, expect, it } from "vitest";
import { completeJsonElements } from "./gen-json-elements.js";

describe("completeJsonElements", () => {
  it("returns elements whose objects are closed and waits on the trailing one", () => {
    const done = '{"key":"a","type":"Input","props":{"label":"Field 1"}}';
    const partial = '{"elements":[' + done + ',{"key":"b","props":{"label":"Fie';
    expect(completeJsonElements(partial)).toEqual([
      { key: "a", type: "Input", props: { label: "Field 1" } },
    ]);
  });

  it("returns every element once the array is finished", () => {
    const buffer =
      '{"elements":[{"key":"a","type":"Text","props":{"children":"Hi {there}"}},{"key":"b","type":"Button","props":{"label":"Go"}}]}';
    expect(completeJsonElements(buffer)).toHaveLength(2);
  });

  it("returns nothing until the elements array has started", () => {
    expect(completeJsonElements('{"elements"')).toEqual([]);
  });
});
