import {
  extractKeyFromS3Path
} from "../src/worker.js";

describe("Video Processor Worker", () => {

  test("remove prefixo do bucket", () => {

    const result =
      extractKeyFromS3Path(
        "raw-videos/video.mp4"
      );

    expect(result)
      .toBe("video.mp4");

  });

  test("mantém caminho sem prefixo", () => {

    const result =
      extractKeyFromS3Path(
        "video.mp4"
      );

    expect(result)
      .toBe("video.mp4");

  });

});