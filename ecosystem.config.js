module.exports = {
  apps: [{
    name: 'rise-server',
    script: 'npm',
    args: 'start',
    cwd: './Backend',
    env_file: './Backend/.env'
  }]
}
