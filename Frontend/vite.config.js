import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    // Força o Vite a unificar e usar sempre a mesma cópia física do React e React-DOM
    dedupe: ['react', 'react-dom'] 
  }
})
