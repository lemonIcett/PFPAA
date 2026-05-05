/**
 * PFPA pm2 ecosystem config
 * Run: pm2 start pm2.config.js
 * Auto-start on boot: pm2 startup && pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'pfpa-engine',
      script: 'electron',
      args: '.',
      interpreter: 'none',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        PFPA_HEADLESS: 'true',
        DISPLAY: ':0'  // needed on Linux for Electron
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '~/.pfpa/logs/error.log',
      out_file: '~/.pfpa/logs/out.log',
      merge_logs: true,
    }
  ]
}
