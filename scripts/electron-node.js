process.env.ELECTRON_RUN_AS_NODE = '1'
const { spawnSync } = require('child_process')
const electron = require('electron')
const r = spawnSync(String(electron), process.argv.slice(2), {
  stdio: 'inherit',
  env: process.env,
  windowsHide: true
})
process.exit(r.status ?? 1)
