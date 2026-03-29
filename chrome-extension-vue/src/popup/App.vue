<script setup lang="ts">
import { ref, onMounted } from 'vue'

type State = 'idle' | 'loading' | 'done' | 'error'

const state = ref<State>('idle')
const errorMessage = ref('')

onMounted(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url ?? ''
    if (url.startsWith('https://chrome.google.com')) {
      state.value = 'error'
      errorMessage.value = "You can't run this extension in the Chrome Web Store. Please try another URL."
    }
  })
})

async function capture() {
  state.value = 'loading'
  chrome.runtime.sendMessage({ inject: true }, () => {
    state.value = 'done'
  })
}
</script>

<template>
  <div class="popup">
    <img src="../../assets/logo.png" class="logo" alt="HTML to Figma" />

    <div v-if="state === 'error'" class="error">
      {{ errorMessage }}
    </div>

    <div v-else-if="state === 'done'" class="done">
      <p class="done__title">✅ Done!</p>
      <p class="done__text">
        Now grab the
        <a href="https://www.figma.com/c/plugin/747985167520967365/HTML-To-Figma" target="_blank">Figma plugin</a>
        and choose "Upload here" to import the downloaded <code>page.figma.json</code> into your Figma document.
      </p>
    </div>

    <div v-else-if="state === 'loading'" class="loading">
      <div class="spinner" />
    </div>

    <button v-else class="btn" @click="capture">
      Capture page
    </button>

    <!-- <footer>
      <a href="link" target="_blank">Feedback</a>
      <span class="divider" />
      <a href="link" target="_blank">Source</a>
    </footer> -->
  </div>
</template>

<style scoped>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.popup {
  width: 400px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  font-family: sans-serif;
}

.logo {
  height: 61px;
  width: 250px;
  object-fit: contain;
}

.error {
  width: 100%;
  padding: 15px;
  color: #a94442;
  border-radius: 4px;
  background-color: #f2dede;
  border: 1px solid #ebccd1;
  text-align: center;
  font-size: 14px;
}

.done {
  width: 100%;
  padding: 20px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  text-align: center;
}

.done__title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 10px;
}

.done__text {
  font-size: 13px;
  color: #444;
  line-height: 1.6;
}

.done__text a {
  color: #7b61ff;
  text-decoration: none;
}

.loading {
  display: flex;
  justify-content: center;
  padding: 20px 0;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #e0e0e0;
  border-top-color: #7b61ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.btn {
  width: 100%;
  padding: 14px;
  font-size: 15px;
  font-weight: 600;
  color: white;
  background-color: #7b61ff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn:hover {
  background-color: #6a52e0;
}

footer {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #999;
  margin-top: 10px;
}

footer a {
  color: #999;
  text-decoration: none;
}

footer a:hover {
  text-decoration: underline;
}

.divider {
  display: inline-block;
  width: 1px;
  height: 10px;
  background: #ccc;
}
</style>
