# 🎬 Cinemateca — Seu tracker de filmes com IA

App estilo Tinder para descobrir e avaliar filmes, com recomendações por IA.

---

## ⚙️ Configuração (5 minutos)

### 1. Chave TMDB (capas e filmes infinitos — grátis)
1. Acesse **https://www.themoviedb.org**
2. Clique em "Join TMDB" e crie uma conta
3. Confirme o e-mail
4. Vá em: **Configurações (ícone do perfil) → API**
5. Clique em "Criar" → escolha **Developer**
6. Preencha os campos (pode colocar "uso pessoal")
7. Copie a **API Key (v3 auth)**

### 2. Chave Gemini (IA de recomendações — grátis)
1. Acesse **https://aistudio.google.com**
2. Faça login com sua conta Google
3. Clique em **"Get API Key"** no menu lateral
4. Clique em **"Create API key"**
5. Copie a chave gerada

### 3. Cole as chaves no app
Abra o arquivo **`config.js`** e substitua:
```js
TMDB_KEY:   "SUA_CHAVE_TMDB_AQUI",
GEMINI_KEY: "SUA_CHAVE_GEMINI_AQUI",
```

---

## 🚀 Publicar no GitHub Pages (grátis)

1. Crie uma conta em **https://github.com**
2. Clique em **"New repository"**
3. Nome: `cinemateca` (ou qualquer nome)
4. Marque **Public** → clique em **Create repository**
5. Clique em **"uploading an existing file"**
6. Arraste TODOS os arquivos desta pasta
7. Clique em **"Commit changes"**
8. Vá em **Settings → Pages**
9. Em "Source" selecione **Deploy from a branch → main → / (root)**
10. Clique em **Save**
11. Aguarde ~2 minutos e acesse: `https://SEU_USUARIO.github.io/cinemateca`

---

## 📱 Instalar no celular como app

### Android (Chrome):
- Abra o link no Chrome
- Toque no menu (⋮) → **"Adicionar à tela inicial"**

### iPhone (Safari):
- Abra o link no Safari
- Toque em **Compartilhar (□↑)** → **"Adicionar à Tela de Início"**

---

## 🎮 Como usar

| Gesto | Ação |
|-------|------|
| Deslizar direita | ❤️ Amei |
| Deslizar esquerda | 👎 Não curti |
| Deslizar para cima | 👁️ Não vi ainda |
| Botão ✨ | Pedir recomendação da IA |

---

## 📁 Arquivos do projeto

```
cinemateca/
├── index.html     ← estrutura do app
├── style.css      ← visual (tema escuro estilo cinema)
├── app.js         ← lógica: swipe, TMDB, Gemini, storage
├── config.js      ← suas chaves de API ← PREENCHA AQUI
├── manifest.json  ← configuração PWA
├── sw.js          ← service worker (funciona offline)
└── README.md      ← este arquivo
```

---

## 💾 Seus dados

Tudo fica salvo no **localStorage** do seu navegador/celular.
Não vai a servidor nenhum — é 100% seu.

Se limpar o cache do navegador, perde os dados.
(Dica: instale como PWA — é mais estável)
