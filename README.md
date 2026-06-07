# 🎬 Sistema de Processamento de Vídeos

## 📌 Descrição

Sistema distribuído de processamento de vídeos desenvolvido com arquitetura de microsserviços, capaz de receber vídeos, processar frames, gerar arquivos `.zip` e notificar usuários sobre o status do processamento.

O sistema foi projetado com foco em:

- Escalabilidade
- Resiliência
- Processamento assíncrono
- Automação de deploy (CI/CD)
- Qualidade de código (SonarCloud)

---

## 🏗️ Arquitetura

O sistema segue um modelo **event-driven**, utilizando filas para desacoplamento entre serviços.

### Fluxo principal:
Upload → Fila → Worker → Zip → Notificação → Status

---

## 🧩 Microserviços

| Serviço | Responsabilidade |
|--------|----------------|
| auth-service | Autenticação de usuários (JWT) |
| upload-service | Upload de vídeos e envio para fila |
| video-worker | Processamento de frames |
| zip-service | Geração do arquivo .zip |
| notification-service | Notificação de sucesso/erro |
| status-service | Consulta de status do sistema |

---

## 🧰 Stack Tecnológica

- **Backend:** Node.js
- **Orquestração:** Kubernetes
- **Mensageria:** AWS SQS (LocalStack)
- **Storage:** S3 (LocalStack)
- **Banco:** PostgreSQL
- **Cache:** Redis
- **Containers:** Docker
- **CI/CD:** GitHub Actions
- **Qualidade:** SonarCloud

---

## 🔄 Fluxo do Sistema

1. Usuário envia vídeo via API
2. Upload Service salva no S3
3. Evento é enviado para a fila (SQS)
4. Worker processa o vídeo
5. Zip Service gera arquivo compactado
6. Notification Service envia alerta (mock SES)
7. Status Service permite consulta do progresso

---

## 🔐 Segurança

- Autenticação via JWT
- Secrets gerenciados no Kubernetes
- Análise de segurança com SonarCloud

---

## 📈 Escalabilidade

- HPA para serviços HTTP
- Workers desacoplados via fila
- Escala horizontal suportada

---

## ♻️ Resiliência

- Retry com backoff
- Dead Letter Queue (DLQ)
- Tolerância a falhas distribuídas

---

## 🚀 CI/CD Pipeline

Pipeline automatizado com:

- Build
- Testes automatizados
- Análise SonarCloud
- Build de imagens Docker
- Push para Docker Hub
- Deploy automático no Kubernetes

---

## 🧪 Testes

- Testes unitários
- Testes de integração (PostgreSQL em container)
- Validação automática no pipeline

---

## 📡 Endpoint de Status

Endpoint para verificação de saúde do sistema:

GET /status

Exemplo de resposta:


{
  "status": "ok",
  "services": {
    "api": "ok",
    "database": "ok"
  }
}

---

## 🐳 Execuçao Local

docker build -t status-service .
docker run -p 3005:3005 status-service

## ☁️ Deploy

kubectl apply -f k8s/

---

# 🧠 📊 DIAGRAMA DE ARQUITETURA

Aqui está seu diagrama profissional:

![Arquitetura](blob:https://m365.cloud.microsoft/47a5c33a-8ec4-41e8-a41b-942595caf672)

---
