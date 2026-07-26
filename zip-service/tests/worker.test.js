import {
  extractProcessedKey
} from "../src/worker.js";

describe("Zip Service", () => {

  test("remove prefixo do bucket", () => {

    const result =
      extractProcessedKey(
        "processed-images/frame-001.jpg"
      );

    expect(result)
      .toBe("frame-001.jpg");

  });

  test("mantém caminho sem prefixo", () => {

    const result =
      extractProcessedKey(
        "frame-001.jpg"
      );

    expect(result)
      .toBe("frame-001.jpg");

  });

});