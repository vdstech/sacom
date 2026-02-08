import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import pino from 'pino'
import pinoHttp from 'pino-http'
import https from 'https'
import http from 'http'
import cors from "cors";
import { createProxyMiddleware } from 'http-proxy-middleware'
import { getTlsOptions } from './tls.js'

if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

const app = express()
const insecureHttpsAgent = new https.Agent({ rejectUnauthorized: false })

const TRUST_PROXY = String(process.env.TRUST_PROXY || 'false').toLowerCase() === 'true';
if (TRUST_PROXY) app.set('trust proxy', 1);

app.use(helmet())
app.use(helmet.hsts({
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
}))

const logger = pino({base: {service: 'gateway-svc'}})
app.use(pinoHttp({logger}))

const corsOptions = {
  origin: ["http://localhost:3000", "https://localhost:3000"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

const AUTH_SVC_URL = process.env.AUTH_SVC_URL || 'https://localhost:4443'
const CATALOG_SVC_URL = process.env.CATALOG_SVC_URL || 'https://localhost:4444'
const PRODUCT_SVC_URL = process.env.PRODUCT_SVC_URL || 'https://localhost:4445'
const NAVIGATION_SVC_URL = process.env.NAVIGATION_SVC_URL || 'https://localhost:4446'

const proxyOptions = (target, mountPath) => ({
  target,
  changeOrigin: true,
  secure: false,
  agent: insecureHttpsAgent,
  logLevel: process.env.PROXY_LOG_LEVEL || 'warn',
  pathRewrite: (path) => `${mountPath}${path}`
})

app.use('/api/admin/navigation', createProxyMiddleware(proxyOptions(NAVIGATION_SVC_URL, '/api/admin/navigation')))
app.use('/api/store', createProxyMiddleware(proxyOptions(NAVIGATION_SVC_URL, '/api/store')))
app.use('/api/categories', createProxyMiddleware(proxyOptions(CATALOG_SVC_URL, '/api/categories')))
app.use('/api/admin/products', createProxyMiddleware(proxyOptions(PRODUCT_SVC_URL, '/api/admin/products')))
app.use('/products', createProxyMiddleware(proxyOptions(PRODUCT_SVC_URL, '/products')))
app.use('/api/admin', createProxyMiddleware(proxyOptions(AUTH_SVC_URL, '/api/admin')))
app.use('/auth', createProxyMiddleware(proxyOptions(AUTH_SVC_URL, '/auth')))
app.use('/api', createProxyMiddleware(proxyOptions(AUTH_SVC_URL, '/api')))

app.get('/health', (req, res) => {
  res.json({ok: true, service: 'gateway-svc', time: new Date().toISOString()})
})

const port = process.env.PORT || 4000
const redirectServer = String(process.env.REDIRECT_SERVER || 'false').toLowerCase() === 'true'
const httpPort = process.env.HTTP_PORT || 4001
const tlsOptions = getTlsOptions()
https.createServer(tlsOptions, app).listen(port, () => {
  logger.info(`Gateway Service running on port ${port} with TLS`)
})

if (redirectServer) {
  http.createServer((req, res) => {
    const host = req.headers.host || `localhost:${port}`
    const targetHost = host.includes(':') ? host.split(':')[0] + `:${port}` : `${host}:${port}`
    const location = `https://${targetHost}${req.url}`
    res.writeHead(301, { Location: location })
    res.end()
  }).listen(httpPort, () => {
    logger.info(`Gateway HTTP redirect server listening on port ${httpPort}`)
  })
}
