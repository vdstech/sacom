import fs from 'fs'
import path from 'path'
import url from 'url'
import pino from 'pino'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const logger = pino({ base: { service: 'catalog-svc', module: 'tls' } })

export function getTlsOptions() {
    const certPath = process.env.TLS_CERT_PATH
    const keyPath = process.env.TLS_KEY_PATH

    logger.info('The cert path is ', certPath)
    if (!certPath || !keyPath) {
        logger.warn('TLS configuration skipped - TLS_CERT_PATH and TLS_KEY_PATH not set')
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
