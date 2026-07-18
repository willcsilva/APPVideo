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

    if (response.ok && data.access_token) {
      token = data.access_token;

      localStorage.setItem("jwt", token);

      document.getElementById("login-status").innerHTML =
        "<p class='online'>✅ Login realizado com sucesso</p>";

      document.getElementById("login-btn").style.display =
        "none";

      document.getElementById("register-btn").style.display =
        "none";

      document.getElementById("logout-btn").style.display =
        "block";

      loadVideos();

    } else {
      document.getElementById("login-status").innerHTML =
        `<p class="error">❌ ${data.error || "Login inválido"}</p>`;
    }

  } catch (error) {
    console.error(error);

    document.getElementById("login-status").innerHTML =
      "<p class='error'>❌ Erro ao conectar com Auth Service</p>";
  }
}

let token =
  localStorage.getItem("jwt");

if (token) {

  document.getElementById("login-btn").style.display =
    "none";

  document.getElementById("register-btn").style.display =
    "none";

  document.getElementById("logout-btn").style.display =
    "block";

}

async function register() {
  try {

    const email =
      document.getElementById("email").value;

    const password =
      document.getElementById("password").value;

    const response = await fetch(
      `${AUTH_URL}/register`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          email,
          password
        })
      }
    );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Erro ao cadastrar usuário"
      );
    }

    alert(
      "Usuário criado com sucesso!"
    );

  } catch (error) {

    console.error(error);

    alert(
      error.message ||
      "Erro ao cadastrar usuário"
    );

  }
}

function logout() {

  localStorage.removeItem("jwt");

  token = null;

  location.reload();

}

async function uploadVideo() {

  if (!token) {
    alert("Faça login primeiro.");
    return;
  }

  const files =
    document.getElementById("videoFile").files;

  if (!files || files.length === 0) {
    alert("Selecione pelo menos um vídeo.");
    return;
  }

  if (files.length > 5) {
    alert(
      "É permitido enviar no máximo 5 vídeos."
    );
    return;
  }

  const allowedExtensions = [
    ".mp4",
    ".mov"
  ];

  const MAX_FILE_SIZE =
    50 * 1024 * 1024;

  const formData = new FormData();

  for (const file of files) {

    const fileName =
      file.name.toLowerCase();

    const validExtension =
      allowedExtensions.some(ext =>
        fileName.endsWith(ext)
      );

    if (!validExtension) {

      alert(
        `${file.name} não é MP4 ou MOV`
      );

      return;
    }

    if (file.size > MAX_FILE_SIZE) {

      alert(
        `${file.name} excede 50 MB`
      );

      return;
    }

    formData.append(
      "files",
      file
    );

  }

  try {

    const response = await fetch(
      `${UPLOAD_URL}/videos`,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${token}`
        },
        body: formData
      }
    );

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data.error ||
        data.message ||
        "Erro ao realizar upload"
      );

    }

    document.getElementById(
      "upload-result"
    ).innerHTML = `
      <p class="online">
        ✅ ${data.total} vídeo(s)
        enviado(s) com sucesso
      </p>
    `;

    loadVideos();

  } catch (error) {

    console.error(error);

    document.getElementById(
      "upload-result"
    ).innerHTML = `
      <p class="error">
        ❌ ${error.message}
      </p>
    `;

  }

}

async function loadStatus() {

  try {

    const response = await fetch(
      `${STATUS_URL}/status`
    );

    const data =
      await response.json();

    document.getElementById(
      "infra-status"
    ).innerHTML = `
      <div class="info-row">
        <span class="info-label">
          API:
        </span>

        <span class="online">
          ${data.services.api}
        </span>
      </div>

      <div class="info-row">
        <span class="info-label">
          Database:
        </span>

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

    console.error(error);

    document.getElementById(
      "infra-status"
    ).innerHTML = `
      <p class="error">
        ❌ Status Service indisponível
      </p>
    `;
  }
}

async function loadVideos() {

  if (!token) {
    return;
  }

  try {

    const response = await fetch(
      `${UPLOAD_URL}/videos`,
      {
        headers: {
          Authorization:
            `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        "Erro ao carregar vídeos"
      );
    }

    const data =
      await response.json();

    const table =
      document.getElementById(
        "video-table"
      );

    table.innerHTML = "";

    if (
      !data.items ||
      data.items.length === 0
    ) {

      table.innerHTML = `
        <tr>
          <td colspan="3">
            Nenhum vídeo enviado
          </td>
        </tr>
      `;

      return;
    }

    data.items.forEach(video => {

      let statusClass =
        "status-received";

      if (
        video.status === "PROCESSING"
      ) {
        statusClass =
          "status-processing";
      }

      if (
        video.status === "COMPLETED" ||
        video.status === "DONE"
      ) {
        statusClass =
          "status-completed";
      }

      if (
        video.status === "FAILED" ||
        video.status === "ERROR"
      ) {
        statusClass =
          "status-error";
      }

      table.innerHTML += `
        <tr>

          <td>
            ${video.file_name}
          </td>

          <td>
            <span
              class="status-badge ${statusClass}">
              ${video.status}
            </span>
          </td>

          <td>
            ${
              video.zip_path
                ? `
                  <button
                    onclick="downloadZip('${video.video_id}')"
                  >
                    📦 Download ZIP
                  </button>
                `
                : "-"
            }
          </td>

          <td>
            <button
              onclick="downloadVideo('${video.video_id}')"
            >
              📹 Download Vídeo
            </button>
          </td>

        </tr>
      `;
    });

  } catch (error) {
    console.error(error);
  }
}

loadStatus();

setInterval(
  loadStatus,
  1000
);

setInterval(
  loadVideos,
  1000
);

function downloadVideo(videoId) {

  if (!token) {
    return;
  }

  fetch(
    `/videos/${videoId}/download`,
    {
      headers: {
        Authorization:
          `Bearer ${token}`
      }
    }
  )
  .then(async response => {

  if (!response.ok) {
    throw new Error(
      "Erro ao baixar vídeo"
    );
  }

  const contentDisposition =
    response.headers.get(
      "content-disposition"
    );

  let fileName =
    `video-${videoId}.mov`;

  if (contentDisposition) {

    const match =
      contentDisposition.match(
        /filename="(.+)"/
      );

    if (
      match &&
      match[1]
    ) {
      fileName = match[1];
    }

  }

  const blob =
    await response.blob();

  return {
    blob,
    fileName
  };

})
.then(({ blob, fileName }) => {

    const url =
      window.URL.createObjectURL(blob);

    const a =
      document.createElement("a");

    a.href = url;

    console.log("Video filename:", fileName);
    a.download = fileName;

    document.body.appendChild(a);

    a.click();

    a.remove();

    window.URL
      .revokeObjectURL(url);

  })
  .catch(error => {

    console.error(error);

    alert(
      "Erro ao baixar vídeo"
    );

  });
}

function downloadZip(videoId) {

  if (!token) {
    return;
  }

  fetch(
    `/videos/${videoId}/download-zip`,
    {
      headers: {
        Authorization:
          `Bearer ${token}`
      }
    }
  )
  .then(async response => {

  if (!response.ok) {
    throw new Error(
      "Erro ao baixar ZIP"
    );
  }

  const contentDisposition =
    response.headers.get(
      "content-disposition"
    );

  let fileName =
    `video-${videoId}-fragments.zip`;

  if (contentDisposition) {

    const match =
      contentDisposition.match(
        /filename="(.+)"/
      );

    if (
      match &&
      match[1]
    ) {
      fileName = match[1];
    }

  }

  const blob =
    await response.blob();

  return {
    blob,
    fileName
  };

})
.then(({ blob, fileName }) => {

  const url =
    window.URL.createObjectURL(blob);

  const a =
    document.createElement("a");

  a.href = url;

  console.log(fileName);

  a.download = fileName;

  document.body.appendChild(a);

  a.click();

  a.remove();

  window.URL.revokeObjectURL(url);

})
  .catch(error => {

    console.error(error);

    alert(
      "Erro ao baixar ZIP"
    );

  });

}