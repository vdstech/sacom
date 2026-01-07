import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import pino from 'pino'
import pinoHttp from 'pino-http'
import cors from "cors";
import { createProxyMiddleware } from 'http-proxy-middleware'

const app = express()

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

app.use(cors({
  origin: ["http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

const corsOptions = {
  origin: ["http://localhost:3000"],
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

const proxyOptions = (target) => ({
  target,
  changeOrigin: true,
  secure: false,
  logLevel: process.env.PROXY_LOG_LEVEL || 'warn'
})

app.use('/api/admin/navigation', createProxyMiddleware(proxyOptions(NAVIGATION_SVC_URL)))
app.use('/api/store', createProxyMiddleware(proxyOptions(NAVIGATION_SVC_URL)))
app.use('/api/categories', createProxyMiddleware(proxyOptions(CATALOG_SVC_URL)))
app.use('/products', createProxyMiddleware(proxyOptions(PRODUCT_SVC_URL)))
app.use('/api/admin', createProxyMiddleware(proxyOptions(AUTH_SVC_URL)))
app.use('/auth', createProxyMiddleware(proxyOptions(AUTH_SVC_URL)))
app.use('/api', createProxyMiddleware(proxyOptions(AUTH_SVC_URL)))

app.get('/health', (req, res) => {
  res.json({ok: true, service: 'gateway-svc', time: new Date().toISOString()})
})

const port = process.env.PORT || 4000
app.listen(port, () => {
  logger.info(`Gateway Service running on port ${port}`)
})
