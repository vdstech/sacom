import fs from 'fs'
import pino from 'pino'

const logger = pino({ base: { service: 'gateway-svc', module: 'tls' } })

export function getTlsOptions() {
  const certPath = process.env.TLS_CERT_PATH || '../auth-svc/certs/localhost.crt'
  const keyPath = process.env.TLS_KEY_PATH || '../auth-svc/certs/localhost.key'

  try {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    }
  } catch (err) {
    logger.error({ err, certPath, keyPath }, 'Failed to read TLS certificate files')
    throw err
  }
}
