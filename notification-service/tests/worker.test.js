import {
  calculateBackoffSeconds,
  buildNotification
} from "../src/worker.js";

describe("Notification Service", () => {

  test("Backoff primeira tentativa", () => {
    expect(
      calculateBackoffSeconds(1)
    ).toBe(10);
  });

  test("Backoff segunda tentativa", () => {
    expect(
      calculateBackoffSeconds(2)
    ).toBe(30);
  });

  test("Backoff terceira tentativa", () => {
    expect(
      calculateBackoffSeconds(3)
    ).toBe(60);
  });

  test("Backoff quarta tentativa", () => {
    expect(
      calculateBackoffSeconds(4)
    ).toBe(120);
  });

  test("Backoff acima da quarta tentativa", () => {
    expect(
      calculateBackoffSeconds(10)
    ).toBe(300);
  });

  test("VIDEO_RECEIVED gera notificação", () => {

    const notification =
      buildNotification(
        "VIDEO_RECEIVED",
        {
          video_id: "123"
        }
      );

    expect(notification).not.toBeNull();

    expect(
      notification.subject
    ).toContain("Vídeo recebido");

  });

  test("Evento desconhecido retorna null", () => {

    expect(
      buildNotification(
        "EVENTO_INVALIDO",
        {}
      )
    ).toBeNull();

  });

});