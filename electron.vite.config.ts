import { readFileSync } from 'fs'
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { loadDotEnv } from './electron/main/env'

loadDotEnv()

function bakeEnv(value: string | undefined): string {
  return JSON.stringify(String(value || '').trim().replace(/[\r\n]+/g, ''))
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  ''

const supabaseDefine = {
  'import.meta.env.SUPABASE_URL': bakeEnv(supabaseUrl),
  'import.meta.env.NEXT_PUBLIC_SUPABASE_URL': bakeEnv(
    process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseUrl
  ),
  'import.meta.env.SUPABASE_ANON_KEY': bakeEnv(supabaseKey),
  'import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': bakeEnv(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || supabaseKey
  ),
  'import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY': bakeEnv(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || supabaseKey
  )
}

const win32Bootstrap = readFileSync(resolve(__dirname, 'electron/main/win32Bootstrap.cjs'), 'utf8')

function prependWin32Bootstrap(): Plugin {
  return {
    name: 'prepend-win32-bootstrap',
    apply: 'build',
    generateBundle(_opts, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry) {
          chunk.code = `${win32Bootstrap}\n${chunk.code}`
        }
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [prependWin32Bootstrap(), externalizeDepsPlugin()],
    envPrefix: ['VITE_', 'SUPABASE_', 'NEXT_PUBLIC_'],
    define: supabaseDefine,
    resolve: {
      alias: {
        '@shared': resolve('shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: 'src',
    resolve: {
      alias: {
        '@': resolve('src'),
        '@shared': resolve('shared')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/index.html')
      }
    }
  }
})
