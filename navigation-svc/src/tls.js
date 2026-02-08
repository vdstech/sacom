import fs from 'fs'
import pino from 'pino'

const logger = pino({ base: { service: 'navigation-svc', module: 'tls' } })

export function getTlsOptions() {
    const certPath = process.env.TLS_CERT_PATH || '../auth-svc/certs/localhost.crt'
    const keyPath = process.env.TLS_KEY_PATH || '../auth-svc/certs/localhost.key'

    logger.info('The cert path is ', certPath)
    if (!certPath || !keyPath) {
        throw new Error('TLS_CERT_PATH and TLS_KEY_PATH environment variables must be set for TLS configuration')
    }

    logger.info({ certPath, keyPath }, 'Loading TLS certificates')

    try {
        const tlsOptions = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath)
        }
        logger.info('TLS certificates loaded successfully')
        return tlsOptions
    } catch (err) {
        logger.error({ err, certPath, keyPath }, 'Failed to read TLS certificate files')
        throw err
    }
}
