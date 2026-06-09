#!/usr/bin/env node
/**
 * Webhook-based deploy server — fallback when GitHub Actions is unavailable.
 *
 * Listens for GitHub `push` events on `main` and runs the deploy script.
 * Runs as a separate pm2 process on port 3001.
 *
 * Setup:
 *   1. Add DEPLOY_WEBHOOK_SECRET to .env.local (any random string, min 32 chars)
 *   2. pm2 start scripts/webhook-deploy.js --name deploy-webhook --env production
 *   3. pm2 save
 *   4. In GitHub → repo Settings → Webhooks → Add webhook:
 *      Payload URL: http://<VPS_IP>:3001/webhook
 *      Content type: application/json
 *      Secret: <same as DEPLOY_WEBHOOK_SECRET>
 *      Events: Just the push event
 */
'use strict'

const http = require('http')
const crypto = require('crypto')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const PORT = parseInt(process.env.DEPLOY_WEBHOOK_PORT || '3001', 10)
const SECRET = process.env.DEPLOY_WEBHOOK_SECRET
const APP_DIR = process.env.DEPLOY_PATH || path.join(__dirname, '..')
const LOG_DIR = process.env.LOG_DIR || '/var/log/content-radar'

if (!SECRET) {
  console.error('[webhook] FATAL: DEPLOY_WEBHOOK_SECRET env var is not set')
  process.exit(1)
}

let deploying = false

function log(msg) {
  const ts = new Date().toISOString()
  const line = `[${ts}] ${msg}\n`
  process.stdout.write(line)
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    fs.appendFileSync(path.join(LOG_DIR, 'webhook-deploy.log'), line)
  } catch {}
}

function verifySignature(rawBody, sigHeader) {
  if (!sigHeader || !sigHeader.startsWith('sha256=')) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sigHeader))
  } catch {
    return false
  }
}

function runDeploy() {
  if (deploying) {
    log('deploy already in progress — skipping duplicate trigger')
    return
  }
  deploying = true
  log('starting deploy')

  const child = spawn('bash', ['-c', `
    set -e
    cd "${APP_DIR}"
    git pull origin main
    npm ci
    npm run build
    npm run db:migrate
    grep -q '^NEXTAUTH_URL=' .env.local \
      && sed -i 's|^NEXTAUTH_URL=.*|NEXTAUTH_URL=https://app.contentradar.app|' .env.local \
      || echo 'NEXTAUTH_URL=https://app.contentradar.app' >> .env.local
    pm2 reload content-radar --update-env
    echo "deploy complete"
  `], { stdio: ['ignore', 'pipe', 'pipe'] })

  child.stdout.on('data', d => log(d.toString().trim()))
  child.stderr.on('data', d => log('stderr: ' + d.toString().trim()))

  child.on('close', code => {
    deploying = false
    if (code === 0) {
      log('deploy succeeded')
    } else {
      log(`deploy FAILED with exit code ${code}`)
    }
  })
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', deploying }))
    return
  }

  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404)
    res.end('not found')
    return
  }

  const sigHeader = req.headers['x-hub-signature-256']
  const event = req.headers['x-github-event']

  const chunks = []
  req.on('data', c => chunks.push(c))
  req.on('end', () => {
    const rawBody = Buffer.concat(chunks)

    if (!verifySignature(rawBody, sigHeader)) {
      log(`rejected request — invalid signature (event=${event})`)
      res.writeHead(401)
      res.end('invalid signature')
      return
    }

    res.writeHead(200)
    res.end('ok')

    if (event !== 'push') return

    let payload
    try { payload = JSON.parse(rawBody.toString()) } catch { return }

    if (payload.ref === 'refs/heads/main') {
      const sha = (payload.after || '').slice(0, 7)
      log(`received push to main (${sha}) — triggering deploy`)
      runDeploy()
    }
  })
})

server.listen(PORT, '0.0.0.0', () => {
  log(`deploy webhook server listening on port ${PORT}`)
  log(`app dir: ${APP_DIR}`)
})

process.on('SIGTERM', () => {
  log('received SIGTERM — shutting down')
  server.close(() => process.exit(0))
})
