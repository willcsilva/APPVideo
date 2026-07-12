const AUTH_URL = "/auth";
const UPLOAD_URL = "";
const STATUS_URL = "";

let token = localStorage.getItem("jwt");

async function login() {
  try {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const response = await fetch(`${AUTH_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password
      })
    });

    const data = await response.json();

    if (data.access_token) {
      token = data.access_token;

      localStorage.setItem("jwt", token);

      document.getElementById("login-status").innerText =
        "<p class='online'>✅ Login realizado com sucesso</p>";

      loadVideos();

    } else {
      document.getElementById("login-status").innerText =
        "<p class='error'>❌ Login inválido</p>";
    }

  } catch (error) {
    console.error(error);

    document.getElementById("login-status").innerText =
      "<p class='error'>❌ Erro ao conectar com Auth Service</p>";
  }
}

async function uploadVideo() {

  if (!token) {
    alert("Faça login primeiro.");
    return;
  }

  const file = document.getElementById("videoFile").files[0];

  if (!file) {
    alert("Selecione um vídeo.");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  try {

    const response = await fetch(`${UPLOAD_URL}/videos`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    const data = await response.json();

    document.getElementById("upload-result").innerText = `
      <p class="online">✅ Upload concluído</p>
      <p><strong>Job:</strong> ${data.job_id}</p>
      <p><strong>Vídeo:</strong> ${data.video_id}</p>
    `;

    loadVideos();

  } catch (error) {

    console.error(error);

    document.getElementById("upload-result").innerText =
      "<p class='error'>❌ Erro ao enviar vídeo</p>";
  }
}

async function loadStatus() {

  try {

    const response = await fetch(`${STATUS_URL}/status`);
    const data = await response.json();

    document.getElementById("infra-status").innerText = `
      <div class="info-row">
        <span class="info-label">API:</span>
        <span class="online">${data.services.api}</span>
      </div>

      <div class="info-row">
        <span class="info-label">Database:</span>
        <span class="${
          data.services.database === "ok"
            ? "online"
            : "error"
        }">
          ${data.services.database}
        </span>
      </div>
    `;

  } catch (error) {

    document.getElementById("infra-status").innerText = `
      <p class="error">
        ❌ Status Service indisponível
      </p>
    `;

    console.error(error);
  }
}

async function loadVideos() {

  if (!token) {
    return;
  }

  try {

    const response = await fetch(`${UPLOAD_URL}/videos`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();

    const table =
      document.getElementById("video-table");

    table.innerText = "";

    if (!data.items || data.items.length === 0) {

      table.innerText = `
        <tr>
          <td colspan="3">
            Nenhum vídeo enviado
          </td>
        </tr>
      `;

      return;
    }

    data.items.forEach(video => {

      let statusClass = "status-received";

      if (video.status === "PROCESSING") {
        statusClass = "status-processing";
      }

      if (
        video.status === "COMPLETED" ||
        video.status === "DONE"
      ) {
        statusClass = "status-completed";
      }

      if (
        video.status === "FAILED" ||
        video.status === "ERROR"
      ) {
        statusClass = "status-error";
      }

      table.innerText += `
        <tr>
          <td>${video.file_name}</td>

          <td>
            <span class="status-badge ${statusClass}">
              ${video.status}
            </span>
          </td>

          <td>
            ${
              video.zip_path
                ? "✅ Disponível"
                : "-"
            }
          </td>
        </tr>
      `;
    });

  } catch (error) {
    console.error(error);
  }
}

loadStatus();

setInterval(loadStatus, 10000);
setInterval(loadVideos, 10000);